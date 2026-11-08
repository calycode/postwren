import { beforeEach, describe, expect, it } from 'vitest';
import { authHeaders, baseEnv, createAppForTest, json, resetDb, seedOwner } from './helpers';
import type { Auth } from './helpers';

const app = createAppForTest();

beforeEach(async () => {
   await resetDb();
});

type KeyResult = {
   id: string;
   key: string;
   prefix: string;
   allowed_origins: string[];
   default_tags: string[];
};

async function createKey(owner: Auth, overrides: Record<string, unknown> = {}): Promise<KeyResult> {
   const response = await app.request('/api/v1/subscribe-keys', {
      method: 'POST',
      headers: authHeaders(owner),
      body: JSON.stringify({
         name: 'Marketing site',
         allowedOrigins: ['https://site.example'],
         defaultTags: ['newsletter'],
         ...overrides,
      }),
   });

   expect(response.status).toBe(201);
   return (await json(response)).data;
}

function subscribe(
   secret: string,
   body: Record<string, unknown>,
   headers: Record<string, string> = {},
): Promise<Response> {
   return Promise.resolve(
      app.request('/api/public/subscribe', {
         method: 'POST',
         headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${secret}`,
            'cf-connecting-ip': '203.0.113.10',
            ...headers,
         },
         body: JSON.stringify(body),
      }),
   );
}

describe('subscribe key management', () => {
   it('creates a key, shows the secret once and lists only its prefix', async () => {
      const owner = await seedOwner(baseEnv());
      const created = await createKey(owner);

      expect(created.key.startsWith('pk_live_')).toBe(true);
      expect(created.prefix).toBe(created.key.slice(0, 16));

      const list = await app.request('/api/v1/subscribe-keys', {
         headers: { cookie: owner.cookie },
      });
      const body = await json(list);

      expect(body.data).toHaveLength(1);
      expect(body.data[0].prefix).toBe(created.prefix);
      expect(body.data[0].key).toBeUndefined();
      expect(body.data[0].key_hash).toBeUndefined();
      expect(body.data[0].allowed_origins).toEqual(['https://site.example']);
      expect(body.data[0].default_tags).toEqual(['newsletter']);
   });

   it('requires a session', async () => {
      const response = await app.request('/api/v1/subscribe-keys');
      expect(response.status).toBe(401);
   });

   it('revokes a key so it can no longer subscribe anyone', async () => {
      const owner = await seedOwner(baseEnv());
      const created = await createKey(owner);

      const revoked = await app.request(`/api/v1/subscribe-keys/${created.id}`, {
         method: 'DELETE',
         headers: authHeaders(owner),
      });
      expect(revoked.status).toBe(200);

      const response = await subscribe(created.key, { email: 'ada@example.com' });
      expect(response.status).toBe(401);
   });

   it('deletes a revoked key for good, and only then', async () => {
      const owner = await seedOwner(baseEnv());
      const created = await createKey(owner);
      const url = `/api/v1/subscribe-keys/${created.id}`;

      const first = await app.request(url, {
         method: 'DELETE',
         headers: authHeaders(owner),
      });
      expect((await json(first)).data).toMatchObject({ revoked: true });

      const second = await app.request(url, {
         method: 'DELETE',
         headers: authHeaders(owner),
      });
      expect((await json(second)).data).toMatchObject({ deleted: true });

      const list = await app.request('/api/v1/subscribe-keys', {
         headers: { cookie: owner.cookie },
      });
      expect((await json(list)).data).toHaveLength(0);
   });
});

describe('public subscribe', () => {
   it('rejects a missing or invalid key', async () => {
      const owner = await seedOwner(baseEnv());
      const created = await createKey(owner);

      const missing = await app.request('/api/public/subscribe', {
         method: 'POST',
         headers: { 'content-type': 'application/json' },
         body: JSON.stringify({ email: 'ada@example.com' }),
      });
      expect(missing.status).toBe(401);
      expect((await json(missing)).error.code).toBe('unauthorized');

      const invalid = await subscribe('pk_live_not-a-real-key', { email: 'ada@example.com' });
      expect(invalid.status).toBe(401);

      const header = await subscribe(
         created.key.replace('Bearer ', ''),
         {},
         { authorization: '', 'x-subscribe-key': created.key },
      );
      expect(header.status).toBe(422);
   });

   it('creates a subscriber with default tags, metadata and provenance', async () => {
      const owner = await seedOwner(baseEnv());
      const created = await createKey(owner);

      const response = await subscribe(created.key, {
         email: 'Ada@Example.com',
         firstName: 'Ada',
         lastName: 'Lovelace',
         tags: ['vip'],
         metadata: { plan: 'pro', signup_source: 'emdash' },
         source: 'emdash-form',
         sourceUrl: 'https://site.example/newsletter',
      });

      expect(response.status).toBe(202);
      const body = await json(response);
      expect(body.data).toEqual({ subscribed: true });

      const row = await baseEnv()
         .DB.prepare(
            `SELECT s.email, s.first_name, s.last_name, s.status, s.source, s.source_url
             FROM subscribers s WHERE s.email = ?`,
         )
         .bind('ada@example.com')
         .first<{
            email: string;
            first_name: string;
            last_name: string;
            status: string;
            source: string;
            source_url: string;
         }>();

      expect(row).toMatchObject({
         email: 'ada@example.com',
         first_name: 'Ada',
         last_name: 'Lovelace',
         status: 'subscribed',
         source: 'emdash-form',
         source_url: 'https://site.example/newsletter',
      });

      const tags = await baseEnv()
         .DB.prepare(
            `SELECT t.name FROM tags t JOIN subscriber_tags st ON st.tag_id = t.id
             JOIN subscribers s ON s.id = st.subscriber_id
             WHERE s.email = ? ORDER BY t.name`,
         )
         .bind('ada@example.com')
         .all<{ name: string }>();
      expect(tags.results.map((tag) => tag.name)).toEqual(['newsletter', 'vip']);

      const metadata = await baseEnv()
         .DB.prepare(
            `SELECT m.key, m.value FROM subscriber_metadata m
             JOIN subscribers s ON s.id = m.subscriber_id
             WHERE s.email = ? ORDER BY m.key`,
         )
         .bind('ada@example.com')
         .all<{ key: string; value: string }>();
      expect(metadata.results).toEqual([
         { key: 'plan', value: 'pro' },
         { key: 'signup_source', value: 'emdash' },
      ]);
   });

   it('treats a filled honeypot as a successful no-op', async () => {
      const owner = await seedOwner(baseEnv());
      const created = await createKey(owner);

      const response = await subscribe(created.key, {
         email: 'bot@example.com',
         website: 'https://spam.example',
      });

      expect(response.status).toBe(202);
      expect((await json(response)).data).toEqual({ subscribed: true });

      const count = await baseEnv()
         .DB.prepare('SELECT COUNT(*) AS count FROM subscribers')
         .first<{ count: number }>();
      expect(count?.count).toBe(0);
   });

   it('updates an existing subscriber without duplicating or reviving them', async () => {
      const owner = await seedOwner(baseEnv());
      const created = await createKey(owner);

      const first = await subscribe(created.key, {
         email: 'ada@example.com',
         tags: ['vip'],
         metadata: { plan: 'pro' },
      });
      expect(first.status).toBe(202);

      const second = await subscribe(created.key, {
         email: 'ADA@example.com',
         tags: ['vip', 'beta'],
         metadata: { plan: 'team', region: 'eu' },
      });
      expect(second.status).toBe(202);
      expect((await json(first)).data).toEqual({ subscribed: true });
      expect((await json(second)).data).toEqual({ subscribed: true });

      const count = await baseEnv()
         .DB.prepare('SELECT COUNT(*) AS count FROM subscribers')
         .first<{ count: number }>();
      expect(count?.count).toBe(1);

      await baseEnv()
         .DB.prepare("UPDATE subscribers SET status = 'unsubscribed' WHERE email = ?")
         .bind('ada@example.com')
         .run();

      const third = await subscribe(created.key, { email: 'ada@example.com' });
      expect(third.status).toBe(202);

      const row = await baseEnv()
         .DB.prepare('SELECT status FROM subscribers WHERE email = ?')
         .bind('ada@example.com')
         .first<{ status: string }>();
      expect(row?.status).toBe('unsubscribed');

      const metadata = await baseEnv()
         .DB.prepare(
            `SELECT m.key, m.value FROM subscriber_metadata m
             JOIN subscribers s ON s.id = m.subscriber_id
             WHERE s.email = ? ORDER BY m.key`,
         )
         .bind('ada@example.com')
         .all<{ key: string; value: string }>();
      expect(metadata.results).toEqual([
         { key: 'plan', value: 'team' },
         { key: 'region', value: 'eu' },
      ]);
   });

   it('allows only the configured origins', async () => {
      const owner = await seedOwner(baseEnv());
      const created = await createKey(owner);

      const allowed = await subscribe(
         created.key,
         { email: 'allowed@example.com' },
         { origin: 'https://site.example' },
      );
      expect(allowed.status).toBe(202);
      expect(allowed.headers.get('access-control-allow-origin')).toBe('https://site.example');

      const blocked = await subscribe(
         created.key,
         { email: 'blocked@example.com' },
         { origin: 'https://evil.example' },
      );
      expect(blocked.status).toBe(403);
      expect(blocked.headers.get('access-control-allow-origin')).toBe('https://evil.example');
      expect((await json(blocked)).error.code).toBe('forbidden');
   });

   it('answers preflight requests', async () => {
      const response = await app.request('/api/public/subscribe', {
         method: 'OPTIONS',
         headers: {
            origin: 'https://site.example',
            'access-control-request-method': 'POST',
            'access-control-request-headers': 'authorization,content-type',
         },
      });

      expect(response.status).toBe(204);
      expect(response.headers.get('access-control-allow-origin')).toBe('https://site.example');
      expect(response.headers.get('access-control-allow-methods')).toContain('POST');
      expect(response.headers.get('access-control-allow-headers')).toContain('authorization');
   });

   it('rate limits repeated signups from one address', async () => {
      const owner = await seedOwner(baseEnv());
      const created = await createKey(owner);

      for (let index = 0; index < 10; index += 1) {
         const response = await subscribe(created.key, { email: `bulk${index}@example.com` });
         expect(response.status).toBe(202);
      }

      const limited = await subscribe(created.key, { email: 'over@example.com' });
      expect(limited.status).toBe(429);
      expect((await json(limited)).error.code).toBe('rate_limited');
   });

   it('rejects reserved metadata keys', async () => {
      const owner = await seedOwner(baseEnv());
      const created = await createKey(owner);

      const response = await subscribe(created.key, {
         email: 'ada@example.com',
         metadata: { email: 'other@example.com' },
      });

      expect(response.status).toBe(422);
   });
});
