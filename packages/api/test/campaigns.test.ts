import { beforeEach, describe, expect, it } from 'vitest';
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

async function createCampaign(owner: Auth): Promise<{ id: string }> {
   const template = await seedTemplate(baseEnv());
   await seedSubscribers(baseEnv(), [
      { email: 'news1@example.com', tags: ['news'] },
      { email: 'news2@example.com', tags: ['news'] },
      { email: 'other@example.com', tags: ['other'] },
   ]);

   const response = await app.request('/api/v1/campaigns', {
      method: 'POST',
      headers: authHeaders(owner),
      body: JSON.stringify({
         name: 'Weekly',
         templateId: template.id,
         subject: 'This week',
         fromName: 'Sender',
         fromEmail: 'noreply@example.com',
         audienceQuery: 'tag:news',
      }),
   });

   expect(response.status).toBe(201);
   return (await json(response)).data;
}

async function createCampaignWithSender(owner: Auth, fromEmail: string): Promise<Response> {
   const template = await seedTemplate(baseEnv());

   return app.request('/api/v1/campaigns', {
      method: 'POST',
      headers: authHeaders(owner),
      body: JSON.stringify({
         name: 'Weekly',
         templateId: template.id,
         subject: 'This week',
         fromName: 'Sender',
         fromEmail,
         audienceQuery: 'tag:news',
      }),
   });
}

describe('campaigns', () => {
   it('rejects a schedule time in the past', async () => {
      const owner = await seedOwner(baseEnv());
      const campaign = await createCampaign(owner);

      const response = await app.request(`/api/v1/campaigns/${campaign.id}/schedule`, {
         method: 'POST',
         headers: authHeaders(owner),
         body: JSON.stringify({ scheduledAt: now() - 60 }),
      });

      expect(response.status).toBe(422);
   });

   it('schedules a campaign and snapshots its audience', async () => {
      const owner = await seedOwner(baseEnv());
      const campaign = await createCampaign(owner);

      const response = await app.request(`/api/v1/campaigns/${campaign.id}/schedule`, {
         method: 'POST',
         headers: authHeaders(owner),
         body: JSON.stringify({ scheduledAt: now() + 3600 }),
      });

      expect(response.status).toBe(200);
      const body = (await json(response)).data;
      expect(body.status).toBe('scheduled');
      expect(body.audience_count).toBe(2);
      expect(body.template_revision).toBe(1);
   });

   it('rejects an illegal state transition', async () => {
      const owner = await seedOwner(baseEnv());
      const campaign = await createCampaign(owner);

      const response = await app.request(`/api/v1/campaigns/${campaign.id}/cancel`, {
         method: 'POST',
         headers: authHeaders(owner),
         body: JSON.stringify({}),
      });

      expect(response.status).toBe(409);
      expect((await json(response)).error.code).toBe('conflict');
   });

   it('previews an audience count', async () => {
      const owner = await seedOwner(baseEnv());
      await seedSubscribers(baseEnv(), [
         { email: 'a@example.com', tags: ['news'] },
         { email: 'b@example.com', tags: ['news', 'vip'] },
         { email: 'c@example.com', tags: ['vip'] },
      ]);

      const response = await app.request('/api/v1/audience/preview?q=tag:news%20-tag:vip', {
         headers: { cookie: owner.cookie },
      });

      expect(response.status).toBe(200);
      expect((await json(response)).data.count).toBe(1);
   });

   it('accepts the seeded default sender', async () => {
      const owner = await seedOwner(baseEnv());
      await app.request('/api/v1/settings/senders', {
         headers: { cookie: owner.cookie },
      });

      const response = await createCampaignWithSender(owner, 'noreply@example.com');

      expect(response.status).toBe(201);
   });

   it('rejects an unknown sender when sender addresses exist', async () => {
      const owner = await seedOwner(baseEnv());
      await app.request('/api/v1/settings/senders', {
         headers: { cookie: owner.cookie },
      });

      const response = await createCampaignWithSender(owner, 'stranger@example.org');

      expect(response.status).toBe(422);
      expect((await json(response)).error.details.fields.fromEmail).toContain('not a configured');
   });

   it('rejects an unverified sender', async () => {
      const owner = await seedOwner(baseEnv());
      const created = await app.request('/api/v1/settings/senders', {
         method: 'POST',
         headers: authHeaders(owner),
         body: JSON.stringify({ email: 'pending@example.org' }),
      });
      expect(created.status).toBe(201);

      const response = await createCampaignWithSender(owner, 'pending@example.org');

      expect(response.status).toBe(422);
      expect((await json(response)).error.details.fields.fromEmail).toContain('not verified');
   });

   it('accepts a verified sender', async () => {
      const owner = await seedOwner(baseEnv());
      const created = await app.request('/api/v1/settings/senders', {
         method: 'POST',
         headers: authHeaders(owner),
         body: JSON.stringify({ email: 'verified@example.org' }),
      });
      const address = (await json(created)).data;

      await app.request(`/api/v1/settings/senders/${address.id}`, {
         method: 'PATCH',
         headers: authHeaders(owner),
         body: JSON.stringify({ verified: true }),
      });

      const response = await createCampaignWithSender(owner, 'verified@example.org');

      expect(response.status).toBe(201);
   });
});

describe('campaign preview', () => {
   it('renders the campaign with sample merge data and the unsubscribe footer', async () => {
      const owner = await seedOwner();
      const { id } = await createCampaign(owner);

      const response = await app.request(`/api/v1/campaigns/${id}/preview`, {
         headers: { cookie: owner.cookie },
      });

      expect(response.status).toBe(200);
      const body = await json(response);
      expect(body.data.bytes).toBeGreaterThan(0);
      expect(body.data.html).not.toContain('{{');
      expect(body.data.html).toContain('unsubscribe');
      expect(Array.isArray(body.data.warnings)).toBe(true);
   });

   it('requires authentication', async () => {
      const owner = await seedOwner();
      const { id } = await createCampaign(owner);

      const response = await app.request(`/api/v1/campaigns/${id}/preview`);

      expect(response.status).toBe(401);
   });
});
