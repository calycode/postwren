import { beforeEach, describe, expect, it } from 'vitest';
import {
   authHeaders,
   baseEnv,
   createAppForTest,
   json,
   resetDb,
   seedOwner,
   seedSubscribers,
   seedTemplate,
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

   it('rewrites saved audiences and automation steps when a tag is renamed', async () => {
      const owner = await seedOwner(baseEnv());
      const tag = (
         await json(
            await app.request('/api/v1/tags', {
               method: 'POST',
               headers: authHeaders(owner),
               body: JSON.stringify({ name: 'vip' }),
            }),
         )
      ).data as { id: string };

      const template = await seedTemplate(baseEnv(), { name: 'Audience', subject: 'Audience' });
      const senderSettings = (
         await json(
            await app.request('/api/v1/settings/senders', {
               headers: { cookie: owner.cookie },
            }),
         )
      ).data as { defaultFrom: string };
      const campaignResponse = await app.request('/api/v1/campaigns', {
         method: 'POST',
         headers: authHeaders(owner),
         body: JSON.stringify({
            name: 'Tagged send',
            templateId: template.id,
            subject: 'Tagged',
            fromName: 'Sender',
            fromEmail: senderSettings.defaultFrom,
            audienceQuery: 'tag:vip tag:vip2',
         }),
      });
      expect(campaignResponse.status).toBe(201);
      const campaign = (await json(campaignResponse)).data as { id: string };

      const automation = (
         await json(
            await app.request('/api/v1/automations', {
               method: 'POST',
               headers: authHeaders(owner),
               body: JSON.stringify({
                  name: 'Tag rename',
                  triggerType: 'subscriber.created',
                  entryQuery: 'tag:vip',
                  fromName: 'Sender',
                  fromEmail: senderSettings.defaultFrom,
                  steps: [
                     { id: 'add', type: 'add_tag', tag: 'vip' },
                     { id: 'exit', type: 'exit' },
                  ],
               }),
            }),
         )
      ).data as { id: string };

      const list = (
         await json(
            await app.request('/api/v1/tags', {
               headers: { cookie: owner.cookie },
            }),
         )
      ).data as Array<{
         id: string;
         name: string;
         campaign_count: number;
         automation_count: number;
      }>;
      const before = list.find((item) => item.name === 'vip');
      expect(before?.campaign_count).toBe(1);
      expect(before?.automation_count).toBe(1);

      const renamed = await app.request(`/api/v1/tags/${tag.id}`, {
         method: 'PATCH',
         headers: authHeaders(owner),
         body: JSON.stringify({ name: 'vip-members' }),
      });
      expect(renamed.status).toBe(200);

      const campaignAfter = (
         await json(
            await app.request(`/api/v1/campaigns/${campaign.id}`, {
               headers: { cookie: owner.cookie },
            }),
         )
      ).data as { audience_query: string };
      expect(campaignAfter.audience_query).toBe('tag:vip-members tag:vip2');

      const automationAfter = (
         await json(
            await app.request(`/api/v1/automations/${automation.id}`, {
               headers: { cookie: owner.cookie },
            }),
         )
      ).data as { entryQuery: string; steps: Array<{ type: string; tag?: string }> };
      expect(automationAfter.entryQuery).toBe('tag:vip-members');
      expect(automationAfter.steps.find((step) => step.type === 'add_tag')?.tag).toBe(
         'vip-members',
      );
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
