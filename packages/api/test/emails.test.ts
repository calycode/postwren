import { beforeEach, describe, expect, it } from 'vitest';
import { generateApiKey, apiKeyHash } from '../src/auth/api-key';
import {
   baseEnv,
   createAppForTest,
   FakeEmail,
   json,
   now,
   resetDb,
   seedOwner,
   seedSubscribers,
   withEmail,
} from './helpers';

const app = createAppForTest();

beforeEach(async () => {
   await resetDb();
});

async function apiKey(scopes: string[]): Promise<string> {
   const { raw, prefix } = generateApiKey();
   await baseEnv()
      .DB.prepare(
         `INSERT INTO api_keys (id, name, prefix, key_hash, scopes, created_at, expires_at, revoked_at)
          VALUES (?, ?, ?, ?, ?, ?, NULL, NULL)`,
      )
      .bind(
         `key_${prefix}`,
         'transactional',
         prefix,
         await apiKeyHash(raw),
         JSON.stringify(scopes),
         now(),
      )
      .run();
   return raw;
}

describe('transactional email', () => {
   it('sends html to a recipient with the session', async () => {
      const auth = await seedOwner(baseEnv());
      const fake = new FakeEmail();
      const emailApp = createAppForTest(withEmail(baseEnv(), fake));

      const response = await emailApp.request('/api/v1/emails', {
         method: 'POST',
         headers: {
            cookie: auth.cookie,
            'x-csrf-token': auth.csrf,
            'content-type': 'application/json',
         },
         body: JSON.stringify({
            to: 'Ada@Example.com',
            subject: 'Your receipt',
            html: '<p>Thanks for your order.</p>',
         }),
      });

      expect(response.status).toBe(201);
      const body = await json(response);
      expect(body.data).toMatchObject({
         to: 'ada@example.com',
         from: 'noreply@example.com',
         subject: 'Your receipt',
         status: 'sent',
      });
      expect(fake.sent).toHaveLength(1);
      expect(fake.sent[0]).toMatchObject({
         to: 'ada@example.com',
         subject: 'Your receipt',
      });
      expect(fake.sent[0]?.html).toContain('Thanks for your order.');
      expect(fake.sent[0]?.text).toContain('Thanks for your order.');
   });

   it('accepts text only and derives html', async () => {
      const auth = await seedOwner(baseEnv());
      const fake = new FakeEmail();
      const emailApp = createAppForTest(withEmail(baseEnv(), fake));

      const response = await emailApp.request('/api/v1/emails', {
         method: 'POST',
         headers: {
            cookie: auth.cookie,
            'x-csrf-token': auth.csrf,
            'content-type': 'application/json',
         },
         body: JSON.stringify({ to: 'ada@example.com', subject: 'Text', text: 'Plain body' }),
      });

      expect(response.status).toBe(201);
      expect(fake.sent[0]?.text).toBe('Plain body');
      expect(fake.sent[0]?.html).toContain('Plain body');
   });

   it('refuses a suppressed recipient', async () => {
      const auth = await seedOwner(baseEnv());
      await seedSubscribers(baseEnv(), [{ email: 'bounced@example.com', status: 'bounced' }]);

      const response = await app.request('/api/v1/emails', {
         method: 'POST',
         headers: {
            cookie: auth.cookie,
            'x-csrf-token': auth.csrf,
            'content-type': 'application/json',
         },
         body: JSON.stringify({
            to: 'bounced@example.com',
            subject: 'Nope',
            text: 'Should not send',
         }),
      });

      expect(response.status).toBe(400);
      expect((await json(response)).error.code).toBe('validation_error');
   });

   it('requires the emails:write scope for API keys', async () => {
      const fake = new FakeEmail();
      const emailApp = createAppForTest(withEmail(baseEnv(), fake));
      const raw = await apiKey(['templates:read']);

      const denied = await emailApp.request('/api/v1/emails', {
         method: 'POST',
         headers: { authorization: `Bearer ${raw}`, 'content-type': 'application/json' },
         body: JSON.stringify({ to: 'ada@example.com', subject: 'Denied', text: 'No' }),
      });
      expect(denied.status).toBe(403);

      const allowedKey = await apiKey(['emails:write']);
      const allowed = await emailApp.request('/api/v1/emails', {
         method: 'POST',
         headers: { authorization: `Bearer ${allowedKey}`, 'content-type': 'application/json' },
         body: JSON.stringify({ to: 'ada@example.com', subject: 'Allowed', text: 'Yes' }),
      });
      expect(allowed.status).toBe(201);
      expect(fake.sent).toHaveLength(1);
   });
});
