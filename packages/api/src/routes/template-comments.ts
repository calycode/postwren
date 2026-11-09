import { Hono } from 'hono';
import { z } from 'zod';
import { createId } from '@postwren/worker-kit/ids';
import { ok } from '@postwren/worker-kit/envelope';
import { NotFoundError } from '@postwren/worker-kit/errors';
import type { AppEnv } from '../env';
import { readJson } from '../lib/validation';
import { nowSeconds } from '../lib/time';

type CommentRow = {
   id: string;
   template_id: string;
   block_id: string;
   body: string;
   status: string;
   created_at: number;
   updated_at: number;
   resolved_at: number | null;
};

const commentInput = z
   .object({
      blockId: z.string().trim().min(1).max(100),
      body: z.string().trim().min(1).max(2000),
   })
   .strict();

const commentPatch = z
   .object({
      body: z.string().trim().min(1).max(2000).optional(),
      status: z.enum(['open', 'done']).optional(),
   })
   .strict();

const COLUMNS = 'id, template_id, block_id, body, status, created_at, updated_at, resolved_at';

function present(row: CommentRow): Record<string, unknown> {
   return {
      id: row.id,
      template_id: row.template_id,
      block_id: row.block_id,
      body: row.body,
      status: row.status,
      created_at: row.created_at,
      updated_at: row.updated_at,
      resolved_at: row.resolved_at,
   };
}

async function requireTemplate(db: D1Database, id: string): Promise<void> {
   const row = await db.prepare('SELECT id FROM templates WHERE id = ?').bind(id).first();
   if (row === null) throw new NotFoundError('Template not found');
}

async function findComment(
   db: D1Database,
   templateId: string,
   commentId: string,
): Promise<CommentRow> {
   const row = await db
      .prepare(`SELECT ${COLUMNS} FROM template_comments WHERE id = ? AND template_id = ?`)
      .bind(commentId, templateId)
      .first<CommentRow>();
   if (row === null) throw new NotFoundError('Comment not found');
   return row;
}

export const templateCommentRoutes = new Hono<AppEnv>();

templateCommentRoutes.get('/:id/comments', async (c) => {
   const templateId = c.req.param('id');
   await requireTemplate(c.env.DB, templateId);

   const rows = await c.env.DB.prepare(
      `SELECT ${COLUMNS} FROM template_comments
       WHERE template_id = ?
       ORDER BY CASE status WHEN 'open' THEN 0 ELSE 1 END, created_at ASC, id ASC`,
   )
      .bind(templateId)
      .all<CommentRow>();

   return ok(rows.results.map(present), { requestId: c.get('requestId') });
});

templateCommentRoutes.post('/:id/comments', async (c) => {
   const templateId = c.req.param('id');
   await requireTemplate(c.env.DB, templateId);
   const body = commentInput.parse(await readJson(c));
   const now = nowSeconds();
   const id = createId('cmt');

   await c.env.DB.prepare(
      `INSERT INTO template_comments
       (id, template_id, block_id, body, status, created_at, updated_at, resolved_at)
       VALUES (?, ?, ?, ?, 'open', ?, ?, NULL)`,
   )
      .bind(id, templateId, body.blockId, body.body, now, now)
      .run();

   return ok(present(await findComment(c.env.DB, templateId, id)), {
      status: 201,
      requestId: c.get('requestId'),
   });
});

templateCommentRoutes.patch('/:id/comments/:commentId', async (c) => {
   const templateId = c.req.param('id');
   const commentId = c.req.param('commentId');
   await requireTemplate(c.env.DB, templateId);
   await findComment(c.env.DB, templateId, commentId);
   const body = commentPatch.parse(await readJson(c));

   const sets: string[] = [];
   const params: (string | number | null)[] = [];

   if (body.body !== undefined) {
      sets.push('body = ?');
      params.push(body.body);
   }
   if (body.status !== undefined) {
      sets.push('status = ?', 'resolved_at = ?');
      params.push(body.status, body.status === 'done' ? nowSeconds() : null);
   }

   sets.push('updated_at = ?');
   params.push(nowSeconds());

   await c.env.DB.prepare(`UPDATE template_comments SET ${sets.join(', ')} WHERE id = ?`)
      .bind(...params, commentId)
      .run();

   return ok(present(await findComment(c.env.DB, templateId, commentId)));
});

templateCommentRoutes.delete('/:id/comments/:commentId', async (c) => {
   const templateId = c.req.param('id');
   const commentId = c.req.param('commentId');
   await requireTemplate(c.env.DB, templateId);
   const result = await c.env.DB.prepare(
      'DELETE FROM template_comments WHERE id = ? AND template_id = ?',
   )
      .bind(commentId, templateId)
      .run();

   if ((result.meta.changes ?? 0) === 0) throw new NotFoundError('Comment not found');
   return ok({ id: commentId, deleted: true });
});
