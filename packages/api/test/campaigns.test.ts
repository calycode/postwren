import { beforeEach, describe, expect, it } from 'vitest';
import { createDocument } from '@postwren/email/ir';
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

   it('refuses to schedule or send a campaign without a configured APP_URL', async () => {
      const owner = await seedOwner(baseEnv());
      const campaign = await createCampaign(owner);
      const noUrl = createAppForTest({ APP_URL: '' });

      const schedule = await noUrl.request(`/api/v1/campaigns/${campaign.id}/schedule`, {
         method: 'POST',
         headers: authHeaders(owner),
         body: JSON.stringify({ scheduledAt: now() + 3600 }),
      });

      expect(schedule.status).toBe(422);
      expect((await json(schedule)).error.code).toBe('app_url_missing');

      const sendNow = await noUrl.request(`/api/v1/campaigns/${campaign.id}/send-now`, {
         method: 'POST',
         headers: authHeaders(owner),
      });

      expect(sendNow.status).toBe(422);
      expect((await json(sendNow)).error.code).toBe('app_url_missing');
   });

   it('accepts a bare host in APP_URL', async () => {
      const owner = await seedOwner(baseEnv());
      const campaign = await createCampaign(owner);
      const bare = createAppForTest({ APP_URL: 'postwren.calycode.com' });

      const response = await bare.request(`/api/v1/campaigns/${campaign.id}/schedule`, {
         method: 'POST',
         headers: authHeaders(owner),
         body: JSON.stringify({ scheduledAt: now() + 3600 }),
      });

      expect(response.status).toBe(200);
      expect((await json(response)).data.status).toBe('scheduled');
   });

   it('reports an invalid APP_URL separately from a missing one', async () => {
      const owner = await seedOwner(baseEnv());
      const campaign = await createCampaign(owner);
      const invalid = createAppForTest({ APP_URL: 'ftp://postwren.calycode.com' });

      const response = await invalid.request(`/api/v1/campaigns/${campaign.id}/schedule`, {
         method: 'POST',
         headers: authHeaders(owner),
         body: JSON.stringify({ scheduledAt: now() + 3600 }),
      });

      expect(response.status).toBe(422);
      expect((await json(response)).error.code).toBe('app_url_invalid');
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

   it('stores campaign metadata and merges patches', async () => {
      const owner = await seedOwner(baseEnv());
      const template = await seedTemplate(baseEnv());

      const created = await app.request('/api/v1/campaigns', {
         method: 'POST',
         headers: authHeaders(owner),
         body: JSON.stringify({
            name: 'Weekly',
            templateId: template.id,
            subject: 'This week',
            fromName: 'Sender',
            fromEmail: 'noreply@example.com',
            audienceQuery: 'tag:news',
            metadata: { edition: 'october', region: 'eu' },
         }),
      });
      expect(created.status).toBe(201);
      const campaign = (await json(created)).data;
      expect(campaign.metadata).toEqual({ edition: 'october', region: 'eu' });
      expect(campaign.metadata_json).toBeUndefined();

      const patched = await app.request(`/api/v1/campaigns/${campaign.id}`, {
         method: 'PATCH',
         headers: authHeaders(owner),
         body: JSON.stringify({ metadata: { edition: 'november', region: null } }),
      });
      expect(patched.status).toBe(200);
      expect((await json(patched)).data.metadata).toEqual({ edition: 'november' });

      const list = await app.request('/api/v1/campaigns', {
         headers: { cookie: owner.cookie },
      });
      expect((await json(list)).data[0].metadata).toEqual({ edition: 'november' });
   });

   it('sends campaign metadata from the campaign row, not the template', async () => {
      const owner = await seedOwner(baseEnv());
      const document = createDocument();
      const text = document.children[0];
      if (text?.type === 'text') text.text = 'Edition {{ campaign.meta.edition }}';
      const template = await seedTemplate(baseEnv(), { document });

      const created = await app.request('/api/v1/campaigns', {
         method: 'POST',
         headers: authHeaders(owner),
         body: JSON.stringify({
            name: 'Weekly',
            templateId: template.id,
            subject: 'This week',
            fromName: 'Sender',
            fromEmail: 'noreply@example.com',
            audienceQuery: '',
            metadata: { edition: 'october' },
         }),
      });
      const campaign = (await json(created)).data;

      const preview = await app.request(`/api/v1/campaigns/${campaign.id}/preview`, {
         headers: { cookie: owner.cookie },
      });

      expect(preview.status).toBe(200);
      expect((await json(preview)).data.html).toContain('Edition october');
   });

   it('freezes campaign metadata when the campaign is pinned', async () => {
      const owner = await seedOwner(baseEnv());
      const document = createDocument();
      const text = document.children[0];
      if (text?.type === 'text') text.text = 'Edition {{ campaign.meta.edition }}';
      const template = await seedTemplate(baseEnv(), { document });

      const created = await app.request('/api/v1/campaigns', {
         method: 'POST',
         headers: authHeaders(owner),
         body: JSON.stringify({
            name: 'Frozen',
            templateId: template.id,
            subject: 'This week',
            fromName: 'Sender',
            fromEmail: 'noreply@example.com',
            audienceQuery: '',
            metadata: { edition: 'october' },
         }),
      });
      const campaign = (await json(created)).data;

      const scheduled = await app.request(`/api/v1/campaigns/${campaign.id}/schedule`, {
         method: 'POST',
         headers: authHeaders(owner),
         body: JSON.stringify({ scheduledAt: 4_000_000_000 }),
      });
      expect(scheduled.status).toBe(200);

      const patched = await app.request(`/api/v1/campaigns/${campaign.id}`, {
         method: 'PATCH',
         headers: authHeaders(owner),
         body: JSON.stringify({ metadata: { edition: 'november' } }),
      });
      expect((await json(patched)).data.metadata).toEqual({ edition: 'november' });

      const preview = await app.request(`/api/v1/campaigns/${campaign.id}/preview`, {
         headers: { cookie: owner.cookie },
      });

      const previewBody = await json(preview);
      expect(previewBody.data.html).toContain('Edition october');
      expect(previewBody.data.html).not.toContain('Edition november');
   });

   it('counts an audience selected by metadata', async () => {
      const owner = await seedOwner(baseEnv());
      await seedSubscribers(baseEnv(), [
         { email: 'pro@example.com', metadata: { plan: 'pro' } },
         { email: 'free@example.com', metadata: { plan: 'free' } },
         { email: 'none@example.com' },
      ]);

      const response = await app.request('/api/v1/audience/preview?q=meta:plan=pro', {
         headers: { cookie: owner.cookie },
      });

      expect(response.status).toBe(200);
      expect((await json(response)).data.count).toBe(1);
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
