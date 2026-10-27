import { beforeEach, describe, expect, it } from 'vitest';
import {
   authHeaders,
   createAppForTest,
   ensureTag,
   json,
   now,
   resetDb,
   seedOwner,
   seedSubscribers,
   baseEnv,
} from './helpers';

const app = createAppForTest();

beforeEach(async () => {
   await resetDb();
});

async function auth() {
   return seedOwner(baseEnv());
}

describe('subscribers', () => {
   it('creates, lists, patches and soft deletes a subscriber', async () => {
      const owner = await auth();

      const created = await app.request('/api/v1/subscribers', {
         method: 'POST',
         headers: authHeaders(owner),
         body: JSON.stringify({ email: 'ada@example.com', firstName: 'Ada' }),
      });

      expect(created.status).toBe(201);
      const subscriber = (await json(created)).data;
      expect(subscriber.email).toBe('ada@example.com');
      expect(subscriber.status).toBe('subscribed');

      const list = await app.request('/api/v1/subscribers', {
         headers: { cookie: owner.cookie },
      });
      expect(list.status).toBe(200);
      expect((await json(list)).data).toHaveLength(1);

      const patched = await app.request(`/api/v1/subscribers/${subscriber.id}`, {
         method: 'PATCH',
         headers: authHeaders(owner),
         body: JSON.stringify({ lastName: 'Lovelace' }),
      });
      expect(patched.status).toBe(200);
      expect((await json(patched)).data.last_name).toBe('Lovelace');

      const deleted = await app.request(`/api/v1/subscribers/${subscriber.id}`, {
         method: 'DELETE',
         headers: authHeaders(owner),
      });
      expect(deleted.status).toBe(200);

      const after = await app.request('/api/v1/subscribers', {
         headers: { cookie: owner.cookie },
      });
      expect((await json(after)).data).toHaveLength(0);
   });

   it('rejects a duplicate email', async () => {
      const owner = await auth();
      const body = JSON.stringify({ email: 'dup@example.com' });

      const first = await app.request('/api/v1/subscribers', {
         method: 'POST',
         headers: authHeaders(owner),
         body,
      });
      expect(first.status).toBe(201);

      const second = await app.request('/api/v1/subscribers', {
         method: 'POST',
         headers: authHeaders(owner),
         body,
      });
      expect(second.status).toBe(409);
      expect((await json(second)).error.code).toBe('conflict');
   });

   it('searches by name and filters by tag and status', async () => {
      const owner = await auth();
      await seedSubscribers(baseEnv(), [
         { email: 'alice@example.com', first_name: 'Alice', tags: ['vip'] },
         { email: 'bob@example.com', first_name: 'Bob', tags: ['news'] },
         { email: 'carol@example.com', first_name: 'Carol', status: 'unsubscribed' },
      ]);

      const search = await app.request('/api/v1/subscribers?q=ali', {
         headers: { cookie: owner.cookie },
      });
      expect((await json(search)).data.map((row: { email: string }) => row.email)).toEqual([
         'alice@example.com',
      ]);

      const tagged = await app.request('/api/v1/subscribers?tag=vip', {
         headers: { cookie: owner.cookie },
      });
      expect((await json(tagged)).data).toHaveLength(1);

      const unsubscribed = await app.request('/api/v1/subscribers?status=unsubscribed', {
         headers: { cookie: owner.cookie },
      });
      const unsubscribedBody = await json(unsubscribed);
      expect(unsubscribedBody.data).toHaveLength(1);
      expect(unsubscribedBody.data[0].email).toBe('carol@example.com');
   });

   it('paginates with a keyset cursor', async () => {
      const owner = await auth();
      const createdAt = now();
      await seedSubscribers(baseEnv(), [
         { email: 'one@example.com', createdAt },
         { email: 'two@example.com', createdAt: createdAt - 1 },
         { email: 'three@example.com', createdAt: createdAt - 2 },
      ]);

      const first = await app.request('/api/v1/subscribers?limit=2', {
         headers: { cookie: owner.cookie },
      });
      const firstBody = await json(first);
      expect(firstBody.data).toHaveLength(2);
      expect(firstBody.meta.hasMore).toBe(true);
      expect(typeof firstBody.meta.nextCursor).toBe('string');

      const second = await app.request(
         `/api/v1/subscribers?limit=2&cursor=${encodeURIComponent(firstBody.meta.nextCursor)}`,
         { headers: { cookie: owner.cookie } },
      );
      const secondBody = await json(second);
      expect(secondBody.data).toHaveLength(1);
      expect(secondBody.meta.hasMore).toBe(false);

      const emails = [...firstBody.data, ...secondBody.data].map(
         (row: { email: string }) => row.email,
      );
      expect(new Set(emails).size).toBe(3);
   });

   it('imports a CSV, reports bad rows and counts duplicates', async () => {
      const owner = await auth();
      const csv = [
         'email,first_name,last_name,tags',
         'good@example.com,Ada,Lovelace,vip;news',
         'not-an-email,Bad,Row,',
         'good@example.com,Ada,Lovelace,vip',
      ].join('\n');

      const response = await app.request('/api/v1/subscribers/import', {
         method: 'POST',
         headers: authHeaders(owner),
         body: JSON.stringify({ csv, tags: ['imported'] }),
      });

      expect(response.status).toBe(200);
      const body = await json(response);
      expect(body.data.imported).toBe(1);
      expect(body.data.updated).toBe(0);
      expect(body.data.skipped).toBe(1);
      expect(body.data.errors).toHaveLength(1);
      expect(body.data.errors[0].line).toBe(3);

      const list = await app.request('/api/v1/subscribers?tag=imported', {
         headers: { cookie: owner.cookie },
      });
      const rows = (await json(list)).data;
      expect(rows).toHaveLength(1);
      expect(rows[0].tags.map((tag: { name: string }) => tag.name).sort()).toEqual([
         'imported',
         'news',
         'vip',
      ]);
   });

   it('exports subscribers as CSV', async () => {
      const owner = await auth();
      await seedSubscribers(baseEnv(), [{ email: 'export@example.com', tags: ['vip'] }]);

      const response = await app.request('/api/v1/subscribers/export', {
         headers: { cookie: owner.cookie },
      });

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/csv');
      expect(response.headers.get('content-disposition')).toContain('subscribers.csv');

      const text = await response.text();
      expect(text.split('\n')[0]).toBe('email,first_name,last_name,tags,status,created_at');
      expect(text).toContain('export@example.com');
      expect(text).toContain('vip');
   });

   it('adds and removes tags in bulk', async () => {
      const owner = await auth();
      const ids = await seedSubscribers(baseEnv(), [
         { email: 'bulk1@example.com' },
         { email: 'bulk2@example.com' },
      ]);

      const added = await app.request('/api/v1/subscribers/bulk-tags', {
         method: 'POST',
         headers: authHeaders(owner),
         body: JSON.stringify({ subscriberIds: ids, add: ['vip'] }),
      });
      expect(added.status).toBe(200);

      const tagged = await app.request('/api/v1/subscribers?tag=vip', {
         headers: { cookie: owner.cookie },
      });
      expect((await json(tagged)).data).toHaveLength(2);

      const removed = await app.request('/api/v1/subscribers/bulk-tags', {
         method: 'POST',
         headers: authHeaders(owner),
         body: JSON.stringify({ subscriberIds: ids, remove: ['vip'] }),
      });
      expect(removed.status).toBe(200);

      const empty = await app.request('/api/v1/subscribers?tag=vip', {
         headers: { cookie: owner.cookie },
      });
      expect((await json(empty)).data).toHaveLength(0);
   });

   it('attaches a tag idempotently and detaches it', async () => {
      const owner = await auth();
      const [subscriberId] = await seedSubscribers(baseEnv(), [{ email: 'tagged@example.com' }]);
      const tagId = await ensureTag(baseEnv().DB, 'vip');

      const first = await app.request(`/api/v1/subscribers/${subscriberId}/tags`, {
         method: 'POST',
         headers: authHeaders(owner),
         body: JSON.stringify({ tagId }),
      });
      expect(first.status).toBe(200);

      const second = await app.request(`/api/v1/subscribers/${subscriberId}/tags`, {
         method: 'POST',
         headers: authHeaders(owner),
         body: JSON.stringify({ tagId }),
      });
      expect(second.status).toBe(200);

      const tagged = await app.request('/api/v1/subscribers?tag=vip', {
         headers: { cookie: owner.cookie },
      });
      const rows = (await json(tagged)).data;
      expect(rows).toHaveLength(1);
      expect(rows[0].tags).toEqual([{ id: tagId, name: 'vip' }]);

      const detached = await app.request(`/api/v1/subscribers/${subscriberId}/tags/${tagId}`, {
         method: 'DELETE',
         headers: authHeaders(owner),
      });
      expect(detached.status).toBe(200);

      const empty = await app.request('/api/v1/subscribers?tag=vip', {
         headers: { cookie: owner.cookie },
      });
      expect((await json(empty)).data).toHaveLength(0);
   });

   it('returns 404 when attaching a tag to a missing subscriber or tag', async () => {
      const owner = await auth();
      const [subscriberId] = await seedSubscribers(baseEnv(), [
         { email: 'missing-refs@example.com' },
      ]);
      const tagId = await ensureTag(baseEnv().DB, 'vip');

      const missingSubscriber = await app.request('/api/v1/subscribers/sub_missing/tags', {
         method: 'POST',
         headers: authHeaders(owner),
         body: JSON.stringify({ tagId }),
      });
      expect(missingSubscriber.status).toBe(404);

      const missingTag = await app.request(`/api/v1/subscribers/${subscriberId}/tags`, {
         method: 'POST',
         headers: authHeaders(owner),
         body: JSON.stringify({ tagId: 'tag_missing' }),
      });
      expect(missingTag.status).toBe(404);
   });
});
