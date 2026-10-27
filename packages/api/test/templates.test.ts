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
