import type { EmailSendingEvent, Env } from '../env';
import { normalizeCloudflareEvent } from '../lib/email-events';
import type { NormalizedEmailEvent } from '../lib/email-events';
import { emitWebhookEventSafe } from '../lib/webhooks';
import { nowSeconds } from '../lib/time';

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
 * Applies one normalised delivery event. A complaint and a hard bounce are
 * terminal; a soft bounce is only recorded because the provider already retries
 * it. The event is logged first, and the unique event id makes a redelivery a
 * no-op for every side effect, whichever provider sent it.
 */
export async function processEmailEvent(env: Env, event: NormalizedEmailEvent): Promise<void> {
   const email = event.recipient.trim().toLowerCase();
   const now = nowSeconds();

   const inserted = await env.DB.prepare(
      `INSERT OR IGNORE INTO email_events
       (event_id, provider, type, kind, message_id, email, payload, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
   )
      .bind(
         event.eventId,
         event.provider,
         event.rawType,
         event.kind,
         event.messageId,
         email,
         JSON.stringify(event.payload),
         now,
      )
      .run();

   if ((inserted.meta.changes ?? 0) === 0) return;

   const subscriber = await findSubscriber(env, email);

   if (event.kind === 'complained') {
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
         ).bind(event.messageId),
         env.DB.prepare(
            `UPDATE automation_deliveries SET status = 'complained'
             WHERE provider_message_id = ?`,
         ).bind(event.messageId),
      ]);

      if (subscriber !== null) {
         await emitWebhookEventSafe(env, 'subscriber.complained', {
            id: subscriber.id,
            email: subscriber.email,
            message_id: event.messageId,
            reason: event.reason,
         });
      }
      return;
   }

   if (event.kind === 'bounced') {
      if (event.bounceType !== 'hard') return;

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
         ).bind(event.messageId),
         env.DB.prepare(
            `UPDATE automation_deliveries SET status = 'bounced'
             WHERE provider_message_id = ?`,
         ).bind(event.messageId),
      ]);

      if (subscriber !== null) {
         await emitWebhookEventSafe(env, 'subscriber.bounced', {
            id: subscriber.id,
            email: subscriber.email,
            message_id: event.messageId,
            bounce_type: event.bounceType,
            reason: event.reason,
         });
      }
      return;
   }

   if (event.kind === 'delivered') {
      await env.DB.batch([
         env.DB.prepare(
            `UPDATE campaign_recipients SET status = 'delivered'
             WHERE provider_message_id = ? AND status = 'sent'`,
         ).bind(event.messageId),
         env.DB.prepare(
            `UPDATE automation_deliveries SET status = 'delivered'
             WHERE provider_message_id = ? AND status = 'sent'`,
         ).bind(event.messageId),
      ]);
   }
}

export async function handleEmailEventQueue(
   batch: MessageBatch<EmailSendingEvent>,
   env: Env,
): Promise<void> {
   for (const message of batch.messages) {
      try {
         const event = normalizeCloudflareEvent(message.body);
         if (event !== null) await processEmailEvent(env, event);
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
