import { beforeEach, describe, expect, it } from 'vitest';
import { createResendAdapter, ProviderSendError } from '../src/adapters/email';
import { decryptSecret, encryptSecret } from '../src/lib/secrets';
import {
   authHeaders,
   baseEnv,
   createAppForTest,
   json,
   now,
   resetDb,
   seedCampaign,
   seedOwner,
   seedRecipient,
   seedSubscribers,
   seedTemplate,
} from './helpers';

const app = createAppForTest();
const webhookSecret = btoa('a-test-webhook-secret');

beforeEach(async () => {
   await resetDb();
});

function base64Bytes(value: string): Uint8Array {
   const binary = atob(value);
   const bytes = new Uint8Array(binary.length);
   for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
   }
   return bytes;
}

async function signWebhook(id: string, timestamp: string, raw: string): Promise<string> {
   const key = await crypto.subtle.importKey(
      'raw',
      base64Bytes(webhookSecret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
   );
   const signature = await crypto.subtle.sign(
      'HMAC',
      key,
      new TextEncoder().encode(`${id}.${timestamp}.${raw}`),
   );
   const binary = String.fromCharCode(...new Uint8Array(signature));
   return `v1,${btoa(binary)}`;
}

async function configureResend(owner: Awaited<ReturnType<typeof seedOwner>>): Promise<string> {
   const response = await app.request('/api/v1/settings/sending-provider', {
      method: 'PUT',
      headers: authHeaders(owner),
      body: JSON.stringify({
         provider: 'resend',
         apiKey: 're_test_key_7890',
         webhookSecret,
      }),
   });

   expect(response.status).toBe(200);
   return (await json(response)).data.webhookUrl as string;
}

describe('provider settings', () => {
   it('defaults to Cloudflare without a stored row', async () => {
      const owner = await seedOwner(baseEnv());

      const response = await app.request('/api/v1/settings/sending-provider', {
         headers: { cookie: owner.cookie },
      });

      expect(response.status).toBe(200);
      expect((await json(response)).data).toMatchObject({
         provider: 'cloudflare',
         configured: true,
         apiKeyLast4: null,
         webhookUrl: null,
      });
   });

   it('stores the Resend key encrypted and never returns it', async () => {
      const owner = await seedOwner(baseEnv());
      const url = await configureResend(owner);

      expect(url).toContain('/api/email-events/resend/');

      const row = await baseEnv()
         .DB.prepare('SELECT * FROM email_providers WHERE provider = ?')
         .bind('resend')
         .first<{
            api_key_ciphertext: string;
            api_key_last4: string;
            is_default: number;
            webhook_secret_ciphertext: string;
         }>();

      expect(row?.api_key_ciphertext).toMatch(/^v1\./);
      expect(row?.api_key_ciphertext).not.toContain('re_test_key_7890');
      expect(row?.api_key_last4).toBe('7890');
      expect(row?.is_default).toBe(1);
      expect(row?.webhook_secret_ciphertext).toMatch(/^v1\./);

      const state = await json(
         await app.request('/api/v1/settings/sending-provider', {
            headers: { cookie: owner.cookie },
         }),
      );
      expect(JSON.stringify(state)).not.toContain('re_test_key_7890');
      expect(state.data).toMatchObject({
         provider: 'resend',
         configured: true,
         apiKeyLast4: '7890',
      });
   });

   it('refuses Resend without an API key', async () => {
      const owner = await seedOwner(baseEnv());

      const response = await app.request('/api/v1/settings/sending-provider', {
         method: 'PUT',
         headers: authHeaders(owner),
         body: JSON.stringify({ provider: 'resend' }),
      });

      expect(response.status).toBe(422);
   });

   it('round-trips an encrypted secret', async () => {
      const env = baseEnv();
      const ciphertext = await encryptSecret(env, 're_secret_value');
      expect(ciphertext).not.toContain('re_secret_value');
      await expect(decryptSecret(env, ciphertext)).resolves.toBe('re_secret_value');
   });
});

describe('Resend adapter', () => {
   it('maps the message to the Resend API and returns its id', async () => {
      let captured: { url: string; init: RequestInit } | null = null;
      const adapter = createResendAdapter({
         apiKey: 're_key',
         devMode: false,
         fetchImpl: async (input, init) => {
            captured = { url: String(input), init: init ?? {} };
            return new Response(JSON.stringify({ id: 'resend-message-1' }), {
               status: 200,
               headers: { 'content-type': 'application/json' },
            });
         },
      });

      const result = await adapter.send({
         from: { name: 'Sender', email: 'sender@example.com' },
         to: 'reader@example.com',
         subject: 'Hello',
         html: '<p>Hello</p>',
         text: 'Hello',
         replyTo: 'reply@example.com',
         headers: { 'List-Unsubscribe': '<https://example.com/u/1>' },
      });

      expect(result.providerMessageId).toBe('resend-message-1');
      expect(captured).not.toBeNull();

      const body = JSON.parse(captured!.init.body as string);
      expect(body).toMatchObject({
         from: 'Sender <sender@example.com>',
         to: ['reader@example.com'],
         subject: 'Hello',
         reply_to: 'reply@example.com',
         headers: { 'List-Unsubscribe': '<https://example.com/u/1>' },
      });
      expect((captured!.init.headers as Record<string, string>).authorization).toBe(
         'Bearer re_key',
      );
   });

   it('classifies rate and quota errors differently', () => {
      const adapter = createResendAdapter({ apiKey: 're_key', devMode: false });

      expect(
         adapter.classifyError(
            new ProviderSendError('rate_limit_exceeded', 'Too many requests', 429),
         ),
      ).toBe('rate');
      expect(
         adapter.classifyError(
            new ProviderSendError('rate_limit_exceeded', 'Daily email quota reached', 429),
         ),
      ).toBe('daily_quota');
      expect(
         adapter.classifyError(new ProviderSendError('invalid_api_key', 'Invalid key', 401)),
      ).toBe('account');
      expect(
         adapter.classifyError(new ProviderSendError('validation_error', 'Bad payload', 422)),
      ).toBe('permanent');
      expect(adapter.classifyError(new TypeError('network down'))).toBe('retry');
   });
});

describe('Resend webhooks', () => {
   async function fixture(messageId: string) {
      const target = baseEnv();
      const template = await seedTemplate(target);
      const [subscriberId] = await seedSubscribers(target, [
         { email: 'reader@example.com', status: 'subscribed' },
      ]);
      const campaignId = await seedCampaign(target, {
         templateId: template.id,
         status: 'sent',
      });
      await seedRecipient(target, {
         campaignId,
         subscriberId: subscriberId!,
         status: 'sent',
         providerMessageId: messageId,
      });
      return { target, subscriberId: subscriberId!, campaignId };
   }

   it('verifies the signature, suppresses a complaint and dedupes a replay', async () => {
      const owner = await seedOwner(baseEnv());
      const url = await configureResend(owner);
      const path = new URL(url).pathname;
      const { target, campaignId, subscriberId } = await fixture('resend-message-1');

      const raw = JSON.stringify({
         type: 'email.complained',
         created_at: '2026-11-14T10:00:00.000Z',
         data: {
            email_id: 'resend-message-1',
            to: ['reader@example.com'],
            subject: 'Hello',
            complaint: { type: 'abuse' },
         },
      });
      const id = 'msg_webhook_1';
      const timestamp = String(now());
      const signature = await signWebhook(id, timestamp, raw);
      const headers = {
         'content-type': 'application/json',
         'webhook-id': id,
         'webhook-timestamp': timestamp,
         'webhook-signature': signature,
      };

      const first = await app.request(path, { method: 'POST', headers, body: raw });
      expect(first.status).toBe(200);

      const replay = await app.request(path, { method: 'POST', headers, body: raw });
      expect(replay.status).toBe(200);

      const subscriber = await target.DB.prepare('SELECT status FROM subscribers WHERE id = ?')
         .bind(subscriberId)
         .first<{ status: string }>();
      expect(subscriber?.status).toBe('complained');

      const recipient = await target.DB.prepare(
         'SELECT status FROM campaign_recipients WHERE campaign_id = ?',
      )
         .bind(campaignId)
         .first<{ status: string }>();
      expect(recipient?.status).toBe('complained');

      const events = await target.DB.prepare('SELECT provider, kind, type FROM email_events').all<{
         provider: string;
         kind: string;
         type: string;
      }>();
      expect(events.results).toHaveLength(1);
      expect(events.results[0]).toMatchObject({
         provider: 'resend',
         kind: 'complained',
         type: 'email.complained',
      });
   });

   it('rejects a request whose signature does not match', async () => {
      const owner = await seedOwner(baseEnv());
      const url = await configureResend(owner);

      const response = await app.request(new URL(url).pathname, {
         method: 'POST',
         headers: {
            'content-type': 'application/json',
            'webhook-id': 'msg_bad',
            'webhook-timestamp': String(now()),
            'webhook-signature': 'v1,not-the-signature',
         },
         body: JSON.stringify({ type: 'email.complained', data: {} }),
      });

      expect(response.status).toBe(401);
      const count = await baseEnv().DB.prepare('SELECT COUNT(*) AS count FROM email_events').first<{
         count: number;
      }>();
      expect(count?.count).toBe(0);
   });

   it('pins the active provider when a campaign is scheduled', async () => {
      const owner = await seedOwner(baseEnv());
      await configureResend(owner);

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
            audienceQuery: '',
         }),
      });
      expect(created.status).toBe(201);
      const campaignId = (await json(created)).data.id as string;

      const scheduled = await app.request(`/api/v1/campaigns/${campaignId}/schedule`, {
         method: 'POST',
         headers: authHeaders(owner),
         body: JSON.stringify({ scheduledAt: now() + 3600 }),
      });
      expect(scheduled.status).toBe(200);

      const row = await baseEnv()
         .DB.prepare('SELECT provider FROM campaigns WHERE id = ?')
         .bind(campaignId)
         .first<{ provider: string }>();
      expect(row?.provider).toBe('resend');
   });
});
