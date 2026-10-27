import { Hono } from 'hono';
import { z } from 'zod';
import { createId } from '@mailer/worker-kit/ids';
import { ok, paginated } from '@mailer/worker-kit/envelope';
import { ConflictError, NotFoundError } from '@mailer/worker-kit/errors';
import { paginationQuery, subscriberInput, subscriberPatch } from '@mailer/shared/contracts';
import { parseSubscriberCsv } from '@mailer/shared/csv';
import type { AppEnv } from '../env';
import { decodeKeysetCursor, encodeKeysetCursor } from '../lib/cursor';
import { isUniqueViolation, likePattern, readJson } from '../lib/validation';
import { nowSeconds } from '../lib/time';

type SubscriberRow = {
   id: string;
   email: string;
   first_name: string | null;
   last_name: string | null;
   status: string;
   source: string | null;
   created_at: number;
   unsubscribed_at: number | null;
   deleted_at: number | null;
};

const listQuery = paginationQuery.extend({
   q: z.string().trim().optional(),
   tag: z.string().trim().optional(),
   status: z.string().trim().optional(),
});

const importInput = z.object({
   csv: z.string(),
   tags: z.array(z.string().trim().min(1).max(64)).optional(),
});

const tagAssignment = z.object({ tagId: z.string().trim().min(1) });

const bulkTagsInput = z.object({
   subscriberIds: z.array(z.string().trim().min(1)).min(1),
   add: z.array(z.string().trim().min(1)).optional(),
   remove: z.array(z.string().trim().min(1)).optional(),
});

export const subscriberRoutes = new Hono<AppEnv>();

export type SubscriberTag = { id: string; name: string };

async function loadTagsFor(db: D1Database, ids: string[]): Promise<Map<string, SubscriberTag[]>> {
   const result = new Map<string, SubscriberTag[]>();
   if (ids.length === 0) return result;

   const placeholders = ids.map(() => '?').join(', ');
   const rows = await db
      .prepare(
         `SELECT st.subscriber_id, t.id, t.name
          FROM subscriber_tags st JOIN tags t ON t.id = st.tag_id
          WHERE st.subscriber_id IN (${placeholders})
          ORDER BY t.name`,
      )
      .bind(...ids)
      .all<{ subscriber_id: string; id: string; name: string }>();

   for (const row of rows.results) {
      const tags = result.get(row.subscriber_id) ?? [];
      tags.push({ id: row.id, name: row.name });
      result.set(row.subscriber_id, tags);
   }

   return result;
}

async function findSubscriber(db: D1Database, id: string): Promise<SubscriberRow | null> {
   return db
      .prepare(
         `SELECT id, email, first_name, last_name, status, source, created_at,
                 unsubscribed_at, deleted_at
          FROM subscribers WHERE id = ? AND deleted_at IS NULL`,
      )
      .bind(id)
      .first<SubscriberRow>();
}

async function ensureTag(db: D1Database, name: string, now: number): Promise<string> {
   const normalised = name.trim().toLowerCase();
   await db
      .prepare(
         `INSERT INTO tags (id, name, created_at) VALUES (?, ?, ?)
         ON CONFLICT(name) DO NOTHING`,
      )
      .bind(createId('tag'), normalised, now)
      .run();

   const row = await db
      .prepare('SELECT id FROM tags WHERE name = ?')
      .bind(normalised)
      .first<{ id: string }>();

   if (row === null) {
      throw new NotFoundError('Tag not found');
   }

   return row.id;
}

async function tagIdByValue(
   db: D1Database,
   value: string,
   now: number,
   create: boolean,
): Promise<string | null> {
   const byId = await db
      .prepare('SELECT id FROM tags WHERE id = ?')
      .bind(value)
      .first<{ id: string }>();
   if (byId !== null) return byId.id;

   const normalised = value.trim().toLowerCase();
   const byName = await db
      .prepare('SELECT id FROM tags WHERE name = ?')
      .bind(normalised)
      .first<{ id: string }>();
   if (byName !== null) return byName.id;

   return create ? ensureTag(db, normalised, now) : null;
}

async function attachTag(db: D1Database, subscriberId: string, tagId: string): Promise<void> {
   await db
      .prepare('INSERT OR IGNORE INTO subscriber_tags (subscriber_id, tag_id) VALUES (?, ?)')
      .bind(subscriberId, tagId)
      .run();
}

function csvCell(value: string | null): string {
   const text = value ?? '';
   if (/[",\r\n]/.test(text)) {
      return `"${text.replace(/"/g, '""')}"`;
   }
   return text;
}

subscriberRoutes.get('/', async (c) => {
   const query = listQuery.parse(c.req.query());
   const clauses = ['s.deleted_at IS NULL'];
   const params: string[] = [];

   if (query.q !== undefined && query.q.length > 0) {
      const pattern = likePattern(query.q);
      clauses.push(
         "(s.email LIKE ? ESCAPE '\\' OR s.first_name LIKE ? ESCAPE '\\' OR s.last_name LIKE ? ESCAPE '\\')",
      );
      params.push(pattern, pattern, pattern);
   }

   if (query.tag !== undefined && query.tag.length > 0) {
      clauses.push(
         'EXISTS (SELECT 1 FROM subscriber_tags st JOIN tags t ON t.id = st.tag_id WHERE st.subscriber_id = s.id AND t.name = ?)',
      );
      params.push(query.tag.trim().toLowerCase());
   }

   if (query.status !== undefined && query.status.length > 0) {
      clauses.push('s.status = ?');
      params.push(query.status);
   }

   if (query.cursor !== undefined) {
      const cursor = decodeKeysetCursor(query.cursor);
      clauses.push('(s.created_at < ? OR (s.created_at = ? AND s.id < ?))');
      params.push(String(cursor.createdAt), String(cursor.createdAt), cursor.id);
   }

   const rows = await c.env.DB.prepare(
      `SELECT s.id, s.email, s.first_name, s.last_name, s.status, s.source,
              s.created_at, s.unsubscribed_at, s.deleted_at
       FROM subscribers s
       WHERE ${clauses.join(' AND ')}
       ORDER BY s.created_at DESC, s.id DESC
       LIMIT ?`,
   )
      .bind(...params, query.limit + 1)
      .all<SubscriberRow>();

   const hasMore = rows.results.length > query.limit;
   const page = hasMore ? rows.results.slice(0, query.limit) : rows.results;
   const last = page[page.length - 1];
   const tags = await loadTagsFor(
      c.env.DB,
      page.map((row) => row.id),
   );

   const data = page.map((row) => ({ ...row, tags: tags.get(row.id) ?? [] }));

   return paginated(data, {
      nextCursor:
         hasMore && last !== undefined ? encodeKeysetCursor(last.created_at, last.id) : null,
      hasMore,
      requestId: c.get('requestId'),
   });
});

subscriberRoutes.post('/', async (c) => {
   const body = subscriberInput.parse(await readJson(c));
   const now = nowSeconds();
   const id = createId('sub');

   try {
      await c.env.DB.prepare(
         `INSERT INTO subscribers (id, email, first_name, last_name, status, source, created_at)
          VALUES (?, ?, ?, ?, 'subscribed', 'manual', ?)`,
      )
         .bind(id, body.email, body.firstName ?? null, body.lastName ?? null, now)
         .run();
   } catch (error) {
      if (isUniqueViolation(error)) {
         throw new ConflictError('A subscriber with that email already exists');
      }
      throw error;
   }

   const row = await findSubscriber(c.env.DB, id);
   if (row === null) {
      throw new NotFoundError('Subscriber not found');
   }

   return ok({ ...row, tags: [] }, { status: 201, requestId: c.get('requestId') });
});

subscriberRoutes.post('/import', async (c) => {
   const body = importInput.parse(await readJson(c));
   const parsed = parseSubscriberCsv(body.csv);
   const now = nowSeconds();
   const bodyTags = (body.tags ?? [])
      .map((tag) => tag.trim().toLowerCase())
      .filter((tag) => tag.length > 0);

   let imported = 0;
   let updated = 0;
   let skipped = 0;

   const seen = new Set<string>();

   for (const row of parsed.rows) {
      if (seen.has(row.email)) {
         skipped += 1;
         continue;
      }
      seen.add(row.email);

      const existing = await c.env.DB.prepare('SELECT id FROM subscribers WHERE email = ?')
         .bind(row.email)
         .first<{ id: string }>();

      let subscriberId: string;

      if (existing === null) {
         subscriberId = createId('sub');
         await c.env.DB.prepare(
            `INSERT INTO subscribers (id, email, first_name, last_name, status, source, created_at)
             VALUES (?, ?, ?, ?, 'subscribed', 'import', ?)`,
         )
            .bind(subscriberId, row.email, row.first_name, row.last_name, now)
            .run();
         imported += 1;
      } else {
         subscriberId = existing.id;
         await c.env.DB.prepare(
            `UPDATE subscribers
             SET first_name = COALESCE(?, first_name), last_name = COALESCE(?, last_name)
             WHERE id = ?`,
         )
            .bind(row.first_name, row.last_name, subscriberId)
            .run();
         updated += 1;
      }

      const tagNames = [...new Set([...bodyTags, ...row.tags])];
      for (const name of tagNames) {
         const tagId = await ensureTag(c.env.DB, name, now);
         await attachTag(c.env.DB, subscriberId, tagId);
      }
   }

   const errors = parsed.errors.filter((error) => !error.message.startsWith('Duplicate email:'));

   return ok({ imported, updated, skipped, errors });
});

subscriberRoutes.get('/export', async (c) => {
   const rows = await c.env.DB.prepare(
      `SELECT s.email, s.first_name, s.last_name, s.status, s.created_at,
              (SELECT GROUP_CONCAT(t.name, ';')
               FROM subscriber_tags st JOIN tags t ON t.id = st.tag_id
               WHERE st.subscriber_id = s.id) AS tags
       FROM subscribers s
       WHERE s.deleted_at IS NULL
       ORDER BY s.created_at DESC, s.id DESC`,
   ).all<{
      email: string;
      first_name: string | null;
      last_name: string | null;
      status: string;
      created_at: number;
      tags: string | null;
   }>();

   const header = 'email,first_name,last_name,tags,status,created_at';
   const body = rows.results
      .map((row) =>
         [
            csvCell(row.email),
            csvCell(row.first_name),
            csvCell(row.last_name),
            csvCell(row.tags),
            csvCell(row.status),
            String(row.created_at),
         ].join(','),
      )
      .join('\n');

   return new Response(`${header}\n${body}${body.length > 0 ? '\n' : ''}`, {
      status: 200,
      headers: {
         'content-type': 'text/csv; charset=utf-8',
         'content-disposition': 'attachment; filename="subscribers.csv"',
         'cache-control': 'no-store',
      },
   });
});

subscriberRoutes.post('/bulk-tags', async (c) => {
   const body = bulkTagsInput.parse(await readJson(c));
   const now = nowSeconds();
   const addIds: string[] = [];
   const removeIds: string[] = [];

   for (const value of body.add ?? []) {
      const tagId = await tagIdByValue(c.env.DB, value, now, true);
      if (tagId !== null) addIds.push(tagId);
   }

   for (const value of body.remove ?? []) {
      const tagId = await tagIdByValue(c.env.DB, value, now, false);
      if (tagId !== null) removeIds.push(tagId);
   }

   for (const subscriberId of body.subscriberIds) {
      for (const tagId of addIds) {
         await attachTag(c.env.DB, subscriberId, tagId);
      }
      for (const tagId of removeIds) {
         await c.env.DB.prepare(
            'DELETE FROM subscriber_tags WHERE subscriber_id = ? AND tag_id = ?',
         )
            .bind(subscriberId, tagId)
            .run();
      }
   }

   return ok({
      updated: body.subscriberIds.length,
      added: addIds.length,
      removed: removeIds.length,
   });
});

subscriberRoutes.patch('/:id', async (c) => {
   const id = c.req.param('id');
   const body = subscriberPatch.parse(await readJson(c));
   const existing = await findSubscriber(c.env.DB, id);
   if (existing === null) {
      throw new NotFoundError('Subscriber not found');
   }

   const sets: string[] = [];
   const params: (string | null)[] = [];

   if (body.email !== undefined) {
      sets.push('email = ?');
      params.push(body.email);
   }
   if (body.firstName !== undefined) {
      sets.push('first_name = ?');
      params.push(body.firstName);
   }
   if (body.lastName !== undefined) {
      sets.push('last_name = ?');
      params.push(body.lastName);
   }

   if (sets.length > 0) {
      try {
         await c.env.DB.prepare(
            `UPDATE subscribers SET ${sets.join(', ')} WHERE id = ? AND deleted_at IS NULL`,
         )
            .bind(...params, id)
            .run();
      } catch (error) {
         if (isUniqueViolation(error)) {
            throw new ConflictError('A subscriber with that email already exists');
         }
         throw error;
      }
   }

   const row = await findSubscriber(c.env.DB, id);
   if (row === null) {
      throw new NotFoundError('Subscriber not found');
   }

   const tags = await loadTagsFor(c.env.DB, [id]);
   return ok({ ...row, tags: tags.get(id) ?? [] });
});

subscriberRoutes.delete('/:id', async (c) => {
   const id = c.req.param('id');
   const now = nowSeconds();

   const result = await c.env.DB.prepare(
      `UPDATE subscribers
       SET deleted_at = ?, unsubscribed_at = COALESCE(unsubscribed_at, ?)
       WHERE id = ? AND deleted_at IS NULL`,
   )
      .bind(now, now, id)
      .run();

   if ((result.meta.changes ?? 0) === 0) {
      throw new NotFoundError('Subscriber not found');
   }

   return ok({ id, deleted: true });
});

subscriberRoutes.post('/:id/tags', async (c) => {
   const id = c.req.param('id');
   const body = tagAssignment.parse(await readJson(c));

   const subscriber = await findSubscriber(c.env.DB, id);
   if (subscriber === null) {
      throw new NotFoundError('Subscriber not found');
   }

   const tag = await c.env.DB.prepare('SELECT id FROM tags WHERE id = ?')
      .bind(body.tagId)
      .first<{ id: string }>();
   if (tag === null) {
      throw new NotFoundError('Tag not found');
   }

   await attachTag(c.env.DB, id, tag.id);
   return ok({ subscriberId: id, tagId: tag.id });
});

subscriberRoutes.delete('/:id/tags/:tagId', async (c) => {
   const id = c.req.param('id');
   const tagId = c.req.param('tagId');

   await c.env.DB.prepare('DELETE FROM subscriber_tags WHERE subscriber_id = ? AND tag_id = ?')
      .bind(id, tagId)
      .run();

   return ok({ subscriberId: id, tagId });
});

export { ensureTag };
