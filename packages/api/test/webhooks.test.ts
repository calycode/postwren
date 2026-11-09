import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { webhookSignature } from '@postwren/shared/webhooks';
import { runWebhookSweep } from '../src/lib/webhooks';
import { authHeaders, baseEnv, createAppForTest, json, now, resetDb, seedOwner } from './helpers';
import type { Auth } from './helpers';

const app = createAppForTest();

beforeEach(async () => {
   await resetDb();
});

afterEach(() => {
   vi.unstubAllGlobals();
});

async function createEndpoint(
   owner: Auth,
   overrides: Record<string, unknown> = {},
): Promise<{ id: string; secret: string; url: string }> {
   const response = await app.request('/api/v1/webhooks', {
      method: 'POST',
      headers: authHeaders(owner),
      body: JSON.stringify({
         url: 'https://hooks.example.com/postwren',
         description: 'Test receiver',
         events: ['subscriber.created', 'subscriber.confirmed', 'campaign.sent'],
         ...overrides,
      }),
   });

   expect(response.status).toBe(201);
   return (await json(response)).data;
}

async function createSubscriber(owner: Auth, email = 'ada@example.com'): Promise<void> {
   const response = await app.request('/api/v1/subscribers', {
      method: 'POST',
      headers: authHeaders(owner),
      body: JSON.stringify({ email }),
   });
   expect(response.status).toBe(201);
}

function deliveryCount(): Promise<number> {
   return baseEnv()
      .DB.prepare('SELECT COUNT(*) AS count FROM webhook_deliveries')
      .first<{ count: number }>()
      .then((row) => row?.count ?? 0);
}

describe('webhook endpoints', () => {
   it('returns the signing secret once and hides it from the list', async () => {
      const owner = await seedOwner(baseEnv());
      const created = await createEndpoint(owner);

      expect(created.secret.startsWith('whsec_')).toBe(true);

      const list = await app.request('/api/v1/webhooks', { headers: { cookie: owner.cookie } });
      const body = await json(list);
      expect(body.data).toHaveLength(1);
      expect(body.data[0]).toMatchObject({
         url: 'https://hooks.example.com/postwren',
         enabled: true,
      });
      expect(body.data[0].secret).toBeUndefined();
   });

   it('writes a delivery for each subscribed endpoint', async () => {
      const owner = await seedOwner(baseEnv());
      await createEndpoint(owner);
      await createEndpoint(owner, {
         url: 'https://other.example.com/postwren',
         events: ['campaign.sent'],
      });

      await createSubscriber(owner);

      expect(await deliveryCount()).toBe(1);
   });

   it('stops writing deliveries when an endpoint is disabled', async () => {
      const owner = await seedOwner(baseEnv());
      const endpoint = await createEndpoint(owner);

      const patched = await app.request(`/api/v1/webhooks/${endpoint.id}`, {
         method: 'PATCH',
         headers: authHeaders(owner),
         body: JSON.stringify({ enabled: false }),
      });
      expect(patched.status).toBe(200);

      await createSubscriber(owner);
      expect(await deliveryCount()).toBe(0);
   });
});

describe('webhook delivery', () => {
   it('signs the request and records a successful delivery', async () => {
      const owner = await seedOwner(baseEnv());
      const endpoint = await createEndpoint(owner);
      await createSubscriber(owner);

      const fetcher = vi.fn(async () => new Response('ok', { status: 200 }));
      await runWebhookSweep(baseEnv(), now(), fetcher as unknown as typeof fetch);

      expect(fetcher).toHaveBeenCalledTimes(1);
      const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
      const headers = new Headers(init.headers);

      expect(url).toBe(endpoint.url);
      expect(headers.get('x-postwren-event')).toBe('subscriber.created');
      expect(headers.get('x-postwren-delivery')).toEqual(expect.stringMatching(/^whd/));

      const signature = headers.get('x-postwren-signature') ?? '';
      const timestamp = Number(/^t=(\d+),v1=/.exec(signature)?.[1]);
      expect(signature).toBe(await webhookSignature(endpoint.secret, timestamp, String(init.body)));

      const row = await baseEnv()
         .DB.prepare('SELECT status, attempts, delivered_at FROM webhook_deliveries LIMIT 1')
         .first<{ status: string; attempts: number; delivered_at: number | null }>();
      expect(row).toMatchObject({ status: 'succeeded', attempts: 1 });
      expect(row?.delivered_at).toEqual(expect.any(Number));
   });

   it('retries a 5xx and succeeds on the next sweep', async () => {
      const owner = await seedOwner(baseEnv());
      await createEndpoint(owner);
      await createSubscriber(owner);

      await runWebhookSweep(
         baseEnv(),
         now(),
         vi.fn(async () => new Response('down', { status: 503 })) as unknown as typeof fetch,
      );

      const first = await baseEnv()
         .DB.prepare('SELECT id, status, attempts, next_attempt_at FROM webhook_deliveries LIMIT 1')
         .first<{ id: string; status: string; attempts: number; next_attempt_at: number }>();
      expect(first).toMatchObject({ status: 'pending', attempts: 1 });
      expect(first?.next_attempt_at).toBeGreaterThan(now() - 5);

      await baseEnv()
         .DB.prepare('UPDATE webhook_deliveries SET next_attempt_at = ? WHERE id = ?')
         .bind(now(), first?.id)
         .run();

      const completed = vi.fn(async () => new Response('ok', { status: 200 }));
      await runWebhookSweep(baseEnv(), now() + 120, completed as unknown as typeof fetch);

      const second = await baseEnv()
         .DB.prepare('SELECT status, attempts FROM webhook_deliveries LIMIT 1')
         .first<{ status: string; attempts: number }>();
      expect(second).toMatchObject({ status: 'succeeded', attempts: 2 });
   });

   it('exposes the delivery log and retries a terminal failure', async () => {
      const owner = await seedOwner(baseEnv());
      const endpoint = await createEndpoint(owner);
      await createSubscriber(owner);

      await runWebhookSweep(
         baseEnv(),
         now(),
         vi.fn(async () => new Response('nope', { status: 400 })) as unknown as typeof fetch,
      );

      const log = await app.request(`/api/v1/webhooks/${endpoint.id}/deliveries`, {
         headers: { cookie: owner.cookie },
      });
      const body = await json(log);
      expect(body.data).toHaveLength(1);
      expect(body.data[0]).toMatchObject({ status: 'failed', response_status: 400 });

      vi.stubGlobal(
         'fetch',
         vi.fn(async () => new Response('ok', { status: 200 })),
      );
      const retried = await app.request(`/api/v1/webhooks/deliveries/${body.data[0].id}/retry`, {
         method: 'POST',
         headers: authHeaders(owner),
      });
      expect((await json(retried)).data).toMatchObject({
         status: 'succeeded',
         attempts: 1,
      });
   });

   it('sends a test event from the endpoint card', async () => {
      const owner = await seedOwner(baseEnv());
      const endpoint = await createEndpoint(owner);

      vi.stubGlobal(
         'fetch',
         vi.fn(async () => new Response('ok', { status: 200 })),
      );

      const response = await app.request(`/api/v1/webhooks/${endpoint.id}/test`, {
         method: 'POST',
         headers: authHeaders(owner),
      });

      expect(response.status).toBe(200);
      const body = await json(response);
      expect(body.data.queued).toBe(true);
      expect(body.data.delivery).toMatchObject({ event: 'webhook.test', status: 'succeeded' });
   });
});
