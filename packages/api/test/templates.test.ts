import { beforeEach, describe, expect, it } from 'vitest';
import { createDocument } from '@mailer/email/ir';
import {
   authHeaders,
   baseEnv,
   createAppForTest,
   json,
   resetDb,
   seedOwner,
   seedTemplate,
} from './helpers';

const app = createAppForTest();

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
