import { beforeEach, describe, expect, it } from 'vitest';
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

describe('template comments', () => {
   it('creates, lists, resolves, reopens and deletes a block note', async () => {
      const owner = await seedOwner(baseEnv());
      const template = await seedTemplate(baseEnv(), { name: 'Weekly' });

      const created = await app.request(`/api/v1/templates/${template.id}/comments`, {
         method: 'POST',
         headers: authHeaders(owner),
         body: JSON.stringify({
            blockId: template.document.children[0]?.id ?? 'block-1',
            body: 'Add the launch date before Friday.',
         }),
      });

      expect(created.status).toBe(201);
      const comment = (await json(created)).data;
      expect(comment).toMatchObject({
         template_id: template.id,
         body: 'Add the launch date before Friday.',
         status: 'open',
         resolved_at: null,
      });

      const listed = await app.request(`/api/v1/templates/${template.id}/comments`, {
         headers: { cookie: owner.cookie },
      });
      expect((await json(listed)).data).toHaveLength(1);

      const resolved = await app.request(
         `/api/v1/templates/${template.id}/comments/${comment.id}`,
         {
            method: 'PATCH',
            headers: authHeaders(owner),
            body: JSON.stringify({ status: 'done' }),
         },
      );
      const done = (await json(resolved)).data;
      expect(done.status).toBe('done');
      expect(done.resolved_at).toEqual(expect.any(Number));

      const edited = await app.request(`/api/v1/templates/${template.id}/comments/${comment.id}`, {
         method: 'PATCH',
         headers: authHeaders(owner),
         body: JSON.stringify({ body: 'Updated note' }),
      });
      const editedBody = (await json(edited)).data;
      expect(editedBody.body).toBe('Updated note');
      expect(editedBody.status).toBe('done');

      const reopened = await app.request(
         `/api/v1/templates/${template.id}/comments/${comment.id}`,
         {
            method: 'PATCH',
            headers: authHeaders(owner),
            body: JSON.stringify({ status: 'open' }),
         },
      );
      expect((await json(reopened)).data).toMatchObject({ status: 'open', resolved_at: null });

      const removed = await app.request(`/api/v1/templates/${template.id}/comments/${comment.id}`, {
         method: 'DELETE',
         headers: authHeaders(owner),
      });
      expect((await json(removed)).data).toMatchObject({ deleted: true });

      const empty = await app.request(`/api/v1/templates/${template.id}/comments`, {
         headers: { cookie: owner.cookie },
      });
      expect((await json(empty)).data).toHaveLength(0);
   });

   it('rejects an empty note and an unknown template', async () => {
      const owner = await seedOwner(baseEnv());
      const template = await seedTemplate(baseEnv());

      const empty = await app.request(`/api/v1/templates/${template.id}/comments`, {
         method: 'POST',
         headers: authHeaders(owner),
         body: JSON.stringify({ blockId: 'block-1', body: '   ' }),
      });
      expect(empty.status).toBe(422);

      const unknown = await app.request('/api/v1/templates/tpl_missing/comments', {
         headers: { cookie: owner.cookie },
      });
      expect(unknown.status).toBe(404);
   });

   it('keeps comments scoped to their template', async () => {
      const owner = await seedOwner(baseEnv());
      const first = await seedTemplate(baseEnv(), { name: 'First' });
      const second = await seedTemplate(baseEnv(), { name: 'Second' });

      const created = await app.request(`/api/v1/templates/${first.id}/comments`, {
         method: 'POST',
         headers: authHeaders(owner),
         body: JSON.stringify({ blockId: 'block-1', body: 'Only for the first template' }),
      });
      const comment = (await json(created)).data;

      const wrong = await app.request(`/api/v1/templates/${second.id}/comments/${comment.id}`, {
         method: 'PATCH',
         headers: authHeaders(owner),
         body: JSON.stringify({ status: 'done' }),
      });
      expect(wrong.status).toBe(404);
   });
});
