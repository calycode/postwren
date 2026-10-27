import { Hono } from 'hono';
import { z } from 'zod';
import { createId } from '@mailer/worker-kit/ids';
import { ok } from '@mailer/worker-kit/envelope';
import { ConflictError, NotFoundError } from '@mailer/worker-kit/errors';
import { parseDocument } from '@mailer/email/ir';
import type { Document } from '@mailer/email/ir';
import { renderEmail } from '@mailer/email/render';
import { applyMergeTags } from '@mailer/email/template';
import { templateInput } from '@mailer/shared/contracts';
import type { AppEnv } from '../env';
import { readJson } from '../lib/validation';
import { nowSeconds } from '../lib/time';
import { SAMPLE_UNSUBSCRIBE_URL, sampleMergeContext } from '../lib/sample';

type TemplateRow = {
   id: string;
   name: string;
   subject: string;
   ir_json: string;
   preview_html: string | null;
   revision: number;
   created_at: number;
   updated_at: number;
};

const previewInput = z.object({
   document: z.unknown().optional(),
   context: z.boolean().optional(),
});

const duplicateInput = z.object({ name: z.string().trim().min(1).max(200).optional() });

export const templateRoutes = new Hono<AppEnv>();

async function findTemplate(db: D1Database, id: string): Promise<TemplateRow | null> {
   return db.prepare('SELECT * FROM templates WHERE id = ?').bind(id).first<TemplateRow>();
}

function documentFrom(row: TemplateRow): Document {
   return parseDocument(JSON.parse(row.ir_json));
}

templateRoutes.get('/', async (c) => {
   const rows = await c.env.DB.prepare(
      'SELECT * FROM templates ORDER BY updated_at DESC, id DESC',
   ).all<TemplateRow>();

   return ok(rows.results, { requestId: c.get('requestId') });
});

templateRoutes.post('/', async (c) => {
   const body = templateInput.parse(await readJson(c));
   const document = parseDocument(body.irJson);
   const html = renderEmail(document, { unsubscribeUrl: SAMPLE_UNSUBSCRIBE_URL }).html;
   const now = nowSeconds();
   const id = createId('tpl');

   await c.env.DB.prepare(
      `INSERT INTO templates (id, name, subject, ir_json, preview_html, revision, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
   )
      .bind(id, body.name, body.subject, JSON.stringify(document), html, now, now)
      .run();

   const row = await findTemplate(c.env.DB, id);
   return ok(row, { status: 201, requestId: c.get('requestId') });
});

templateRoutes.get('/:id', async (c) => {
   const row = await findTemplate(c.env.DB, c.req.param('id'));
   if (row === null) {
      throw new NotFoundError('Template not found');
   }

   return ok(row);
});

templateRoutes.patch('/:id', async (c) => {
   const id = c.req.param('id');
   const existing = await findTemplate(c.env.DB, id);
   if (existing === null) {
      throw new NotFoundError('Template not found');
   }

   const body = templateInput.partial().parse(await readJson(c));
   const now = nowSeconds();

   const name = body.name ?? existing.name;
   const subject = body.subject ?? existing.subject;
   const document = body.irJson === undefined ? documentFrom(existing) : parseDocument(body.irJson);
   const html = renderEmail(document, { unsubscribeUrl: SAMPLE_UNSUBSCRIBE_URL }).html;

   await c.env.DB.prepare(
      `UPDATE templates
       SET name = ?, subject = ?, ir_json = ?, preview_html = ?,
           revision = revision + 1, updated_at = ?
       WHERE id = ?`,
   )
      .bind(name, subject, JSON.stringify(document), html, now, id)
      .run();

   const row = await findTemplate(c.env.DB, id);
   return ok(row);
});

templateRoutes.delete('/:id', async (c) => {
   const id = c.req.param('id');

   try {
      const result = await c.env.DB.prepare('DELETE FROM templates WHERE id = ?').bind(id).run();
      if ((result.meta.changes ?? 0) === 0) {
         throw new NotFoundError('Template not found');
      }
   } catch (error) {
      if (error instanceof NotFoundError) throw error;
      if (error instanceof Error && /FOREIGN KEY/i.test(error.message)) {
         throw new ConflictError('Template is used by a campaign');
      }
      throw error;
   }

   return ok({ id, deleted: true });
});

templateRoutes.post('/:id/duplicate', async (c) => {
   const source = await findTemplate(c.env.DB, c.req.param('id'));
   if (source === null) {
      throw new NotFoundError('Template not found');
   }

   const body = duplicateInput.parse(await readJson(c).catch(() => ({})));
   const now = nowSeconds();
   const id = createId('tpl');

   await c.env.DB.prepare(
      `INSERT INTO templates (id, name, subject, ir_json, preview_html, revision, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
   )
      .bind(
         id,
         body.name ?? `${source.name} (copy)`,
         source.subject,
         source.ir_json,
         source.preview_html,
         now,
         now,
      )
      .run();

   const row = await findTemplate(c.env.DB, id);
   return ok(row, { status: 201, requestId: c.get('requestId') });
});

templateRoutes.post('/:id/preview', async (c) => {
   const row = await findTemplate(c.env.DB, c.req.param('id'));
   if (row === null) {
      throw new NotFoundError('Template not found');
   }

   const body = previewInput.parse(await readJson(c).catch(() => ({})));
   const base = body.document === undefined ? documentFrom(row) : parseDocument(body.document);
   const document = body.context === true ? applyMergeTags(base, sampleMergeContext()) : base;
   const result = renderEmail(
      document,
      body.context === true ? { unsubscribeUrl: SAMPLE_UNSUBSCRIBE_URL } : {},
   );

   return ok(result);
});

templateRoutes.post('/:id/render-warnings', async (c) => {
   const row = await findTemplate(c.env.DB, c.req.param('id'));
   if (row === null) {
      throw new NotFoundError('Template not found');
   }

   const result = renderEmail(documentFrom(row), { unsubscribeUrl: SAMPLE_UNSUBSCRIBE_URL });
   return ok(result.warnings);
});
