import { Hono } from 'hono';
import { z } from 'zod';
import { createId } from '@postwren/worker-kit/ids';
import { ok } from '@postwren/worker-kit/envelope';
import { ConflictError, NotFoundError } from '@postwren/worker-kit/errors';
import { tagInput } from '@postwren/shared/contracts';
import type { AppEnv } from '../env';
import { escapeLike, isUniqueViolation, readJson } from '../lib/validation';
import { nowSeconds } from '../lib/time';

type TagWithCount = {
   id: string;
   name: string;
   created_at: number;
   subscriber_count: number;
};

const autocompleteQuery = z.object({ q: z.string().trim().optional() });

export const tagRoutes = new Hono<AppEnv>();

tagRoutes.get('/', async (c) => {
   const rows = await c.env.DB.prepare(
      `SELECT t.id, t.name, t.created_at,
              COUNT(st.subscriber_id) AS subscriber_count
       FROM tags t
       LEFT JOIN subscriber_tags st ON st.tag_id = t.id
       GROUP BY t.id, t.name, t.created_at
       ORDER BY t.name ASC`,
   ).all<TagWithCount>();

   return ok(rows.results, { requestId: c.get('requestId') });
});

tagRoutes.get('/autocomplete', async (c) => {
   const query = autocompleteQuery.parse(c.req.query());

   if (query.q === undefined || query.q.length === 0) {
      return ok([], { requestId: c.get('requestId') });
   }

   const rows = await c.env.DB.prepare(
      `SELECT id, name, created_at FROM tags
       WHERE name LIKE ? ESCAPE '\\'
       ORDER BY name ASC
       LIMIT 20`,
   )
      .bind(`%${escapeLike(query.q.toLowerCase())}%`)
      .all<{ id: string; name: string; created_at: number }>();

   return ok(rows.results, { requestId: c.get('requestId') });
});

tagRoutes.post('/', async (c) => {
   const body = tagInput.parse(await readJson(c));
   const now = nowSeconds();
   const id = createId('tag');
   const name = body.name.trim().toLowerCase();

   try {
      await c.env.DB.prepare('INSERT INTO tags (id, name, created_at) VALUES (?, ?, ?)')
         .bind(id, name, now)
         .run();
   } catch (error) {
      if (isUniqueViolation(error)) {
         throw new ConflictError('A tag with that name already exists');
      }
      throw error;
   }

   return ok({ id, name, created_at: now }, { status: 201, requestId: c.get('requestId') });
});

tagRoutes.patch('/:id', async (c) => {
   const id = c.req.param('id');
   const body = tagInput.parse(await readJson(c));
   const name = body.name.trim().toLowerCase();

   const existing = await c.env.DB.prepare('SELECT id FROM tags WHERE id = ?')
      .bind(id)
      .first<{ id: string }>();
   if (existing === null) {
      throw new NotFoundError('Tag not found');
   }

   try {
      await c.env.DB.prepare('UPDATE tags SET name = ? WHERE id = ?').bind(name, id).run();
   } catch (error) {
      if (isUniqueViolation(error)) {
         throw new ConflictError('A tag with that name already exists');
      }
      throw error;
   }

   const row = await c.env.DB.prepare('SELECT id, name, created_at FROM tags WHERE id = ?')
      .bind(id)
      .first<{ id: string; name: string; created_at: number }>();

   return ok(row);
});

tagRoutes.delete('/:id', async (c) => {
   const id = c.req.param('id');
   const result = await c.env.DB.prepare('DELETE FROM tags WHERE id = ?').bind(id).run();

   if ((result.meta.changes ?? 0) === 0) {
      throw new NotFoundError('Tag not found');
   }

   return ok({ id, deleted: true });
});
