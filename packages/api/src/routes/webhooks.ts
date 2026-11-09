import { Hono } from 'hono';
import { createId, randomToken } from '@postwren/worker-kit/ids';
import { ok } from '@postwren/worker-kit/envelope';
import { NotFoundError } from '@postwren/worker-kit/errors';
import { webhookEndpointInput, webhookEndpointPatch } from '@postwren/shared/contracts';
import type { AppEnv } from '../env';
import type { WebhookDeliveryRow, WebhookEndpointRow } from '../lib/webhooks';
import {
   queueWebhookDelivery,
   runWebhookSweep,
   webhookEndpointResource,
   webhookEventsOf,
} from '../lib/webhooks';
import { readJson } from '../lib/validation';
import { nowSeconds } from '../lib/time';

function deliveryResource(row: WebhookDeliveryRow): Record<string, unknown> {
   return {
      id: row.id,
      endpoint_id: row.endpoint_id,
      event: row.event,
      status: row.status,
      attempts: row.attempts,
      response_status: row.response_status,
      error: row.error,
      next_attempt_at: row.next_attempt_at,
      created_at: row.created_at,
      delivered_at: row.delivered_at,
   };
}

function normaliseEvents(events: string[]): string[] {
   return [...new Set(events)];
}

async function findEndpoint(db: D1Database, id: string): Promise<WebhookEndpointRow> {
   const row = await db
      .prepare('SELECT * FROM webhook_endpoints WHERE id = ?')
      .bind(id)
      .first<WebhookEndpointRow>();
   if (row === null) throw new NotFoundError('Webhook endpoint not found');
   return row;
}

export const webhookRoutes = new Hono<AppEnv>();

webhookRoutes.use('*', async (c, next) => {
   c.header('cache-control', 'no-store');
   await next();
});

webhookRoutes.get('/', async (c) => {
   const rows = await c.env.DB.prepare(
      'SELECT * FROM webhook_endpoints ORDER BY created_at DESC, id DESC',
   ).all<WebhookEndpointRow>();

   return ok(rows.results.map(webhookEndpointResource), { requestId: c.get('requestId') });
});

webhookRoutes.post('/', async (c) => {
   const body = webhookEndpointInput.parse(await readJson(c));
   const now = nowSeconds();
   const id = createId('whk');
   const secret = `whsec_${randomToken(24)}`;

   await c.env.DB.prepare(
      `INSERT INTO webhook_endpoints
       (id, url, secret, events_json, description, enabled, created_at, updated_at,
        last_success_at, last_failure_at, failure_count)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?, NULL, NULL, 0)`,
   )
      .bind(
         id,
         body.url,
         secret,
         JSON.stringify(normaliseEvents(body.events)),
         body.description ?? null,
         now,
         now,
      )
      .run();

   const endpoint = await findEndpoint(c.env.DB, id);
   return ok(
      { ...webhookEndpointResource(endpoint), secret },
      { status: 201, requestId: c.get('requestId') },
   );
});

webhookRoutes.patch('/:id', async (c) => {
   const id = c.req.param('id');
   await findEndpoint(c.env.DB, id);
   const body = webhookEndpointPatch.parse(await readJson(c));

   const sets: string[] = [];
   const params: (string | number | null)[] = [];

   if (body.url !== undefined) {
      sets.push('url = ?');
      params.push(body.url);
   }
   if (body.description !== undefined) {
      sets.push('description = ?');
      params.push(body.description.length === 0 ? null : body.description);
   }
   if (body.events !== undefined) {
      sets.push('events_json = ?');
      params.push(JSON.stringify(normaliseEvents(body.events)));
   }
   if (body.enabled !== undefined) {
      sets.push('enabled = ?');
      params.push(body.enabled ? 1 : 0);
   }

   if (sets.length > 0) {
      sets.push('updated_at = ?');
      params.push(nowSeconds());
      await c.env.DB.prepare(`UPDATE webhook_endpoints SET ${sets.join(', ')} WHERE id = ?`)
         .bind(...params, id)
         .run();
   }

   return ok(webhookEndpointResource(await findEndpoint(c.env.DB, id)));
});

webhookRoutes.delete('/:id', async (c) => {
   const id = c.req.param('id');
   const result = await c.env.DB.prepare('DELETE FROM webhook_endpoints WHERE id = ?')
      .bind(id)
      .run();

   if ((result.meta.changes ?? 0) === 0) throw new NotFoundError('Webhook endpoint not found');
   return ok({ id, deleted: true });
});

webhookRoutes.get('/:id/deliveries', async (c) => {
   const id = c.req.param('id');
   await findEndpoint(c.env.DB, id);

   const rows = await c.env.DB.prepare(
      `SELECT * FROM webhook_deliveries
       WHERE endpoint_id = ?
       ORDER BY created_at DESC, id DESC
       LIMIT 50`,
   )
      .bind(id)
      .all<WebhookDeliveryRow>();

   return ok(rows.results.map(deliveryResource), { requestId: c.get('requestId') });
});

webhookRoutes.post('/:id/test', async (c) => {
   const endpoint = await findEndpoint(c.env.DB, c.req.param('id'));
   if (webhookEventsOf(endpoint).length === 0) {
      return ok({ queued: false, reason: 'no_events' });
   }

   const now = nowSeconds();
   const deliveryId = await queueWebhookDelivery(
      c.env,
      endpoint,
      'webhook.test',
      { message: 'This is a test delivery from Postwren.' },
      now,
   );

   await runWebhookSweep(c.env, now);
   const delivery = await c.env.DB.prepare('SELECT * FROM webhook_deliveries WHERE id = ?')
      .bind(deliveryId)
      .first<WebhookDeliveryRow>();

   return ok({ queued: true, delivery: delivery === null ? null : deliveryResource(delivery) });
});

webhookRoutes.post('/deliveries/:id/retry', async (c) => {
   const id = c.req.param('id');
   const now = nowSeconds();
   const result = await c.env.DB.prepare(
      `UPDATE webhook_deliveries
       SET status = 'pending', attempts = 0, next_attempt_at = ?, error = NULL,
           response_status = NULL, delivered_at = NULL
       WHERE id = ?`,
   )
      .bind(now, id)
      .run();

   if ((result.meta.changes ?? 0) === 0) throw new NotFoundError('Delivery not found');

   await runWebhookSweep(c.env, now);
   const delivery = await c.env.DB.prepare('SELECT * FROM webhook_deliveries WHERE id = ?')
      .bind(id)
      .first<WebhookDeliveryRow>();

   return ok(delivery === null ? null : deliveryResource(delivery));
});
