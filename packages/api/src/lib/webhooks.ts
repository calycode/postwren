import { createId } from '@postwren/worker-kit/ids';
import { webhookSignature } from '@postwren/shared/webhooks';
import type { WebhookEvent } from '@postwren/shared/webhooks';
import type { Env } from '../env';
import { nowSeconds } from './time';

export type WebhookEndpointRow = {
   id: string;
   url: string;
   secret: string;
   events_json: string;
   description: string | null;
   enabled: number;
   created_at: number;
   updated_at: number;
   last_success_at: number | null;
   last_failure_at: number | null;
   failure_count: number;
};

export type WebhookDeliveryRow = {
   id: string;
   endpoint_id: string;
   event: string;
   payload_json: string;
   status: string;
   attempts: number;
   response_status: number | null;
   error: string | null;
   next_attempt_at: number | null;
   created_at: number;
   delivered_at: number | null;
};

const MAX_ATTEMPTS = 6;
const SWEEP_LIMIT = 20;
const REQUEST_TIMEOUT_MS = 10_000;
// 1m, 5m, 30m, 2h, 6h. The sixth failure is terminal.
const RETRY_DELAYS_SECONDS = [60, 300, 1800, 7200, 21600];

export function webhookEventsOf(endpoint: WebhookEndpointRow): string[] {
   try {
      const parsed: unknown = JSON.parse(endpoint.events_json);
      return Array.isArray(parsed)
         ? parsed.filter((value): value is string => typeof value === 'string')
         : [];
   } catch {
      return [];
   }
}

export function webhookEndpointResource(endpoint: WebhookEndpointRow): Record<string, unknown> {
   return {
      id: endpoint.id,
      url: endpoint.url,
      description: endpoint.description,
      events: webhookEventsOf(endpoint),
      enabled: endpoint.enabled === 1,
      created_at: endpoint.created_at,
      updated_at: endpoint.updated_at,
      last_success_at: endpoint.last_success_at,
      last_failure_at: endpoint.last_failure_at,
      failure_count: endpoint.failure_count,
   };
}

function payloadFor(id: string, event: WebhookEvent, data: unknown, now: number): string {
   return JSON.stringify({ id, event, created_at: now, data });
}

export async function queueWebhookDelivery(
   env: Env,
   endpoint: WebhookEndpointRow,
   event: WebhookEvent,
   data: unknown,
   now = nowSeconds(),
): Promise<string> {
   const id = createId('whd');
   await env.DB.prepare(
      `INSERT INTO webhook_deliveries
       (id, endpoint_id, event, payload_json, status, attempts, response_status, error,
        next_attempt_at, created_at, delivered_at)
       VALUES (?, ?, ?, ?, 'pending', 0, NULL, NULL, ?, ?, NULL)`,
   )
      .bind(id, endpoint.id, event, payloadFor(id, event, data, now), now, now)
      .run();
   return id;
}

/**
 * Writes one delivery per enabled endpoint that subscribes to the event. The
 * HTTP call happens later in the cron sweep, so a slow receiver never delays a
 * signup or a send.
 */
export async function emitWebhookEvent(
   env: Env,
   event: WebhookEvent,
   data: unknown,
   now = nowSeconds(),
): Promise<number> {
   const rows = await env.DB.prepare(
      `SELECT * FROM webhook_endpoints WHERE enabled = 1 ORDER BY created_at ASC`,
   ).all<WebhookEndpointRow>();

   const subscribed = rows.results.filter((endpoint) => webhookEventsOf(endpoint).includes(event));
   for (const endpoint of subscribed) {
      await queueWebhookDelivery(env, endpoint, event, data, now);
   }
   return subscribed.length;
}

/** An event write must never fail the action that produced it. */
export async function emitWebhookEventSafe(
   env: Env,
   event: WebhookEvent,
   data: unknown,
   now = nowSeconds(),
): Promise<number> {
   try {
      return await emitWebhookEvent(env, event, data, now);
   } catch {
      return 0;
   }
}

function isRetryable(status: number): boolean {
   return status === 0 || status === 429 || status >= 500;
}

async function attemptDelivery(
   env: Env,
   delivery: WebhookDeliveryRow & { url: string; secret: string },
   now: number,
   request: typeof fetch,
): Promise<void> {
   const attempt = delivery.attempts + 1;
   let status = 0;
   let error: string | null = null;

   try {
      const response = await request(delivery.url, {
         method: 'POST',
         headers: {
            'content-type': 'application/json',
            'user-agent': 'Postwren-Webhooks/1',
            'x-postwren-event': delivery.event,
            'x-postwren-delivery': delivery.id,
            'x-postwren-signature': await webhookSignature(
               delivery.secret,
               now,
               delivery.payload_json,
            ),
         },
         body: delivery.payload_json,
         signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      status = response.status;
      if (!response.ok) error = `HTTP ${response.status}`;
   } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Request failed';
   }

   const succeeded = status >= 200 && status < 300;

   if (succeeded) {
      await env.DB.batch([
         env.DB.prepare(
            `UPDATE webhook_deliveries
             SET status = 'succeeded', attempts = ?, response_status = ?, error = NULL,
                 next_attempt_at = NULL, delivered_at = ?
             WHERE id = ?`,
         ).bind(attempt, status, now, delivery.id),
         env.DB.prepare(
            `UPDATE webhook_endpoints
             SET last_success_at = ?, failure_count = 0
             WHERE id = ?`,
         ).bind(now, delivery.endpoint_id),
      ]);
      return;
   }

   const retryDelay = RETRY_DELAYS_SECONDS[attempt - 1];
   const willRetry = isRetryable(status) && attempt < MAX_ATTEMPTS && retryDelay !== undefined;

   await env.DB.batch([
      env.DB.prepare(
         `UPDATE webhook_deliveries
          SET status = ?, attempts = ?, response_status = ?, error = ?, next_attempt_at = ?
          WHERE id = ?`,
      ).bind(
         willRetry ? 'pending' : 'failed',
         attempt,
         status === 0 ? null : status,
         error,
         willRetry ? now + retryDelay : null,
         delivery.id,
      ),
      env.DB.prepare(
         `UPDATE webhook_endpoints
          SET last_failure_at = ?, failure_count = failure_count + 1
          WHERE id = ?`,
      ).bind(now, delivery.endpoint_id),
   ]);
}

export async function runWebhookSweep(
   env: Env,
   now = nowSeconds(),
   request: typeof fetch = fetch,
): Promise<number> {
   const due = await env.DB.prepare(
      `SELECT d.*, e.url AS url, e.secret AS secret
       FROM webhook_deliveries d
       JOIN webhook_endpoints e ON e.id = d.endpoint_id
       WHERE d.status = 'pending' AND d.next_attempt_at IS NOT NULL
         AND d.next_attempt_at <= ? AND e.enabled = 1
       ORDER BY d.next_attempt_at ASC
       LIMIT ?`,
   )
      .bind(now, SWEEP_LIMIT)
      .all<WebhookDeliveryRow & { url: string; secret: string }>();

   for (const delivery of due.results) {
      await attemptDelivery(env, delivery, now, request);
   }

   return due.results.length;
}

export function pruneWebhookDeliveries(env: Env, now = nowSeconds()): D1PreparedStatement {
   return env.DB.prepare(
      `DELETE FROM webhook_deliveries WHERE status != 'pending' AND created_at < ?`,
   ).bind(now - 60 * 60 * 24 * 30);
}
