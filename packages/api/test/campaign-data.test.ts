import { beforeEach, describe, expect, it } from 'vitest';
import { createDocument, createRepeatBlock, createTextBlock } from '@postwren/email/ir';
import type { Auth } from './helpers';
import {
   authHeaders,
   baseEnv,
   createAppForTest,
   json,
   now,
   resetDb,
   seedOwner,
   seedSubscribers,
   seedTemplate,
} from './helpers';

const app = createAppForTest();

beforeEach(async () => {
   await resetDb();
});

function repeatTemplate() {
   const document = createDocument();
   const repeat = createRepeatBlock();
   repeat.data = 'posts';
   repeat.itemKey = 'slug';
   repeat.children = [createTextBlock('{{ item.title }} — {{ itemIndex1 }}')];
   document.children = [repeat];
   return document;
}

async function createCampaign(
   owner: Auth,
   data: unknown,
): Promise<{ id: string; data: Record<string, unknown> }> {
   const template = await seedTemplate(baseEnv(), { document: repeatTemplate() });
   await seedSubscribers(baseEnv(), [{ email: 'reader@example.com', tags: ['news'] }]);

   const response = await app.request('/api/v1/campaigns', {
      method: 'POST',
      headers: authHeaders(owner),
      body: JSON.stringify({
         name: 'Blog digest',
         templateId: template.id,
         subject: 'The latest posts',
         fromName: 'Sender',
         fromEmail: 'noreply@example.com',
         audienceQuery: 'tag:news',
         data,
      }),
   });

   expect(response.status).toBe(201);
   return (await json(response)).data;
}

describe('campaign data', () => {
   it('stores and previews a repeat payload', async () => {
      const owner = await seedOwner(baseEnv());
      const data = {
         posts: [
            {
               slug: 'first',
               title: 'First post',
               url: 'https://example.com/first',
            },
            {
               slug: 'second',
               title: 'Second post',
               url: 'https://example.com/second',
            },
         ],
      };
      const campaign = await createCampaign(owner, data);

      expect(campaign.data).toEqual(data);

      const preview = await app.request(`/api/v1/campaigns/${campaign.id}/preview`, {
         headers: { cookie: owner.cookie },
      });
      expect(preview.status).toBe(200);
      const html = (await json(preview)).data.html as string;
      expect(html).toContain('First post');
      expect(html).toContain('Second post');
   });

   it('snapshots the payload when the campaign is scheduled', async () => {
      const owner = await seedOwner(baseEnv());
      const data = {
         posts: [{ slug: 'first', title: 'First post', url: 'https://example.com/first' }],
      };
      const campaign = await createCampaign(owner, data);

      const scheduled = await app.request(`/api/v1/campaigns/${campaign.id}/schedule`, {
         method: 'POST',
         headers: authHeaders(owner),
         body: JSON.stringify({ scheduledAt: now() + 3600 }),
      });
      expect(scheduled.status).toBe(200);

      const row = await baseEnv()
         .DB.prepare('SELECT data_json, data_snapshot FROM campaigns WHERE id = ?')
         .bind(campaign.id)
         .first<{ data_json: string; data_snapshot: string | null }>();
      expect(row?.data_snapshot).toBe(row?.data_json);
   });

   it('replaces data on patch', async () => {
      const owner = await seedOwner(baseEnv());
      const campaign = await createCampaign(owner, {
         posts: [{ title: 'First', url: 'https://example.com/first' }],
      });

      const patched = await app.request(`/api/v1/campaigns/${campaign.id}`, {
         method: 'PATCH',
         headers: authHeaders(owner),
         body: JSON.stringify({
            data: { posts: [{ title: 'Replacement', url: 'https://example.com/replacement' }] },
         }),
      });

      expect(patched.status).toBe(200);
      expect((await json(patched)).data.data).toEqual({
         posts: [{ title: 'Replacement', url: 'https://example.com/replacement' }],
      });
   });

   it('rejects nested objects and a non-object root', async () => {
      const owner = await seedOwner(baseEnv());
      const template = await seedTemplate(baseEnv(), { document: repeatTemplate() });

      const nested = await app.request('/api/v1/campaigns', {
         method: 'POST',
         headers: authHeaders(owner),
         body: JSON.stringify({
            name: 'Bad data',
            templateId: template.id,
            subject: 'Bad',
            fromName: 'Sender',
            fromEmail: 'noreply@example.com',
            audienceQuery: '',
            data: { posts: [{ title: 'Bad', detail: { nested: true } }] },
         }),
      });
      expect(nested.status).toBe(422);
      expect((await json(nested)).error.details.issues).toEqual(
         expect.arrayContaining([expect.stringContaining('detail')]),
      );

      const root = await app.request('/api/v1/campaigns', {
         method: 'POST',
         headers: authHeaders(owner),
         body: JSON.stringify({
            name: 'Bad root',
            templateId: template.id,
            subject: 'Bad',
            fromName: 'Sender',
            fromEmail: 'noreply@example.com',
            audienceQuery: '',
            data: [{ title: 'Not a root object' }],
         }),
      });
      expect(root.status).toBe(422);
      expect((await json(root)).error.details.issues).toEqual(['Data must be a JSON object']);
   });
});
