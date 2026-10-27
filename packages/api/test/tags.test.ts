import { beforeEach, describe, expect, it } from 'vitest';
import {
   authHeaders,
   baseEnv,
   createAppForTest,
   json,
   resetDb,
   seedOwner,
   seedSubscribers,
} from './helpers';

const app = createAppForTest();

beforeEach(async () => {
   await resetDb();
});

describe('tags', () => {
   it('creates, lists, renames and deletes tags', async () => {
      const owner = await seedOwner(baseEnv());

      const created = await app.request('/api/v1/tags', {
         method: 'POST',
         headers: authHeaders(owner),
         body: JSON.stringify({ name: 'Newsletter' }),
      });
      expect(created.status).toBe(201);
      const tag = (await json(created)).data;
      expect(tag.name).toBe('newsletter');

      const list = await app.request('/api/v1/tags', {
         headers: { cookie: owner.cookie },
      });
      expect((await json(list)).data).toHaveLength(1);

      const renamed = await app.request(`/api/v1/tags/${tag.id}`, {
         method: 'PATCH',
         headers: authHeaders(owner),
         body: JSON.stringify({ name: 'weekly' }),
      });
      expect(renamed.status).toBe(200);
      expect((await json(renamed)).data.name).toBe('weekly');

      const deleted = await app.request(`/api/v1/tags/${tag.id}`, {
         method: 'DELETE',
         headers: authHeaders(owner),
      });
      expect(deleted.status).toBe(200);

      const empty = await app.request('/api/v1/tags', {
         headers: { cookie: owner.cookie },
      });
      expect((await json(empty)).data).toHaveLength(0);
   });

   it('rejects duplicate tag names', async () => {
      const owner = await seedOwner(baseEnv());
      const body = JSON.stringify({ name: 'vip' });

      const first = await app.request('/api/v1/tags', {
         method: 'POST',
         headers: authHeaders(owner),
         body,
      });
      expect(first.status).toBe(201);

      const second = await app.request('/api/v1/tags', {
         method: 'POST',
         headers: authHeaders(owner),
         body,
      });
      expect(second.status).toBe(409);
   });

   it('returns subscriber counts and autocomplete results', async () => {
      const owner = await seedOwner(baseEnv());
      await seedSubscribers(baseEnv(), [
         { email: 'one@example.com', tags: ['newsletter'] },
         { email: 'two@example.com', tags: ['newsletter'] },
         { email: 'three@example.com', tags: ['news'] },
      ]);

      const list = await app.request('/api/v1/tags', {
         headers: { cookie: owner.cookie },
      });
      const tags = (await json(list)).data as Array<{ name: string; subscriber_count: number }>;
      expect(tags.find((tag) => tag.name === 'newsletter')?.subscriber_count).toBe(2);

      const auto = await app.request('/api/v1/tags/autocomplete?q=newsl', {
         headers: { cookie: owner.cookie },
      });
      const matches = (await json(auto)).data as Array<{ name: string }>;
      expect(matches.map((tag) => tag.name)).toEqual(['newsletter']);
   });
});
