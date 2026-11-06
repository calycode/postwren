import { beforeEach, describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import { apiKeyHash, generateApiKey } from '../src/auth/api-key';
import {
   authHeaders,
   baseEnv,
   createAppForTest,
   json,
   now,
   resetDb,
   seedOwner,
   signTokenForTest,
} from './helpers';

const app = createAppForTest();

beforeEach(async () => {
   await env.DB.prepare('DELETE FROM api_keys').run();
   await resetDb();
});

async function owner() {
   return seedOwner(baseEnv());
}

async function seedApiKey(): Promise<string> {
   const { raw, prefix } = generateApiKey();

   await env.DB.prepare(
      `INSERT INTO api_keys (id, name, prefix, key_hash, scopes, created_at, expires_at, revoked_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL, NULL)`,
   )
      .bind(
         `key_${prefix}`,
         'test key',
         prefix,
         await apiKeyHash(raw),
         JSON.stringify(['subscribers:read']),
         now(),
      )
      .run();

   return raw;
}

describe('embed origins', () => {
   it('starts with an empty allowlist', async () => {
      const auth = await owner();

      const response = await app.request('/api/v1/settings/embed-origins', {
         headers: { cookie: auth.cookie },
      });

      expect(response.status).toBe(200);
      expect((await json(response)).data.origins).toEqual([]);
   });

   it('stores exact https origins and returns them normalised', async () => {
      const auth = await owner();

      const response = await app.request('/api/v1/settings/embed-origins', {
         method: 'PUT',
         headers: authHeaders(auth),
         body: JSON.stringify({
            origins: [
               'https://cms.example.com',
               ' https://www.example.com:8443/ ',
               'https://cms.example.com:443',
               'http://localhost:5173',
            ],
         }),
      });

      expect(response.status).toBe(200);
      expect((await json(response)).data.origins).toEqual([
         'https://cms.example.com',
         'https://www.example.com:8443',
         'http://localhost:5173',
      ]);
   });

   it('clears the allowlist when given an empty list', async () => {
      const auth = await owner();

      await app.request('/api/v1/settings/embed-origins', {
         method: 'PUT',
         headers: authHeaders(auth),
         body: JSON.stringify({ origins: ['https://cms.example.com'] }),
      });

      const cleared = await app.request('/api/v1/settings/embed-origins', {
         method: 'PUT',
         headers: authHeaders(auth),
         body: JSON.stringify({ origins: [] }),
      });
      expect(cleared.status).toBe(200);
      expect((await json(cleared)).data.origins).toEqual([]);

      const listed = await app.request('/api/v1/settings/embed-origins', {
         headers: { cookie: auth.cookie },
      });
      expect((await json(listed)).data.origins).toEqual([]);
   });

   it.each([
      '*',
      'https://*.example.com',
      'http://example.com',
      'https://example.com/admin',
      'https://example.com?x=1',
      'https://example.com#fragment',
      'https://user:pass@example.com',
      'https://example.com.',
      'ftp://example.com',
      'javascript:alert(1)',
      '',
   ])('rejects %j', async (origin) => {
      const auth = await owner();

      const response = await app.request('/api/v1/settings/embed-origins', {
         method: 'PUT',
         headers: authHeaders(auth),
         body: JSON.stringify({ origins: [origin] }),
      });

      expect(response.status).toBe(422);
      expect((await json(response)).error.code).toBe('validation_error');
   });

   it('rejects more than ten origins', async () => {
      const auth = await owner();
      const origins = Array.from({ length: 11 }, (_, index) => `https://o${index}.example.com`);

      const response = await app.request('/api/v1/settings/embed-origins', {
         method: 'PUT',
         headers: authHeaders(auth),
         body: JSON.stringify({ origins }),
      });

      expect(response.status).toBe(422);
   });

   it('refuses the allowlist to a bearer credential', async () => {
      const raw = await seedApiKey();

      const response = await app.request('/api/v1/settings/embed-origins', {
         headers: { authorization: `Bearer ${raw}` },
      });

      expect(response.status).toBe(403);
   });

   it('sets a self-only frame-ancestors policy on the admin SPA by default', async () => {
      const response = await app.request('/settings', {
         headers: { accept: 'text/html' },
      });

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/html');
      expect(response.headers.get('content-security-policy')).toBe("frame-ancestors 'self'");
      expect(response.headers.get('x-frame-options')).toBe('SAMEORIGIN');
      expect(response.headers.get('cache-control')).toBe('no-store');
   });

   it('adds allowed origins to the frame-ancestors policy', async () => {
      const auth = await owner();
      await app.request('/api/v1/settings/embed-origins', {
         method: 'PUT',
         headers: authHeaders(auth),
         body: JSON.stringify({
            origins: ['https://cms.example.com', 'https://www.example.com:8443'],
         }),
      });

      const response = await app.request('/settings', {
         headers: { accept: 'text/html' },
      });

      expect(response.headers.get('content-security-policy')).toBe(
         "frame-ancestors 'self' https://cms.example.com https://www.example.com:8443",
      );
      expect(response.headers.get('x-frame-options')).toBeNull();
   });

   it('applies the policy to the SPA fallback for unknown asset paths', async () => {
      const response = await app.request('/assets/does-not-exist.js', {
         headers: { accept: 'text/html' },
      });

      expect(response.headers.get('content-type')).toContain('text/html');
      expect(response.headers.get('content-security-policy')).toBe("frame-ancestors 'self'");
   });

   it('never lets the allowlist frame the unsubscribe page', async () => {
      const auth = await owner();
      await app.request('/api/v1/settings/embed-origins', {
         method: 'PUT',
         headers: authHeaders(auth),
         body: JSON.stringify({ origins: ['https://cms.example.com'] }),
      });

      const token = await signTokenForTest(baseEnv().TOKEN_SECRET, 'unsubscribe', {
         s: 'sub_test',
         c: 'cmp_test',
      });

      const response = await app.request(`/u/${token}`, {
         headers: { accept: 'text/html' },
      });

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/html');
      expect(response.headers.get('content-security-policy')).toBe("frame-ancestors 'none'");
      expect(response.headers.get('x-frame-options')).toBe('DENY');
   });
});
