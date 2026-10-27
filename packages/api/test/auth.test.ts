import { beforeEach, describe, expect, it } from 'vitest';
import { env, SELF } from 'cloudflare:test';
import { authHeaders, createAppForTest, json, resetDb, seedOwner } from './helpers';

const app = createAppForTest();

function setCookies(response: Response): string[] {
   const headers = response.headers as Headers & { getSetCookie?: () => string[] };
   return headers.getSetCookie?.() ?? [];
}

function cookieFrom(response: Response, name: string): string {
   const match = setCookies(response).find((cookie) => cookie.startsWith(`${name}=`));
   if (match === undefined) throw new Error(`Missing ${name} cookie`);
   return match.split(';')[0] ?? '';
}

beforeEach(async () => {
   await resetDb();
});

describe('auth', () => {
   it('signs in with a magic link and exposes the session', async () => {
      const request = await app.request('/api/auth/magic-link', {
         method: 'POST',
         headers: { 'content-type': 'application/json' },
         body: JSON.stringify({ email: env.OWNER_EMAIL ?? 'dev@example.com' }),
      });

      expect(request.status).toBe(200);
      const body = await json(request);
      expect(body.data.sent).toBe(true);
      expect(typeof body.data.devToken).toBe('string');

      const verify = await app.request('/api/auth/verify', {
         method: 'POST',
         headers: { 'content-type': 'application/json' },
         body: JSON.stringify({ token: body.data.devToken }),
      });

      expect(verify.status).toBe(200);
      const verified = await json(verify);
      expect(verified.data.email).toBe((env.OWNER_EMAIL ?? 'dev@example.com').toLowerCase());
      expect(verified.data.role).toBe('owner');

      const sid = cookieFrom(verify, 'sid');
      const session = await app.request('/api/auth/session', {
         headers: { cookie: sid },
      });

      expect(session.status).toBe(200);
      const current = await json(session);
      expect(current.data.id).toBe(verified.data.id);
   });

   it('rejects an unknown token', async () => {
      const response = await app.request('/api/auth/verify', {
         method: 'POST',
         headers: { 'content-type': 'application/json' },
         body: JSON.stringify({ token: 'not-a-real-token' }),
      });

      expect(response.status).toBe(401);
      const body = await json(response);
      expect(body.error.code).toBe('unauthorized');
   });

   it('does not allow a magic link to be reused', async () => {
      const request = await app.request('/api/auth/magic-link', {
         method: 'POST',
         headers: { 'content-type': 'application/json' },
         body: JSON.stringify({ email: env.OWNER_EMAIL ?? 'dev@example.com' }),
      });
      const { data } = await json(request);

      const first = await app.request('/api/auth/verify', {
         method: 'POST',
         headers: { 'content-type': 'application/json' },
         body: JSON.stringify({ token: data.devToken }),
      });
      expect(first.status).toBe(200);

      const second = await app.request('/api/auth/verify', {
         method: 'POST',
         headers: { 'content-type': 'application/json' },
         body: JSON.stringify({ token: data.devToken }),
      });
      expect(second.status).toBe(401);
   });

   it('logs out and invalidates the session', async () => {
      const auth = await seedOwner();
      const response = await app.request('/api/auth/logout', {
         method: 'POST',
         headers: authHeaders(auth),
      });

      expect(response.status).toBe(200);
      expect(setCookies(response).some((cookie) => cookie.startsWith('sid='))).toBe(true);

      const session = await app.request('/api/auth/session', {
         headers: { cookie: auth.cookie },
      });
      expect(session.status).toBe(401);
   });

   it('requires CSRF on mutations', async () => {
      const auth = await seedOwner();
      const response = await app.request('/api/v1/tags', {
         method: 'POST',
         headers: { cookie: auth.cookie, 'content-type': 'application/json' },
         body: JSON.stringify({ name: 'news' }),
      });

      expect(response.status).toBe(403);
   });

   it('rate limits magic link requests per IP', async () => {
      const statuses: number[] = [];

      for (let index = 0; index < 11; index += 1) {
         const response = await app.request('/api/auth/magic-link', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ email: `person${index}@example.com` }),
         });
         statuses.push(response.status);
      }

      expect(statuses.slice(0, 10)).toEqual(Array(10).fill(200));
      expect(statuses[10]).toBe(429);
   });

   it('routes through the worker entrypoint', async () => {
      const response = await SELF.fetch('https://example.com/api/v1/tags');
      expect(response.status).toBe(401);
      const body = await json(response);
      expect(body.error.code).toBe('unauthorized');
   });

   it('serves unknown API paths as JSON 404', async () => {
      const auth = await seedOwner();
      const response = await app.request('/api/v1/does-not-exist', {
         headers: { cookie: auth.cookie },
      });

      expect(response.status).toBe(404);
      expect(response.headers.get('content-type')).toContain('application/json');
   });
});
