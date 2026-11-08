import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authHeaders, baseEnv, createAppForTest, json, resetDb, seedOwner } from './helpers';

const app = createAppForTest();

beforeEach(async () => {
   await resetDb();
});

afterEach(() => {
   vi.unstubAllGlobals();
});

function cloudflareJson(body: unknown, status = 200): Response {
   return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
   });
}

async function owner() {
   return seedOwner(baseEnv());
}

describe('settings senders', () => {
   it('seeds the default sender from EMAIL_FROM on first read', async () => {
      const auth = await owner();

      const response = await app.request('/api/v1/settings/senders', {
         headers: { cookie: auth.cookie },
      });

      expect(response.status).toBe(200);
      const body = await json(response);
      expect(body.data.domains).toEqual(['example.com']);
      expect(body.data.defaultFrom).toBe('noreply@example.com');
      expect(body.data.addresses).toHaveLength(1);
      expect(body.data.addresses[0]).toMatchObject({
         email: 'noreply@example.com',
         name: '',
         domain: 'example.com',
         is_default: 1,
      });
      expect(body.data.addresses[0].verified_at).toEqual(expect.any(Number));
   });

   it('verifies a sender domain through the Cloudflare Email Sending API', async () => {
      const auth = await owner();
      const listed = await json(
         await app.request('/api/v1/settings/senders', { headers: { cookie: auth.cookie } }),
      );
      const address = listed.data.addresses[0] as { id: string; email: string };

      const env = { CLOUDFLARE_API_TOKEN: 'test-token' };
      const withToken = createAppForTest(env);
      vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
         const url = String(input);
         if (url.includes('/zones?')) {
            return cloudflareJson({
               success: true,
               result: [{ id: 'zone-1', name: 'example.com', status: 'active' }],
            });
         }
         if (url.includes('/email/sending/subdomains')) {
            return cloudflareJson({
               success: true,
               result: [{ tag: 'sd-1', name: 'example.com', enabled: true }],
            });
         }
         return cloudflareJson({ success: false, result: null }, 404);
      });

      const response = await withToken.request(`/api/v1/settings/senders/${address.id}/verify`, {
         method: 'POST',
         headers: authHeaders(auth),
      });
      expect(response.status).toBe(200);
      const body = await json(response);
      expect(body.data).toMatchObject({ verified: true, state: 'enabled', zone: 'example.com' });

      const row = await baseEnv()
         .DB.prepare('SELECT verified_at FROM sender_addresses WHERE id = ?')
         .bind(address.id)
         .first<{ verified_at: number | null }>();
      expect(row?.verified_at).toEqual(expect.any(Number));
   });

   it('clears verification when Cloudflare reports the domain as not onboarded', async () => {
      const auth = await owner();
      const listed = await json(
         await app.request('/api/v1/settings/senders', { headers: { cookie: auth.cookie } }),
      );
      const address = listed.data.addresses[0] as { id: string };

      const withToken = createAppForTest({ CLOUDFLARE_API_TOKEN: 'test-token' });
      vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
         const url = String(input);
         if (url.includes('/zones?')) {
            return cloudflareJson({
               success: true,
               result: [{ id: 'zone-1', name: 'example.com', status: 'active' }],
            });
         }
         if (url.includes('/email/sending/subdomains')) {
            return cloudflareJson({ success: true, result: [] });
         }
         return cloudflareJson({ success: false, result: null }, 404);
      });

      const response = await withToken.request(`/api/v1/settings/senders/${address.id}/verify`, {
         method: 'POST',
         headers: authHeaders(auth),
      });
      expect(response.status).toBe(200);
      const body = await json(response);
      expect(body.data).toMatchObject({ verified: false, state: 'not_onboarded' });

      const row = await baseEnv()
         .DB.prepare('SELECT verified_at FROM sender_addresses WHERE id = ?')
         .bind(address.id)
         .first<{ verified_at: number | null }>();
      expect(row?.verified_at).toBeNull();
   });

   it('refuses to check verification without a Cloudflare token', async () => {
      const auth = await owner();
      const listed = await json(
         await app.request('/api/v1/settings/senders', { headers: { cookie: auth.cookie } }),
      );
      const address = listed.data.addresses[0] as { id: string };

      const response = await app.request(`/api/v1/settings/senders/${address.id}/verify`, {
         method: 'POST',
         headers: authHeaders(auth),
      });
      expect(response.status).toBe(400);
      expect((await json(response)).error.code).toBe('cloudflare_not_configured');
   });

   it('reports Cloudflare discovery as unconfigured without a token', async () => {
      const auth = await owner();

      const response = await app.request('/api/v1/settings/senders/discover', {
         headers: { cookie: auth.cookie },
      });

      expect(response.status).toBe(200);
      const body = await json(response);
      expect(body.data).toEqual({ configured: false, domains: [] });
   });

   it('creates an unverified address and derives its domain', async () => {
      const auth = await owner();

      const response = await app.request('/api/v1/settings/senders', {
         method: 'POST',
         headers: authHeaders(auth),
         body: JSON.stringify({ email: 'News@Example.org', name: 'News desk' }),
      });

      expect(response.status).toBe(201);
      const body = await json(response);
      expect(body.data).toMatchObject({
         email: 'news@example.org',
         name: 'News desk',
         domain: 'example.org',
         verified_at: null,
         is_default: 0,
      });
   });

   it('rejects a duplicate address', async () => {
      const auth = await owner();
      const body = JSON.stringify({ email: 'dup@example.org' });

      const first = await app.request('/api/v1/settings/senders', {
         method: 'POST',
         headers: authHeaders(auth),
         body,
      });
      expect(first.status).toBe(201);

      const second = await app.request('/api/v1/settings/senders', {
         method: 'POST',
         headers: authHeaders(auth),
         body,
      });
      expect(second.status).toBe(409);
      expect((await json(second)).error.code).toBe('conflict');
   });

   it('rejects an invalid email', async () => {
      const auth = await owner();

      const response = await app.request('/api/v1/settings/senders', {
         method: 'POST',
         headers: authHeaders(auth),
         body: JSON.stringify({ email: 'not-an-email' }),
      });

      expect(response.status).toBe(422);
   });

   it('moves the default flag to another address', async () => {
      const auth = await owner();
      await app.request('/api/v1/settings/senders', {
         headers: { cookie: auth.cookie },
      });

      const created = await app.request('/api/v1/settings/senders', {
         method: 'POST',
         headers: authHeaders(auth),
         body: JSON.stringify({ email: 'second@example.org' }),
      });
      const second = (await json(created)).data;

      const patched = await app.request(`/api/v1/settings/senders/${second.id}`, {
         method: 'PATCH',
         headers: authHeaders(auth),
         body: JSON.stringify({ isDefault: true }),
      });
      expect(patched.status).toBe(200);
      expect((await json(patched)).data.is_default).toBe(1);

      const listed = await app.request('/api/v1/settings/senders', {
         headers: { cookie: auth.cookie },
      });
      const body = await json(listed);
      expect(body.data.defaultFrom).toBe('second@example.org');
      expect(
         body.data.addresses.filter((row: { is_default: number }) => row.is_default === 1),
      ).toHaveLength(1);
   });

   it('sets and clears the verified flag', async () => {
      const auth = await owner();
      const created = await app.request('/api/v1/settings/senders', {
         method: 'POST',
         headers: authHeaders(auth),
         body: JSON.stringify({ email: 'verify@example.org' }),
      });
      const address = (await json(created)).data;

      const verified = await app.request(`/api/v1/settings/senders/${address.id}`, {
         method: 'PATCH',
         headers: authHeaders(auth),
         body: JSON.stringify({ verified: true }),
      });
      expect(verified.status).toBe(200);
      expect((await json(verified)).data.verified_at).toEqual(expect.any(Number));

      const cleared = await app.request(`/api/v1/settings/senders/${address.id}`, {
         method: 'PATCH',
         headers: authHeaders(auth),
         body: JSON.stringify({ verified: false }),
      });
      expect(cleared.status).toBe(200);
      expect((await json(cleared)).data.verified_at).toBeNull();
   });

   it('refuses to delete the default address', async () => {
      const auth = await owner();
      const listed = await app.request('/api/v1/settings/senders', {
         headers: { cookie: auth.cookie },
      });
      const address = (await json(listed)).data.addresses[0];

      const response = await app.request(`/api/v1/settings/senders/${address.id}`, {
         method: 'DELETE',
         headers: authHeaders(auth),
      });

      expect(response.status).toBe(409);
      expect((await json(response)).error.message).toContain('default');
   });

   it('refuses to delete the last remaining address', async () => {
      const auth = await owner();
      await baseEnv()
         .DB.prepare(
            `INSERT INTO sender_addresses (id, email, name, domain, verified_at, is_default, created_at)
             VALUES ('snd_last', 'only@example.org', '', 'example.org', NULL, 0, 1)`,
         )
         .run();

      const response = await app.request('/api/v1/settings/senders/snd_last', {
         method: 'DELETE',
         headers: authHeaders(auth),
      });

      expect(response.status).toBe(409);
      expect((await json(response)).error.message).toContain('last');
   });

   it('deletes a non-default address when another remains', async () => {
      const auth = await owner();
      const created = await app.request('/api/v1/settings/senders', {
         method: 'POST',
         headers: authHeaders(auth),
         body: JSON.stringify({ email: 'extra@example.org' }),
      });
      const extra = (await json(created)).data;

      const response = await app.request(`/api/v1/settings/senders/${extra.id}`, {
         method: 'DELETE',
         headers: authHeaders(auth),
      });

      expect(response.status).toBe(200);
      expect((await json(response)).data.deleted).toBe(true);
   });
});
