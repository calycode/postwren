import type { EmailSendingEvent, Env } from '../env';
import { emitWebhookEventSafe } from '../lib/webhooks';
import { nowSeconds } from '../lib/time';

const COMPLAINED = 'cf.email.sending.message.complained';
const BOUNCED = 'cf.email.sending.message.bounced';
const DELIVERED = 'cf.email.sending.message.delivered';

type Subscriber = { id: string; email: string };

async function findSubscriber(env: Env, email: string): Promise<Subscriber | null> {
   return env.DB.prepare('SELECT id, email FROM subscribers WHERE email = ? AND deleted_at IS NULL')
      .bind(email)
      .first<Subscriber>();
}

async function stopRuns(env: Env, subscriberId: string, now: number): Promise<void> {
   await env.DB.prepare(
      `UPDATE automation_runs
       SET status = 'exited', exit_reason = 'suppressed', completed_at = ?
       WHERE subscriber_id = ? AND status IN ('waiting', 'running')`,
   )
      .bind(now, subscriberId)
      .run();
}

/**
 * Consumes Cloudflare Email Sending events. A complaint and a hard bounce are
 * terminal; a soft bounce is only recorded because Cloudflare already retries
 * it. Every event is logged first, and the unique event id makes a redelivery a
 * no-op for the subscriber and webhook side effects.
 */
export async function processEmailEvent(env: Env, event: EmailSendingEvent): Promise<void> {
   const payload = event.payload;
   if (typeof payload.recipient !== 'string' || typeof payload.messageId !== 'string') return;

   const email = payload.recipient.trim().toLowerCase();
   const now = nowSeconds();

   const inserted = await env.DB.prepare(
      `INSERT OR IGNORE INTO email_events
       (event_id, type, message_id, email, payload, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
   )
      .bind(
         payload.eventId ?? null,
         event.type,
         payload.messageId,
         email,
         JSON.stringify(event),
         now,
      )
      .run();

   if ((inserted.meta.changes ?? 0) === 0) return;

   const subscriber = await findSubscriber(env, email);

   if (event.type === COMPLAINED) {
      if (subscriber !== null) {
         await env.DB.prepare(
            `UPDATE subscribers
             SET status = 'complained', unsubscribed_at = COALESCE(unsubscribed_at, ?)
             WHERE id = ? AND deleted_at IS NULL`,
         )
            .bind(now, subscriber.id)
            .run();
         await stopRuns(env, subscriber.id, now);
      }

      await env.DB.batch([
         env.DB.prepare(
            `UPDATE campaign_recipients SET status = 'complained'
             WHERE provider_message_id = ?`,
         ).bind(payload.messageId),
         env.DB.prepare(
            `UPDATE automation_deliveries SET status = 'complained'
             WHERE provider_message_id = ?`,
         ).bind(payload.messageId),
      ]);

      if (subscriber !== null) {
         await emitWebhookEventSafe(env, 'subscriber.complained', {
            id: subscriber.id,
            email: subscriber.email,
            message_id: payload.messageId,
            reason: payload.complaint?.type ?? null,
         });
      }
      return;
   }

   if (event.type === BOUNCED) {
      if (payload.bounce?.type !== 'hard') return;

      if (subscriber !== null) {
         await env.DB.prepare(
            `UPDATE subscribers SET status = 'bounced'
             WHERE id = ? AND deleted_at IS NULL`,
         )
            .bind(subscriber.id)
            .run();
         await stopRuns(env, subscriber.id, now);
      }

      await env.DB.batch([
         env.DB.prepare(
            `UPDATE campaign_recipients SET status = 'bounced'
             WHERE provider_message_id = ?`,
         ).bind(payload.messageId),
         env.DB.prepare(
            `UPDATE automation_deliveries SET status = 'bounced'
             WHERE provider_message_id = ?`,
         ).bind(payload.messageId),
      ]);

      if (subscriber !== null) {
         await emitWebhookEventSafe(env, 'subscriber.bounced', {
            id: subscriber.id,
            email: subscriber.email,
            message_id: payload.messageId,
            bounce_type: payload.bounce.type,
            reason: payload.bounce.reason ?? null,
         });
      }
      return;
   }

   if (event.type === DELIVERED) {
      await env.DB.batch([
         env.DB.prepare(
            `UPDATE campaign_recipients SET status = 'delivered'
             WHERE provider_message_id = ? AND status = 'sent'`,
         ).bind(payload.messageId),
         env.DB.prepare(
            `UPDATE automation_deliveries SET status = 'delivered'
             WHERE provider_message_id = ? AND status = 'sent'`,
         ).bind(payload.messageId),
      ]);
   }
}

export async function handleEmailEventQueue(
   batch: MessageBatch<EmailSendingEvent>,
   env: Env,
): Promise<void> {
   for (const message of batch.messages) {
      try {
         await processEmailEvent(env, message.body);
         message.ack();
      } catch (error) {
         console.error('email_event_failed', {
            type: message.body?.type,
            eventId: message.body?.payload?.eventId,
            reason: error instanceof Error ? error.message : String(error),
         });
         message.retry();
      }
   }
}
