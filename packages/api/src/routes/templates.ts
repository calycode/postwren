import { Hono } from 'hono';
import { z } from 'zod';
import { createId } from '@postwren/worker-kit/ids';
import { ok } from '@postwren/worker-kit/envelope';
import { ConflictError, NotFoundError } from '@postwren/worker-kit/errors';
import { parseDocument } from '@postwren/email/ir';
import type { Document } from '@postwren/email/ir';
import { renderEmail } from '@postwren/email/render';
import { applyMergeTags } from '@postwren/email/template';
import { templateInput, templateUpdateInput } from '@postwren/shared/contracts';
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

type TemplateVersionRow = {
   id: string;
   template_id: string;
   revision: number;
   name: string;
   subject: string;
   ir_json: string;
   preview_html: string;
   created_at: number;
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

async function findVersion(
   db: D1Database,
   templateId: string,
   revision: number,
): Promise<TemplateVersionRow | null> {
   return db
      .prepare('SELECT * FROM template_versions WHERE template_id = ? AND revision = ?')
      .bind(templateId, revision)
      .first<TemplateVersionRow>();
}

function documentFrom(row: TemplateRow): Document {
   return parseDocument(JSON.parse(row.ir_json));
}

function revisionFromParam(value: string): number | null {
   if (!/^\d+$/.test(value)) return null;
   const revision = Number(value);
   return Number.isSafeInteger(revision) && revision > 0 ? revision : null;
}

function previewHtmlFor(row: TemplateRow): string {
   if (row.preview_html !== null) return row.preview_html;
   try {
      return renderEmail(documentFrom(row), { unsubscribeUrl: SAMPLE_UNSUBSCRIBE_URL }).html;
   } catch {
      return '';
   }
}

function versionStatement(
   db: D1Database,
   input: {
      templateId: string;
      revision: number;
      name: string;
      subject: string;
      irJson: string;
      previewHtml: string;
      createdAt: number;
   },
): D1PreparedStatement {
   return db
      .prepare(
         `INSERT INTO template_versions
          (id, template_id, revision, name, subject, ir_json, preview_html, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
         createId('ver'),
         input.templateId,
         input.revision,
         input.name,
         input.subject,
         input.irJson,
         input.previewHtml,
         input.createdAt,
      );
}

function templateVersionStatement(db: D1Database, row: TemplateRow): D1PreparedStatement {
   return versionStatement(db, {
      templateId: row.id,
      revision: row.revision,
      name: row.name,
      subject: row.subject,
      irJson: row.ir_json,
      previewHtml: previewHtmlFor(row),
      createdAt: row.updated_at,
   });
}

async function snapshotRevision(db: D1Database, row: TemplateRow): Promise<void> {
   const existing = await db
      .prepare('SELECT 1 AS present FROM template_versions WHERE template_id = ? AND revision = ?')
      .bind(row.id, row.revision)
      .first<{ present: number }>();

   if (existing === null) {
      await templateVersionStatement(db, row).run();
   }
}

function versionSummary(row: TemplateVersionRow) {
   return {
      revision: row.revision,
      name: row.name,
      subject: row.subject,
      createdAt: row.created_at,
   };
}

function versionDetail(row: TemplateVersionRow) {
   return {
      ...versionSummary(row),
      ir: JSON.parse(row.ir_json),
      previewHtml: row.preview_html,
   };
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

   await c.env.DB.batch([
      c.env.DB.prepare(
         `INSERT INTO templates (id, name, subject, ir_json, preview_html, revision, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
      ).bind(id, body.name, body.subject, JSON.stringify(document), html, now, now),
      versionStatement(c.env.DB, {
         templateId: id,
         revision: 1,
         name: body.name,
         subject: body.subject,
         irJson: JSON.stringify(document),
         previewHtml: html,
         createdAt: now,
      }),
   ]);

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

templateRoutes.get('/:id/versions', async (c) => {
   const template = await findTemplate(c.env.DB, c.req.param('id'));
   if (template === null) {
      throw new NotFoundError('Template not found');
   }

   await snapshotRevision(c.env.DB, template);

   const rows = await c.env.DB.prepare(
      'SELECT * FROM template_versions WHERE template_id = ? ORDER BY created_at DESC, revision DESC',
   )
      .bind(template.id)
      .all<TemplateVersionRow>();

   return ok({ versions: rows.results.map(versionSummary) });
});

templateRoutes.get('/:id/versions/:revision', async (c) => {
   const template = await findTemplate(c.env.DB, c.req.param('id'));
   if (template === null) {
      throw new NotFoundError('Template not found');
   }

   const revision = revisionFromParam(c.req.param('revision'));
   if (revision === null) {
      throw new NotFoundError('Version not found');
   }

   await snapshotRevision(c.env.DB, template);

   const version = await findVersion(c.env.DB, template.id, revision);
   if (version === null) {
      throw new NotFoundError('Version not found');
   }

   return ok(versionDetail(version));
});

templateRoutes.post('/:id/versions/:revision/restore', async (c) => {
   const template = await findTemplate(c.env.DB, c.req.param('id'));
   if (template === null) {
      throw new NotFoundError('Template not found');
   }

   const revision = revisionFromParam(c.req.param('revision'));
   if (revision === null) {
      throw new NotFoundError('Version not found');
   }

   await snapshotRevision(c.env.DB, template);

   const version = await findVersion(c.env.DB, template.id, revision);
   if (version === null) {
      throw new NotFoundError('Version not found');
   }

   const now = nowSeconds();
   const nextRevision = template.revision + 1;

   await c.env.DB.batch([
      c.env.DB.prepare(
         `UPDATE templates
          SET name = ?, subject = ?, ir_json = ?, preview_html = ?,
              revision = ?, updated_at = ?
          WHERE id = ?`,
      ).bind(
         version.name,
         version.subject,
         version.ir_json,
         version.preview_html,
         nextRevision,
         now,
         template.id,
      ),
      versionStatement(c.env.DB, {
         templateId: template.id,
         revision: nextRevision,
         name: version.name,
         subject: version.subject,
         irJson: version.ir_json,
         previewHtml: version.preview_html,
         createdAt: now,
      }),
   ]);

   const row = await findTemplate(c.env.DB, template.id);
   return ok(row);
});

templateRoutes.patch('/:id', async (c) => {
   const id = c.req.param('id');
   const existing = await findTemplate(c.env.DB, id);
   if (existing === null) {
      throw new NotFoundError('Template not found');
   }

   const body = templateUpdateInput.parse(await readJson(c));
   const now = nowSeconds();

   const name = body.name ?? existing.name;
   const subject = body.subject ?? existing.subject;
   const document = body.irJson === undefined ? documentFrom(existing) : parseDocument(body.irJson);
   const html = renderEmail(document, { unsubscribeUrl: SAMPLE_UNSUBSCRIBE_URL }).html;
   const revisionBump = body.bumpRevision === false ? 0 : 1;
   const statements: D1PreparedStatement[] = [];

   if (revisionBump === 1) {
      const existingVersion = await findVersion(c.env.DB, id, existing.revision);
      if (existingVersion === null) {
         statements.push(templateVersionStatement(c.env.DB, existing));
      }
   }

   statements.push(
      c.env.DB.prepare(
         `UPDATE templates
          SET name = ?, subject = ?, ir_json = ?, preview_html = ?,
              revision = revision + ?, updated_at = ?
          WHERE id = ?`,
      ).bind(name, subject, JSON.stringify(document), html, revisionBump, now, id),
   );

   if (revisionBump === 1) {
      statements.push(
         versionStatement(c.env.DB, {
            templateId: id,
            revision: existing.revision + 1,
            name,
            subject,
            irJson: JSON.stringify(document),
            previewHtml: html,
            createdAt: now,
         }),
      );
   }

   await c.env.DB.batch(statements);

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

   await c.env.DB.batch([
      c.env.DB.prepare(
         `INSERT INTO templates (id, name, subject, ir_json, preview_html, revision, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
      ).bind(
         id,
         body.name ?? `${source.name} (copy)`,
         source.subject,
         source.ir_json,
         source.preview_html,
         now,
         now,
      ),
      versionStatement(c.env.DB, {
         templateId: id,
         revision: 1,
         name: body.name ?? `${source.name} (copy)`,
         subject: source.subject,
         irJson: source.ir_json,
         previewHtml: previewHtmlFor(source),
         createdAt: now,
      }),
   ]);

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
