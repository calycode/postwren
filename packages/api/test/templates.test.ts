import { beforeEach, describe, expect, it } from 'vitest';
import { createDocument } from '@postwren/email/ir';
import type { Document } from '@postwren/email/ir';
import {
   authHeaders,
   baseEnv,
   createAppForTest,
   json,
   resetDb,
   seedOwner,
   seedTemplate,
} from './helpers';
import type { Auth } from './helpers';

const app = createAppForTest();

type CreatedTemplate = {
   id: string;
   name: string;
   subject: string;
   revision: number;
   ir_json: string;
   preview_html: string | null;
};

async function createTemplate(
   owner: Auth,
   input: { name?: string; subject?: string; document?: Document } = {},
): Promise<CreatedTemplate> {
   const response = await app.request('/api/v1/templates', {
      method: 'POST',
      headers: authHeaders(owner),
      body: JSON.stringify({
         name: input.name ?? 'Welcome',
         subject: input.subject ?? 'Hello',
         irJson: input.document ?? createDocument(),
      }),
   });

   expect(response.status).toBe(201);
   return (await json(response)).data;
}

async function versions(owner: Auth, id: string) {
   const response = await app.request(`/api/v1/templates/${id}/versions`, {
      headers: authHeaders(owner),
   });
   expect(response.status).toBe(200);
   return (await json(response)).data.versions;
}

beforeEach(async () => {
   await resetDb();
});

describe('templates', () => {
   it('rejects an invalid document with issues', async () => {
      const owner = await seedOwner(baseEnv());

      const response = await app.request('/api/v1/templates', {
         method: 'POST',
         headers: authHeaders(owner),
         body: JSON.stringify({ name: 'Broken', subject: 'Hello', irJson: { version: 99 } }),
      });

      expect(response.status).toBe(422);
      const body = await json(response);
      expect(body.error.code).toBe('validation_error');
      expect(Array.isArray(body.error.details.issues)).toBe(true);
      expect(body.error.details.issues.length).toBeGreaterThan(0);
   });

   it('creates a template at revision one and bumps on update', async () => {
      const owner = await seedOwner(baseEnv());
      const document = createDocument();

      const created = await app.request('/api/v1/templates', {
         method: 'POST',
         headers: authHeaders(owner),
         body: JSON.stringify({ name: 'Welcome', subject: 'Hi', irJson: document }),
      });

      expect(created.status).toBe(201);
      const template = (await json(created)).data;
      expect(template.revision).toBe(1);
      expect(typeof template.preview_html).toBe('string');

      const updated = await app.request(`/api/v1/templates/${template.id}`, {
         method: 'PATCH',
         headers: authHeaders(owner),
         body: JSON.stringify({ subject: 'New subject' }),
      });

      expect(updated.status).toBe(200);
      expect((await json(updated)).data.revision).toBe(2);
   });

   it('autosaves content without bumping the revision', async () => {
      const target = baseEnv();
      const owner = await seedOwner(target);
      const template = await seedTemplate(target);
      const seededUpdatedAt = Math.floor(Date.now() / 1000) - 60;

      await target.DB.prepare('UPDATE templates SET updated_at = ? WHERE id = ?')
         .bind(seededUpdatedAt, template.id)
         .run();

      const document = { ...createDocument(), preheader: 'Autosaved copy' };
      const response = await app.request(`/api/v1/templates/${template.id}`, {
         method: 'PATCH',
         headers: authHeaders(owner),
         body: JSON.stringify({ irJson: document, bumpRevision: false }),
      });

      expect(response.status).toBe(200);
      const updated = (await json(response)).data;
      expect(updated.revision).toBe(1);
      expect(JSON.parse(updated.ir_json).preheader).toBe('Autosaved copy');
      expect(updated.updated_at).toBeGreaterThan(seededUpdatedAt);
   });

   it('bumps the revision by one on an explicit save', async () => {
      const target = baseEnv();
      const owner = await seedOwner(target);
      const template = await seedTemplate(target);

      const response = await app.request(`/api/v1/templates/${template.id}`, {
         method: 'PATCH',
         headers: authHeaders(owner),
         body: JSON.stringify({ subject: 'Explicit save', bumpRevision: true }),
      });

      expect(response.status).toBe(200);
      const updated = (await json(response)).data;
      expect(updated.revision).toBe(2);
      expect(updated.subject).toBe('Explicit save');
   });

   it('bumps the revision when bumpRevision is omitted', async () => {
      const target = baseEnv();
      const owner = await seedOwner(target);
      const template = await seedTemplate(target);

      const response = await app.request(`/api/v1/templates/${template.id}`, {
         method: 'PATCH',
         headers: authHeaders(owner),
         body: JSON.stringify({ subject: 'Legacy caller' }),
      });

      expect(response.status).toBe(200);
      expect((await json(response)).data.revision).toBe(2);
   });

   it('rejects an invalid document and leaves the row untouched', async () => {
      const target = baseEnv();
      const owner = await seedOwner(target);
      const template = await seedTemplate(target);

      const before = (
         await json(
            await app.request(`/api/v1/templates/${template.id}`, { headers: authHeaders(owner) }),
         )
      ).data;

      const response = await app.request(`/api/v1/templates/${template.id}`, {
         method: 'PATCH',
         headers: authHeaders(owner),
         body: JSON.stringify({ irJson: { version: 99 }, bumpRevision: true }),
      });

      expect(response.status).toBe(422);
      expect((await json(response)).error.code).toBe('validation_error');

      const after = (
         await json(
            await app.request(`/api/v1/templates/${template.id}`, { headers: authHeaders(owner) }),
         )
      ).data;

      expect(after.revision).toBe(before.revision);
      expect(after.ir_json).toBe(before.ir_json);
      expect(after.updated_at).toBe(before.updated_at);
   });

   it('renders a preview with html, text, bytes and warnings', async () => {
      const owner = await seedOwner(baseEnv());
      const template = await seedTemplate(baseEnv());

      const response = await app.request(`/api/v1/templates/${template.id}/preview`, {
         method: 'POST',
         headers: authHeaders(owner),
         body: JSON.stringify({ context: true }),
      });

      expect(response.status).toBe(200);
      const body = (await json(response)).data;
      expect(typeof body.html).toBe('string');
      expect(body.html).toContain('<!DOCTYPE html>');
      expect(typeof body.text).toBe('string');
      expect(body.bytes).toBeGreaterThan(0);
      expect(Array.isArray(body.warnings)).toBe(true);
   });

   it('returns only render warnings', async () => {
      const owner = await seedOwner(baseEnv());
      const template = await seedTemplate(baseEnv());

      const response = await app.request(`/api/v1/templates/${template.id}/render-warnings`, {
         method: 'POST',
         headers: authHeaders(owner),
         body: JSON.stringify({}),
      });

      expect(response.status).toBe(200);
      expect(Array.isArray((await json(response)).data)).toBe(true);
   });
});

describe('template versions', () => {
   it('writes a v1 snapshot when a template is created', async () => {
      const owner = await seedOwner(baseEnv());
      const template = await createTemplate(owner, {
         name: 'Welcome',
         subject: 'First subject',
      });

      const listed = await versions(owner, template.id);
      expect(listed).toHaveLength(1);
      expect(listed[0]).toMatchObject({
         revision: 1,
         name: 'Welcome',
         subject: 'First subject',
      });
      expect(typeof listed[0].createdAt).toBe('number');

      const detail = await app.request(`/api/v1/templates/${template.id}/versions/1`, {
         headers: authHeaders(owner),
      });
      expect(detail.status).toBe(200);
      const version = (await json(detail)).data;
      expect(version.revision).toBe(1);
      expect(version.ir.version).toBe(1);
      expect(version.previewHtml).toContain('<!DOCTYPE html>');
   });

   it('stores a snapshot of the new revision on an explicit save', async () => {
      const owner = await seedOwner(baseEnv());
      const template = await createTemplate(owner, { subject: 'First subject' });

      const response = await app.request(`/api/v1/templates/${template.id}`, {
         method: 'PATCH',
         headers: authHeaders(owner),
         body: JSON.stringify({ subject: 'Second subject', bumpRevision: true }),
      });

      expect(response.status).toBe(200);
      expect((await json(response)).data.revision).toBe(2);

      const listed = await versions(owner, template.id);
      expect(listed.map((version: { revision: number }) => version.revision)).toEqual([2, 1]);

      const detail = await app.request(`/api/v1/templates/${template.id}/versions/2`, {
         headers: authHeaders(owner),
      });
      expect((await json(detail)).data.subject).toBe('Second subject');
   });

   it('backfills the stored revision when history is empty', async () => {
      const target = baseEnv();
      const owner = await seedOwner(target);
      const template = await seedTemplate(target);

      const response = await app.request(`/api/v1/templates/${template.id}`, {
         method: 'PATCH',
         headers: authHeaders(owner),
         body: JSON.stringify({ subject: 'Bumped', bumpRevision: true }),
      });
      expect((await json(response)).data.revision).toBe(2);

      const listed = await versions(owner, template.id);
      expect(listed.map((version: { revision: number }) => version.revision)).toEqual([2, 1]);
      expect(listed[1].subject).toBe('Subject');

      const detail = await app.request(`/api/v1/templates/${template.id}/versions/1`, {
         headers: authHeaders(owner),
      });
      const version = (await json(detail)).data;
      expect(version.previewHtml).toContain('<!DOCTYPE html>');
   });

   it('restores a version as a new revision and updates the template', async () => {
      const owner = await seedOwner(baseEnv());
      const first = { ...createDocument(), preheader: 'First preheader' };
      const template = await createTemplate(owner, {
         name: 'Welcome',
         subject: 'First subject',
         document: first,
      });

      const saved = await app.request(`/api/v1/templates/${template.id}`, {
         method: 'PATCH',
         headers: authHeaders(owner),
         body: JSON.stringify({
            name: 'Renamed',
            subject: 'Second subject',
            irJson: { ...createDocument(), preheader: 'Second preheader' },
            bumpRevision: true,
         }),
      });
      expect((await json(saved)).data.revision).toBe(2);

      const restored = await app.request(`/api/v1/templates/${template.id}/versions/1/restore`, {
         method: 'POST',
         headers: authHeaders(owner),
      });

      expect(restored.status).toBe(200);
      const updated = (await json(restored)).data;
      expect(updated.revision).toBe(3);
      expect(updated.name).toBe('Welcome');
      expect(updated.subject).toBe('First subject');
      expect(JSON.parse(updated.ir_json).preheader).toBe('First preheader');
      expect(updated.preview_html).toContain('First preheader');

      const listed = await versions(owner, template.id);
      expect(listed.map((version: { revision: number }) => version.revision)).toEqual([3, 2, 1]);

      const detail = await app.request(`/api/v1/templates/${template.id}/versions/3`, {
         headers: authHeaders(owner),
      });
      const version = (await json(detail)).data;
      expect(version.name).toBe('Welcome');
      expect(version.subject).toBe('First subject');
      expect(version.ir.preheader).toBe('First preheader');
   });

   it('does not add snapshots for autosaves', async () => {
      const owner = await seedOwner(baseEnv());
      const template = await createTemplate(owner, {
         document: { ...createDocument(), preheader: 'Original' },
      });

      const response = await app.request(`/api/v1/templates/${template.id}`, {
         method: 'PATCH',
         headers: authHeaders(owner),
         body: JSON.stringify({
            irJson: { ...createDocument(), preheader: 'Autosaved' },
            bumpRevision: false,
         }),
      });

      expect(response.status).toBe(200);
      expect((await json(response)).data.revision).toBe(1);

      const listed = await versions(owner, template.id);
      expect(listed).toHaveLength(1);
      expect(listed[0].revision).toBe(1);

      const detail = await app.request(`/api/v1/templates/${template.id}/versions/1`, {
         headers: authHeaders(owner),
      });
      expect((await json(detail)).data.ir.preheader).toBe('Original');
   });

   it('rejects a revision that belongs to another template', async () => {
      const owner = await seedOwner(baseEnv());
      const first = await createTemplate(owner, { name: 'First' });
      const second = await createTemplate(owner, { name: 'Second' });

      const bumped = await app.request(`/api/v1/templates/${second.id}`, {
         method: 'PATCH',
         headers: authHeaders(owner),
         body: JSON.stringify({ subject: 'Second revision', bumpRevision: true }),
      });
      expect((await json(bumped)).data.revision).toBe(2);

      const detail = await app.request(`/api/v1/templates/${first.id}/versions/2`, {
         headers: authHeaders(owner),
      });
      expect(detail.status).toBe(404);
      expect((await json(detail)).error.code).toBe('not_found');

      const restore = await app.request(`/api/v1/templates/${first.id}/versions/2/restore`, {
         method: 'POST',
         headers: authHeaders(owner),
      });
      expect(restore.status).toBe(404);

      const unchanged = await app.request(`/api/v1/templates/${first.id}`, {
         headers: authHeaders(owner),
      });
      expect((await json(unchanged)).data.revision).toBe(1);
   });
});
