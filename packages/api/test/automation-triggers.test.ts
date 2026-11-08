import { beforeEach, describe, expect, it } from 'vitest';
import { generateApiKey, apiKeyHash } from '../src/auth/api-key';
import {
   authHeaders,
   baseEnv,
   createAppForTest,
   ensureTag,
   json,
   now,
   resetDb,
   seedCampaign,
   seedOwner,
   seedRecipient,
   seedSubscribers,
   seedTemplate,
   signTokenForTest,
} from './helpers';

const app = createAppForTest();

beforeEach(async () => {
   await resetDb();
});

type AutomationBody = {
   name: string;
   triggerType: string;
   triggerConfig?: Record<string, string>;
   entryQuery?: string;
   fromName?: string;
   fromEmail?: string;
   steps?: Array<Record<string, unknown>>;
};

async function createAutomation(
   auth: Awaited<ReturnType<typeof seedOwner>>,
   body: AutomationBody,
): Promise<{ id: string; response: Response }> {
   const response = await app.request('/api/v1/automations', {
      method: 'POST',
      headers: authHeaders(auth),
      body: JSON.stringify({
         name: body.name,
         triggerType: body.triggerType,
         ...(body.triggerConfig === undefined ? {} : { triggerConfig: body.triggerConfig }),
         entryQuery: body.entryQuery ?? '',
         fromName: body.fromName ?? 'Postwren',
         fromEmail: body.fromEmail ?? 'noreply@example.com',
         steps: body.steps ?? [{ id: 'exit', type: 'exit' }],
      }),
   });
   const payload = await json(response.clone());
   return { id: payload.data?.id as string, response };
}

async function activate(
   auth: Awaited<ReturnType<typeof seedOwner>>,
   automationId: string,
): Promise<void> {
   await app.request(`/api/v1/automations/${automationId}/activate`, {
      method: 'POST',
      headers: authHeaders(auth),
   });
}

async function runCount(automationId: string): Promise<number> {
   const row = await baseEnv()
      .DB.prepare('SELECT COUNT(*) AS count FROM automation_runs WHERE automation_id = ?')
      .bind(automationId)
      .first<{ count: number }>();
   return row?.count ?? 0;
}

async function apiKey(scopes: string[]): Promise<string> {
   const { raw, prefix } = generateApiKey();
   await baseEnv()
      .DB.prepare(
         `INSERT INTO api_keys (id, name, prefix, key_hash, scopes, created_at, expires_at, revoked_at)
          VALUES (?, ?, ?, ?, ?, ?, NULL, NULL)`,
      )
      .bind(`key_${prefix}`, 'events', prefix, await apiKeyHash(raw), JSON.stringify(scopes), now())
      .run();
   return raw;
}

describe('automation triggers', () => {
   it('stores and exposes trigger config, and rejects an incomplete config', async () => {
      const auth = await seedOwner(baseEnv());

      const created = await createAutomation(auth, {
         name: 'Trial follow-up',
         triggerType: 'tag.added',
         triggerConfig: { tag: ' Trial ' },
      });
      expect(created.response.status).toBe(201);
      expect((await json(created.response)).data).toMatchObject({
         triggerType: 'tag.added',
         triggerConfig: { tag: 'trial' },
      });

      const invalid = await createAutomation(auth, {
         name: 'Broken trigger',
         triggerType: 'tag.added',
      });
      expect(invalid.response.status).toBe(400);
   });

   it('enrols a tag.added automation once per subscriber and tag', async () => {
      const auth = await seedOwner(baseEnv());
      const [subscriberId] = await seedSubscribers(baseEnv(), [{ email: 'tagged@example.com' }]);
      const tagId = await ensureTag(baseEnv().DB, 'trial');

      const created = await createAutomation(auth, {
         name: 'Trial follow-up',
         triggerType: 'tag.added',
         triggerConfig: { tag: 'trial' },
      });
      expect(created.response.status).toBe(201);
      await activate(auth, created.id);

      const first = await app.request(`/api/v1/subscribers/${subscriberId}/tags`, {
         method: 'POST',
         headers: authHeaders(auth),
         body: JSON.stringify({ tagId }),
      });
      expect(first.status).toBe(200);
      expect(await runCount(created.id)).toBe(1);

      await app.request(`/api/v1/subscribers/${subscriberId}/tags`, {
         method: 'POST',
         headers: authHeaders(auth),
         body: JSON.stringify({ tagId }),
      });
      expect(await runCount(created.id)).toBe(1);

      const wrongTagId = await ensureTag(baseEnv().DB, 'other');
      await app.request(`/api/v1/subscribers/${subscriberId}/tags`, {
         method: 'POST',
         headers: authHeaders(auth),
         body: JSON.stringify({ tagId: wrongTagId }),
      });
      expect(await runCount(created.id)).toBe(1);

      const run = await baseEnv()
         .DB.prepare('SELECT idempotency_key FROM automation_runs WHERE automation_id = ?')
         .bind(created.id)
         .first<{ idempotency_key: string }>();
      expect(run?.idempotency_key).toContain(':trial:');
   });

   it('starts tag.added automations from a public signup with default tags', async () => {
      const auth = await seedOwner(baseEnv());
      const created = await createAutomation(auth, {
         name: 'Newsletter welcome',
         triggerType: 'tag.added',
         triggerConfig: { tag: 'newsletter' },
      });
      await activate(auth, created.id);

      const keyResponse = await app.request('/api/v1/subscribe-keys', {
         method: 'POST',
         headers: authHeaders(auth),
         body: JSON.stringify({
            name: 'Marketing site',
            allowedOrigins: [],
            defaultTags: ['newsletter'],
         }),
      });
      expect(keyResponse.status).toBe(201);
      const secret = (await json(keyResponse)).data.key as string;

      const subscribed = await app.request('/api/public/subscribe', {
         method: 'POST',
         headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${secret}`,
            'cf-connecting-ip': '203.0.113.11',
         },
         body: JSON.stringify({ email: 'signup@example.com' }),
      });
      expect(subscribed.status).toBe(202);
      expect(await runCount(created.id)).toBe(1);
   });

   it('enrols campaign.clicked only for the configured campaign and link', async () => {
      const auth = await seedOwner(baseEnv());
      const [subscriberId] = await seedSubscribers(baseEnv(), [{ email: 'click@example.com' }]);
      const template = await seedTemplate(baseEnv(), { name: 'Click', subject: 'Click' });
      const campaignId = await seedCampaign(baseEnv(), { templateId: template.id });
      const otherCampaignId = await seedCampaign(baseEnv(), { templateId: template.id });
      const messageId = await seedRecipient(baseEnv(), {
         campaignId,
         subscriberId: subscriberId ?? '',
      });

      const matching = await createAutomation(auth, {
         name: 'Link click',
         triggerType: 'campaign.clicked',
         triggerConfig: { campaignId, linkId: 'cta' },
      });
      const other = await createAutomation(auth, {
         name: 'Other campaign',
         triggerType: 'campaign.clicked',
         triggerConfig: { campaignId: otherCampaignId },
      });
      await activate(auth, matching.id);
      await activate(auth, other.id);

      const token = await signTokenForTest(baseEnv().TOKEN_SECRET, 'click', {
         m: messageId,
         u: 'https://example.com/landing',
         l: 'cta',
      });

      const response = await app.request(`/t/c/${token}`);
      expect(response.status).toBe(302);
      expect(await runCount(matching.id)).toBe(1);
      expect(await runCount(other.id)).toBe(0);

      await app.request(`/t/c/${token}`);
      expect(await runCount(matching.id)).toBe(1);
   });

   it('accepts a named API event once per idempotency key', async () => {
      const auth = await seedOwner(baseEnv());
      await seedSubscribers(baseEnv(), [{ email: 'event@example.com' }]);
      const created = await createAutomation(auth, {
         name: 'Purchase',
         triggerType: 'api.event',
         triggerConfig: { name: 'purchase.completed' },
      });
      await activate(auth, created.id);

      const key = await apiKey(['events:write']);
      const body = JSON.stringify({
         email: 'event@example.com',
         event: 'purchase.completed',
         properties: { amount: 42 },
         idempotencyKey: 'order-123',
      });

      const first = await app.request('/api/v1/events', {
         method: 'POST',
         headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
         body,
      });
      expect(first.status).toBe(202);
      expect(await runCount(created.id)).toBe(1);

      const replay = await app.request('/api/v1/events', {
         method: 'POST',
         headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
         body,
      });
      expect(replay.status).toBe(202);
      expect(await runCount(created.id)).toBe(1);

      const events = await baseEnv()
         .DB.prepare('SELECT COUNT(*) AS count FROM automation_events')
         .first<{ count: number }>();
      expect(events?.count).toBe(1);
   });

   it('returns 202 for an unknown address and hides the outcome', async () => {
      const auth = await seedOwner(baseEnv());
      const created = await createAutomation(auth, {
         name: 'Purchase',
         triggerType: 'api.event',
         triggerConfig: { name: 'purchase.completed' },
      });
      await activate(auth, created.id);
      const key = await apiKey(['events:write']);

      const response = await app.request('/api/v1/events', {
         method: 'POST',
         headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
         body: JSON.stringify({ email: 'missing@example.com', event: 'purchase.completed' }),
      });

      expect(response.status).toBe(202);
      expect(await runCount(created.id)).toBe(0);
      const event = await baseEnv()
         .DB.prepare('SELECT subscriber_id FROM automation_events')
         .first<{ subscriber_id: string | null }>();
      expect(event?.subscriber_id).toBeNull();
   });

   it('requires events:write for the events endpoint', async () => {
      const auth = await seedOwner(baseEnv());
      const key = await apiKey(['emails:write']);

      const denied = await app.request('/api/v1/events', {
         method: 'POST',
         headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
         body: JSON.stringify({ email: 'event@example.com', event: 'purchase.completed' }),
      });
      expect(denied.status).toBe(403);

      const session = await app.request('/api/v1/events', {
         method: 'POST',
         headers: authHeaders(auth),
         body: JSON.stringify({ email: 'event@example.com', event: 'purchase.completed' }),
      });
      expect(session.status).toBe(202);
   });
});
