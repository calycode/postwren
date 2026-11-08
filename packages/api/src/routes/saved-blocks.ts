import { Hono } from 'hono';
import { z } from 'zod';
import { createId } from '@postwren/worker-kit/ids';
import { ok } from '@postwren/worker-kit/envelope';
import { NotFoundError, ValidationError } from '@postwren/worker-kit/errors';
import { createDocument, parseDocument } from '@postwren/email/ir';
import type { AppEnv } from '../env';
import { readJson } from '../lib/validation';
import { nowSeconds } from '../lib/time';

type SavedBlockRow = {
   id: string;
   name: string;
   block_json: string;
   created_at: number;
   updated_at: number;
};

const createInput = z
   .object({
      name: z.string().trim().min(1).max(100),
      block: z.unknown(),
   })
   .strict();

const updateInput = z
   .object({
      name: z.string().trim().min(1).max(100),
   })
   .strict();

function present(row: SavedBlockRow) {
   let block: unknown = null;
   try {
      block = JSON.parse(row.block_json);
   } catch {
      block = null;
   }

   return {
      id: row.id,
      name: row.name,
      block,
      created_at: row.created_at,
      updated_at: row.updated_at,
   };
}

async function findBlock(db: D1Database, id: string): Promise<SavedBlockRow | null> {
   return db.prepare('SELECT * FROM saved_blocks WHERE id = ?').bind(id).first<SavedBlockRow>();
}

export const savedBlockRoutes = new Hono<AppEnv>();

savedBlockRoutes.get('/', async (c) => {
   const rows = await c.env.DB.prepare(
      'SELECT * FROM saved_blocks ORDER BY updated_at DESC, id DESC LIMIT 100',
   ).all<SavedBlockRow>();

   return ok(rows.results.map(present), { requestId: c.get('requestId') });
});

savedBlockRoutes.post('/', async (c) => {
   const body = createInput.parse(await readJson(c));
   const base = createDocument();

   let block: unknown;
   try {
      const parsed = parseDocument({ ...base, children: [body.block] });
      block = parsed.children[0];
   } catch (error) {
      throw new ValidationError(
         error instanceof Error ? error.message : 'That block is not valid email content',
      );
   }

   if (block === undefined) {
      throw new ValidationError('That block is not valid email content');
   }

   const id = createId('blk');
   const now = nowSeconds();

   await c.env.DB.prepare(
      `INSERT INTO saved_blocks (id, name, block_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
   )
      .bind(id, body.name, JSON.stringify(block), now, now)
      .run();

   const row = await findBlock(c.env.DB, id);
   if (row === null) throw new NotFoundError('Saved block not found');

   return ok(present(row), { status: 201, requestId: c.get('requestId') });
});

savedBlockRoutes.patch('/:id', async (c) => {
   const id = c.req.param('id');
   const row = await findBlock(c.env.DB, id);
   if (row === null) throw new NotFoundError('Saved block not found');

   const body = updateInput.parse(await readJson(c));
   await c.env.DB.prepare('UPDATE saved_blocks SET name = ?, updated_at = ? WHERE id = ?')
      .bind(body.name, nowSeconds(), id)
      .run();

   const updated = await findBlock(c.env.DB, id);
   if (updated === null) throw new NotFoundError('Saved block not found');

   return ok(present(updated));
});

savedBlockRoutes.delete('/:id', async (c) => {
   const id = c.req.param('id');
   const result = await c.env.DB.prepare('DELETE FROM saved_blocks WHERE id = ?').bind(id).run();
   if ((result.meta.changes ?? 0) === 0) throw new NotFoundError('Saved block not found');

   return ok({ id, deleted: true });
});
