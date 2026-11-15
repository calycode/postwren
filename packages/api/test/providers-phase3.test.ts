import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
   createMailgunAdapter,
   createPostmarkAdapter,
   createSendGridAdapter,
} from '../src/adapters/email';
import { verifyMailgunSignature } from '../src/lib/email-events';
import workerHandler from '../src/index';
import {
   authHeaders,
   baseEnv,
   createAppForTest,
   FakeQueue,
   json,
   makeBatch,
   now,
   resetDb,
   seedCampaign,
   seedOwner,
   seedRecipient,
   seedSubscribers,
   seedTemplate,
   withQueue,
} from './helpers';

const app = createAppForTest();
const webhookSecret = btoa('a-test-webhook-secret');

beforeEach(async () => {
   await resetDb();
});

afterEach(() => {
   vi.unstubAllGlobals();
});

type Owner = Awaited<ReturnType<typeof seedOwner>>;

async function configureProvider(owner: Owner, input: Record<string, unknown>): Promise<string> {
   const response = await app.request('/api/v1/settings/sending-provider', {
      method: 'PUT',
      headers: authHeaders(owner),
      body: JSON.stringify(input),
   });

   expect(response.status).toBe(200);
   return (await json(response)).data.webhookUrl as string;
}

async function hmacHex(secret: string, value: string): Promise<string> {
   const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
   );
   const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
   return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function message(to = 'reader@example.com'): {
   from: { name: string; email: string };
   to: string;
   subject: string;
   html: string;
   text: string;
   replyTo: string;
   headers: Record<string, string>;
} {
   return {
      from: { name: 'Sender', email: 'sender@example.com' },
      to,
      subject: 'Hello',
      html: '<p>Hello</p>',
      text: 'Hello',
      replyTo: 'reply@example.com',
      headers: { 'List-Unsubscribe': '<https://example.com/u/1>' },
   };
}

describe('additional adapters', () => {
   it('maps a Postmark message and a per-item batch result', async () => {
      const calls: Array<{ url: string; body: unknown; token: string | null }> = [];
      const adapter = createPostmarkAdapter({
         serverToken: 'postmark-token',
         devMode: false,
         fetchImpl: async (input, init) => {
            const headers = new Headers(init?.headers);
            calls.push({
               url: String(input),
               body: JSON.parse(String(init?.body)),
               token: headers.get('x-postmark-server-token'),
            });
            const body = JSON.parse(String(init?.body));
            if (Array.isArray(body)) {
               return new Response(
                  JSON.stringify([
                     { MessageID: 'pm_1', ErrorCode: 0, To: 'a@example.com' },
                     { ErrorCode: 300, Message: 'Invalid email address' },
                  ]),
                  { status: 200, headers: { 'content-type': 'application/json' } },
               );
            }
            return new Response(JSON.stringify({ MessageID: 'pm_single', ErrorCode: 0 }), {
               status: 200,
               headers: { 'content-type': 'application/json' },
            });
         },
      });

      const single = await adapter.send(message());
      expect(single.providerMessageId).toBe('pm_single');
      expect(calls[0]?.token).toBe('postmark-token');
      expect(calls[0]?.body).toMatchObject({
         From: 'Sender <sender@example.com>',
         To: 'reader@example.com',
         Subject: 'Hello',
         HtmlBody: '<p>Hello</p>',
         TextBody: 'Hello',
         ReplyTo: 'reply@example.com',
         Headers: [{ Name: 'List-Unsubscribe', Value: '<https://example.com/u/1>' }],
      });

      const results = await adapter.sendBatch!([
         message('a@example.com'),
         message('b@example.com'),
      ]);
      expect(results).toEqual([
         { ok: true, providerMessageId: 'pm_1' },
         {
            ok: false,
            code: '300',
            failure: 'permanent',
            message: 'Invalid email address',
            retryAfterSeconds: null,
         },
      ]);
   });

   it('maps a SendGrid message and returns its message id', async () => {
      let body: unknown;
      let authorization: string | null = null;
      const adapter = createSendGridAdapter({
         apiKey: 'SG.key',
         devMode: false,
         fetchImpl: async (input, init) => {
            body = JSON.parse(String(init?.body));
            authorization = new Headers(init?.headers).get('authorization');
            return new Response(null, {
               status: 202,
               headers: { 'x-message-id': 'sg_1' },
            });
         },
      });

      const result = await adapter.send(message());
      expect(result.providerMessageId).toBe('sg_1');
      expect(authorization).toBe('Bearer SG.key');
      expect(body).toMatchObject({
         personalizations: [{ to: [{ email: 'reader@example.com' }] }],
         from: { email: 'sender@example.com', name: 'Sender' },
         subject: 'Hello',
         reply_to: { email: 'reply@example.com' },
         content: [
            { type: 'text/plain', value: 'Hello' },
            { type: 'text/html', value: '<p>Hello</p>' },
         ],
      });
   });

   it('posts a Mailgun form and verifies its signed webhook', async () => {
      let body = '';
      let authorization: string | null = null;
      const adapter = createMailgunAdapter({
         apiKey: 'key-test',
         domain: 'mg.example.com',
         devMode: false,
         fetchImpl: async (input, init) => {
            body = String(init?.body);
            authorization = new Headers(init?.headers).get('authorization');
            expect(String(input)).toBe('https://api.mailgun.net/v3/mg.example.com/messages');
            return new Response(JSON.stringify({ id: '<mg_1@example.com>' }), {
               status: 200,
               headers: { 'content-type': 'application/json' },
            });
         },
      });

      const result = await adapter.send(message());
      expect(result.providerMessageId).toBe('<mg_1@example.com>');
      expect(authorization).toBe(`Basic ${btoa('api:key-test')}`);

      const form = new URLSearchParams(body);
      expect(form.get('from')).toBe('Sender <sender@example.com>');
      expect(form.get('to')).toBe('reader@example.com');
      expect(form.get('h:Reply-To')).toBe('reply@example.com');
      expect(form.get('h:List-Unsubscribe')).toBe('<https://example.com/u/1>');

      const timestamp = '1700000000';
      const token = 'a'.repeat(50);
      const signature = await hmacHex('mailgun-signing-key', `${timestamp}${token}`);
      await expect(
         verifyMailgunSignature({
            timestamp,
            token,
            signature,
            secret: 'mailgun-signing-key',
            now: Number(timestamp),
         }),
      ).resolves.toEqual({ ok: true });
   });
});

describe('batch sending', () => {
   it('renders a chunk and sends it through the provider batch endpoint', async () => {
      const owner = await seedOwner(baseEnv());
      await configureProvider(owner, {
         provider: 'resend',
         apiKey: 're_key_12345678',
         webhookSecret,
      });

      const target = baseEnv();
      const template = await seedTemplate(target);
      const subscriberIds = await seedSubscribers(target, [
         { email: 'a@example.com' },
         { email: 'b@example.com' },
         { email: 'c@example.com' },
      ]);
      const campaignId = await seedCampaign(target, {
         templateId: template.id,
         status: 'sending',
      });
      await target.DB.prepare('UPDATE campaigns SET provider = ? WHERE id = ?')
         .bind('resend', campaignId)
         .run();
      for (const subscriberId of subscriberIds) {
         await seedRecipient(target, { campaignId, subscriberId });
      }

      const calls: Array<{ url: string; body: unknown[] }> = [];
      vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
         const body = JSON.parse(String(init?.body)) as unknown[];
         calls.push({ url: String(input), body });
         return new Response(
            JSON.stringify({ data: body.map((_, index) => ({ id: `rs_${index + 1}` })) }),
            { status: 200, headers: { 'content-type': 'application/json' } },
         );
      });

      const { batch } = makeBatch([{ campaignId, recipientIds: subscriberIds }]);
      await workerHandler.queue(batch, withQueue(target, new FakeQueue()));

      expect(calls).toHaveLength(1);
      expect(calls[0]?.url).toBe('https://api.resend.com/emails/batch');
      expect(calls[0]?.body).toHaveLength(3);

      const rows = await target.DB.prepare(
         `SELECT status, provider_message_id FROM campaign_recipients
          WHERE campaign_id = ? ORDER BY provider_message_id`,
      )
         .bind(campaignId)
         .all<{ status: string; provider_message_id: string | null }>();

      expect(rows.results).toEqual([
         { status: 'sent', provider_message_id: 'rs_1' },
         { status: 'sent', provider_message_id: 'rs_2' },
         { status: 'sent', provider_message_id: 'rs_3' },
      ]);

      const campaign = await target.DB.prepare('SELECT status FROM campaigns WHERE id = ?')
         .bind(campaignId)
         .first<{ status: string }>();
      expect(campaign?.status).toBe('sent');
   });
});

describe('provider usage', () => {
   it('reads Resend plan limits on demand', async () => {
      const owner = await seedOwner(baseEnv());
      await configureProvider(owner, { provider: 'resend', apiKey: 're_key_12345678' });

      vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
         expect(String(input)).toBe('https://api.resend.com/usage');
         return new Response(
            JSON.stringify({
               emails: {
                  daily: { used: 10, limit: 100 },
                  monthly: { used: 50, limit: 3000 },
               },
               rate_limit: { limit: 10, duration: '1s' },
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
         );
      });

      const response = await app.request('/api/v1/settings/sending-provider/usage', {
         headers: { cookie: owner.cookie },
      });

      expect(response.status).toBe(200);
      expect((await json(response)).data).toMatchObject({
         supported: true,
         provider: 'resend',
         daily: { used: 10, limit: 100 },
         monthly: { used: 50, limit: 3000 },
         rateLimit: { limit: 10, duration: '1s' },
      });
   });

   it('reports usage as unsupported for providers without a usage API', async () => {
      const owner = await seedOwner(baseEnv());
      await configureProvider(owner, { provider: 'postmark', apiKey: 'postmark-token' });

      const response = await app.request('/api/v1/settings/sending-provider/usage', {
         headers: { cookie: owner.cookie },
      });

      expect(response.status).toBe(200);
      expect((await json(response)).data).toMatchObject({
         supported: false,
         provider: 'postmark',
      });
   });
});

describe('provider webhooks', () => {
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
      return { target, campaignId, subscriberId: subscriberId! };
   }

   it('accepts a token-authenticated Postmark complaint', async () => {
      const owner = await seedOwner(baseEnv());
      const url = await configureProvider(owner, {
         provider: 'postmark',
         apiKey: 'postmark-token',
      });
      const { target, subscriberId, campaignId } = await fixture('pm-1');

      const response = await app.request(new URL(url).pathname, {
         method: 'POST',
         headers: { 'content-type': 'application/json' },
         body: JSON.stringify({
            ID: 5,
            RecordType: 'SpamComplaint',
            MessageID: 'pm-1',
            Recipient: 'reader@example.com',
         }),
      });

      expect(response.status).toBe(200);

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

      const event = await target.DB.prepare(
         'SELECT provider, kind FROM email_events WHERE event_id = ?',
      )
         .bind('postmark:5')
         .first<{ provider: string; kind: string }>();
      expect(event).toEqual({ provider: 'postmark', kind: 'complained' });
   });

   it('verifies a Mailgun signature before recording a hard bounce', async () => {
      const owner = await seedOwner(baseEnv());
      const url = await configureProvider(owner, {
         provider: 'mailgun',
         apiKey: 'key-test',
         fromDomain: 'mg.example.com',
         webhookSecret: 'mailgun-signing-key',
      });
      const { target, subscriberId } = await fixture('mg-1');

      const timestamp = String(now());
      const token = 'a'.repeat(50);
      const signature = await hmacHex('mailgun-signing-key', `${timestamp}${token}`);

      const response = await app.request(new URL(url).pathname, {
         method: 'POST',
         headers: { 'content-type': 'application/json' },
         body: JSON.stringify({
            signature: { timestamp, token, signature },
            'event-data': {
               id: 'mg_event_1',
               event: 'failed',
               recipient: 'reader@example.com',
               severity: 'permanent',
               reason: '550 5.1.1 User unknown',
               message: { headers: { 'message-id': 'mg-1' } },
            },
         }),
      });

      expect(response.status).toBe(200);

      const subscriber = await target.DB.prepare('SELECT status FROM subscribers WHERE id = ?')
         .bind(subscriberId)
         .first<{ status: string }>();
      expect(subscriber?.status).toBe('bounced');
   });

   it('rejects a Mailgun payload with a bad signature', async () => {
      const owner = await seedOwner(baseEnv());
      const url = await configureProvider(owner, {
         provider: 'mailgun',
         apiKey: 'key-test',
         fromDomain: 'mg.example.com',
         webhookSecret: 'mailgun-signing-key',
      });

      const response = await app.request(new URL(url).pathname, {
         method: 'POST',
         headers: { 'content-type': 'application/json' },
         body: JSON.stringify({
            signature: {
               timestamp: String(now()),
               token: 'a'.repeat(50),
               signature: 'not-the-signature',
            },
            'event-data': {
               id: 'mg_event_bad',
               event: 'failed',
               recipient: 'reader@example.com',
               severity: 'permanent',
               message: { headers: { 'message-id': 'mg-bad' } },
            },
         }),
      });

      expect(response.status).toBe(401);
   });
});
