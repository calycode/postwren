import { Hono } from 'hono';
import { z } from 'zod';
import { ok, paginated } from '@postwren/worker-kit/envelope';
import { ConflictError, NotFoundError, ValidationError } from '@postwren/worker-kit/errors';
import { paginationQuery, subscriberInput, subscriberPatch } from '@postwren/shared/contracts';
import { parseSubscriberCsv } from '@postwren/shared/csv';
import { MAX_METADATA_KEYS, mergeMetadata } from '@postwren/shared/metadata';
import type { MetadataRecord } from '@postwren/shared/metadata';
import type { AppEnv } from '../env';
import { decodeKeysetCursor, encodeKeysetCursor } from '../lib/cursor';
import { isUniqueViolation, likePattern, readJson } from '../lib/validation';
import { nowSeconds } from '../lib/time';
import {
   attachTag,
   ensureTag,
   loadSubscriberMetadata,
   loadSubscriberMetadataFor,
   upsertSubscriber,
   writeSubscriberMetadata,
} from '../lib/subscribers';

type SubscriberRow = {
   id: string;
   email: string;
   first_name: string | null;
   last_name: string | null;
   status: string;
   source: string | null;
   source_url: string | null;
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
         `SELECT id, email, first_name, last_name, status, source, source_url, created_at,
                 unsubscribed_at, deleted_at
          FROM subscribers WHERE id = ? AND deleted_at IS NULL`,
      )
      .bind(id)
      .first<SubscriberRow>();
}

async function tagIdByValue(
   db: D1Database,
   value: string,
   now: number,
   create: boolean,
): Promise<string | null> {
   const byId = await db.prepare('SELECT id FROM tags WHERE id = ?').bind(value).first<{
      id: string;
   }>();
   if (byId !== null) return byId.id;

   const normalised = value.trim().toLowerCase();
   const byName = await db.prepare('SELECT id FROM tags WHERE name = ?').bind(normalised).first<{
      id: string;
   }>();
   if (byName !== null) return byName.id;

   return create ? ensureTag(db, normalised, now) : null;
}

function csvCell(value: string | null): string {
   const text = value ?? '';
   if (/[",\r\n]/.test(text)) {
      return `"${text.replace(/"/g, '""')}"`;
   }
   return text;
}

async function subscriberResource(
   db: D1Database,
   row: SubscriberRow,
   tags?: SubscriberTag[],
   metadata?: MetadataRecord,
): Promise<SubscriberRow & { tags: SubscriberTag[]; metadata: MetadataRecord }> {
   const resolvedTags = tags ?? (await loadTagsFor(db, [row.id])).get(row.id) ?? [];
   const resolvedMetadata = metadata ?? (await loadSubscriberMetadata(db, row.id));

   return { ...row, tags: resolvedTags, metadata: resolvedMetadata };
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
      `SELECT s.id, s.email, s.first_name, s.last_name, s.status, s.source, s.source_url,
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
   const ids = page.map((row) => row.id);
   const tags = await loadTagsFor(c.env.DB, ids);
   const metadata = await loadSubscriberMetadataFor(c.env.DB, ids);

   const data = page.map((row) => ({
      ...row,
      tags: tags.get(row.id) ?? [],
      metadata: metadata.get(row.id) ?? {},
   }));

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

   const result = await upsertSubscriber(
      c.env.DB,
      {
         email: body.email,
         firstName: body.firstName ?? null,
         lastName: body.lastName ?? null,
         status: 'subscribed',
         source: 'manual',
         metadata: body.metadata ?? {},
         createOnly: true,
      },
      now,
   );

   const row = await findSubscriber(c.env.DB, result.id);
   if (row === null) {
      throw new NotFoundError('Subscriber not found');
   }

   return ok(await subscriberResource(c.env.DB, row, []), {
      status: 201,
      requestId: c.get('requestId'),
   });
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

      const result = await upsertSubscriber(
         c.env.DB,
         {
            email: row.email,
            firstName: row.first_name,
            lastName: row.last_name,
            source: 'import',
            tags: [...bodyTags, ...row.tags],
            metadata: row.metadata,
         },
         now,
      );

      if (result.created) imported += 1;
      else updated += 1;
   }

   const errors = parsed.errors.filter((error) => !error.message.startsWith('Duplicate email:'));

   return ok({ imported, updated, skipped, errors });
});

subscriberRoutes.get('/export', async (c) => {
   const rows = await c.env.DB.prepare(
      `SELECT s.email, s.first_name, s.last_name, s.status, s.created_at,
              (SELECT GROUP_CONCAT(t.name, ';')
               FROM subscriber_tags st JOIN tags t ON t.id = st.tag_id
               WHERE st.subscriber_id = s.id) AS tags,
              (SELECT GROUP_CONCAT(m.key || '=' || m.value, ';')
               FROM subscriber_metadata m
               WHERE m.subscriber_id = s.id) AS metadata
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
      metadata: string | null;
   }>();

   const header = 'email,first_name,last_name,tags,metadata,status,created_at';
   const body = rows.results
      .map((row) =>
         [
            csvCell(row.email),
            csvCell(row.first_name),
            csvCell(row.last_name),
            csvCell(row.tags),
            csvCell(row.metadata),
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

subscriberRoutes.get('/:id', async (c) => {
   const row = await findSubscriber(c.env.DB, c.req.param('id'));
   if (row === null) {
      throw new NotFoundError('Subscriber not found');
   }

   return ok(await subscriberResource(c.env.DB, row));
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

   if (body.metadata !== undefined) {
      const current = await loadSubscriberMetadata(c.env.DB, id);
      const merged = mergeMetadata(current, body.metadata);

      if (Object.keys(merged).length > MAX_METADATA_KEYS) {
         throw new ValidationError(`At most ${MAX_METADATA_KEYS} metadata keys are allowed`);
      }

      const updates: MetadataRecord = {};
      const deletes: string[] = [];
      for (const [key, value] of Object.entries(body.metadata)) {
         if (value === null) deletes.push(key);
         else updates[key] = value;
      }

      await writeSubscriberMetadata(c.env.DB, id, updates, deletes);
   }

   const row = await findSubscriber(c.env.DB, id);
   if (row === null) {
      throw new NotFoundError('Subscriber not found');
   }

   return ok(await subscriberResource(c.env.DB, row));
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
