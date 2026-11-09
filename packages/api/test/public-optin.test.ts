import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDocument, createTextBlock } from '@postwren/email/ir';
import {
   FakeEmail,
   authHeaders,
   baseEnv,
   createAppForTest,
   json,
   resetDb,
   seedCampaign,
   seedOwner,
   seedRecipient,
   seedSubscribers,
   seedTemplate,
   signTokenForTest,
} from './helpers';
import type { Auth } from './helpers';

beforeEach(async () => {
   await resetDb();
});

afterEach(() => {
   vi.unstubAllGlobals();
});

function turnstileResponse(success: boolean): Response {
   return new Response(JSON.stringify({ success }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
   });
}

async function createKey(
   app: ReturnType<typeof createAppForTest>,
   owner: Auth,
   overrides: Record<string, unknown> = {},
): Promise<{ id: string; key: string }> {
   const response = await app.request('/api/v1/subscribe-keys', {
      method: 'POST',
      headers: authHeaders(owner),
      body: JSON.stringify({
         name: 'Double opt-in form',
         allowedOrigins: ['https://site.example'],
         ...overrides,
      }),
   });
   expect(response.status).toBe(201);
   return (await json(response)).data;
}

function subscribe(
   app: ReturnType<typeof createAppForTest>,
   key: string,
   body: Record<string, unknown>,
): Promise<Response> {
   return Promise.resolve(
      app.request('/api/public/subscribe', {
         method: 'POST',
         headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${key}`,
            'cf-connecting-ip': '203.0.113.20',
         },
         body: JSON.stringify(body),
      }),
   );
}

describe('double opt-in', () => {
   it('holds a new subscriber as pending until the confirmation link is posted', async () => {
      const email = new FakeEmail();
      const app = createAppForTest({ EMAIL: email as never });
      const owner = await seedOwner(baseEnv());
      const key = await createKey(app, owner, { requireConfirmation: true });

      const response = await subscribe(app, key.key, {
         email: 'ada@example.com',
         firstName: 'Ada',
         tags: ['newsletter'],
      });

      expect(response.status).toBe(202);
      const body = await json(response);
      expect(body.data).toMatchObject({ subscribed: true, pending: true });
      expect(body.data.devConfirmUrl).toContain('/confirm/');
      expect(email.sent).toHaveLength(1);
      expect(email.sent[0]?.to).toBe('ada@example.com');
      expect(email.sent[0]?.html).toContain('/confirm/');

      const pending = await baseEnv()
         .DB.prepare('SELECT status, confirmed_at FROM subscribers WHERE email = ?')
         .bind('ada@example.com')
         .first<{ status: string; confirmed_at: number | null }>();
      expect(pending).toMatchObject({ status: 'pending', confirmed_at: null });

      const confirmPath = new URL(body.data.devConfirmUrl as string).pathname;
      const page = await app.request(confirmPath);
      const pageHtml = await page.text();
      expect(pageHtml).toContain('id="confirm-form"');
      expect(pageHtml).toContain('.submit()');

      const confirmed = await app.request(confirmPath, { method: 'POST' });
      expect(confirmed.status).toBe(200);
      expect(await confirmed.text()).toContain('Subscription confirmed');

      const active = await baseEnv()
         .DB.prepare('SELECT status, confirmed_at FROM subscribers WHERE email = ?')
         .bind('ada@example.com')
         .first<{ status: string; confirmed_at: number | null }>();
      expect(active?.status).toBe('subscribed');
      expect(active?.confirmed_at).toEqual(expect.any(Number));
   });

   it('keeps the immediate path for a key without confirmation', async () => {
      const app = createAppForTest();
      const owner = await seedOwner(baseEnv());
      const key = await createKey(app, owner);

      const response = await subscribe(app, key.key, { email: 'grace@example.com' });
      const body = await json(response);

      expect(body.data).toEqual({ subscribed: true });
      const row = await baseEnv()
         .DB.prepare('SELECT status FROM subscribers WHERE email = ?')
         .bind('grace@example.com')
         .first<{ status: string }>();
      expect(row?.status).toBe('subscribed');
   });
});

describe('Turnstile at the public endpoint', () => {
   it('requires a token when the key has a site key', async () => {
      const app = createAppForTest({ TURNSTILE_SECRET: 'turnstile-secret' });
      const owner = await seedOwner(baseEnv());
      const key = await createKey(app, owner, { turnstileSiteKey: '0x4AAAA_test' });

      const missing = await subscribe(app, key.key, { email: 'ada@example.com' });
      expect(missing.status).toBe(422);
      expect((await json(missing)).error.code).toBe('turnstile_required');

      vi.stubGlobal(
         'fetch',
         vi.fn(async () => turnstileResponse(true)),
      );
      const accepted = await subscribe(app, key.key, {
         email: 'ada@example.com',
         turnstileToken: 'token-from-widget',
      });
      expect(accepted.status).toBe(202);
   });

   it('rejects a token Cloudflare does not accept', async () => {
      const app = createAppForTest({ TURNSTILE_SECRET: 'turnstile-secret' });
      const owner = await seedOwner(baseEnv());
      const key = await createKey(app, owner, { turnstileSiteKey: '0x4AAAA_test' });

      vi.stubGlobal(
         'fetch',
         vi.fn(async () => turnstileResponse(false)),
      );

      const response = await subscribe(app, key.key, {
         email: 'ada@example.com',
         turnstileToken: 'bad-token',
      });
      expect(response.status).toBe(422);
      expect((await json(response)).error.code).toBe('turnstile_failed');
   });

   it('fails closed when the secret is missing', async () => {
      const app = createAppForTest();
      const owner = await seedOwner(baseEnv());
      const key = await createKey(app, owner, { turnstileSiteKey: '0x4AAAA_test' });

      const response = await subscribe(app, key.key, {
         email: 'ada@example.com',
         turnstileToken: 'token-from-widget',
      });
      expect(response.status).toBe(503);
      expect((await json(response)).error.code).toBe('turnstile_not_configured');
   });
});

describe('email hygiene at the public endpoint', () => {
   it('rejects a disposable address', async () => {
      const app = createAppForTest();
      const owner = await seedOwner(baseEnv());
      const key = await createKey(app, owner);

      const response = await subscribe(app, key.key, { email: 'ada@mailinator.com' });
      expect(response.status).toBe(422);
      expect((await json(response)).error.code).toBe('undeliverable_email');
   });

   it('rejects a likely typo and returns the suggestion', async () => {
      const app = createAppForTest();
      const owner = await seedOwner(baseEnv());
      const key = await createKey(app, owner);

      const response = await subscribe(app, key.key, { email: 'ada@gmial.com' });
      expect(response.status).toBe(422);
      expect((await json(response)).error).toMatchObject({
         code: 'undeliverable_email',
         details: { suggestion: 'ada@gmail.com' },
      });
   });
});

describe('public web version', () => {
   it('renders a sent campaign from its frozen content', async () => {
      const app = createAppForTest();
      const target = baseEnv();
      const document = createDocument();
      const template = await seedTemplate(target, { document, name: 'Weekly' });
      const campaignId = await seedCampaign(target, {
         templateId: template.id,
         status: 'sent',
         name: 'Weekly issue',
      });

      const response = await app.request(`/p/${campaignId}`);

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/html');
      const html = await response.text();
      expect(html).toContain('Write something');
      expect(html).not.toContain('/t/o/');
   });

   it('renders the recipient context when the signed web token is present', async () => {
      const app = createAppForTest();
      const target = baseEnv();
      const document = createDocument();
      document.children = [createTextBlock('Hi {{ subscriber.first_name }}')];
      const template = await seedTemplate(target, { document });
      const [subscriberId] = await seedSubscribers(target, [
         { email: 'ada@example.com', first_name: 'Ada', status: 'subscribed' },
      ]);
      const campaignId = await seedCampaign(target, {
         templateId: template.id,
         status: 'sent',
      });
      await seedRecipient(target, { campaignId, subscriberId: subscriberId! });

      const token = await signTokenForTest(target.TOKEN_SECRET, 'web', {
         m: 'msg_test',
         s: subscriberId,
         c: campaignId,
      });

      const personalised = await app.request(`/p/${campaignId}?t=${token}`);
      expect(personalised.status).toBe(200);
      expect(await personalised.text()).toContain('Hi Ada');
      expect(personalised.headers.get('cache-control')).toContain('no-store');

      const anonymous = await app.request(`/p/${campaignId}`);
      const anonymousHtml = await anonymous.text();
      expect(anonymousHtml).toContain('Hi ');
      expect(anonymousHtml).not.toContain('Hi Ada');
   });

   it('falls back to the anonymous version for a token from another campaign', async () => {
      const app = createAppForTest();
      const target = baseEnv();
      const document = createDocument();
      document.children = [createTextBlock('Hi {{ subscriber.first_name }}')];
      const template = await seedTemplate(target, { document });
      const [subscriberId] = await seedSubscribers(target, [
         { email: 'ada@example.com', first_name: 'Ada', status: 'subscribed' },
      ]);
      const campaignId = await seedCampaign(target, {
         templateId: template.id,
         status: 'sent',
      });

      const token = await signTokenForTest(target.TOKEN_SECRET, 'web', {
         m: 'msg_test',
         s: subscriberId,
         c: 'cmp_somewhere_else',
      });

      const response = await app.request(`/p/${campaignId}?t=${token}`);
      expect(await response.text()).not.toContain('Hi Ada');
      expect(response.headers.get('cache-control')).toContain('no-store');
   });

   it('does not expose a draft', async () => {
      const app = createAppForTest();
      const target = baseEnv();
      const template = await seedTemplate(target);
      const campaignId = await seedCampaign(target, {
         templateId: template.id,
         status: 'draft',
      });

      const response = await app.request(`/p/${campaignId}`);
      expect(response.status).toBe(404);
   });
});
