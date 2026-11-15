import type { Env, CampaignJob } from '../env';
import { parseDocument } from '@postwren/email/ir';
import { isProviderId } from '@postwren/shared/providers';
import { parseMetadataJson } from '@postwren/shared/metadata';
import { parsePayloadJson } from '@postwren/shared/payload';
import type { CampaignRow } from '../lib/rows';
import { createEmailSender, errorCodeOf } from '../adapters/email';
import type { BatchItemResult, EmailMessage, EmailSendAdapter } from '../adapters/email';
import { configuredAppOrigin } from '../lib/app-url';
import { nowSeconds } from '../lib/time';
import {
   loadSubscriberMetadataFor,
   loadSubscriberTagsFor,
   loadSubscribersFor,
} from '../lib/subscribers';
import { prepareEmail } from '../lib/delivery';
import { emitWebhookEventSafe } from '../lib/webhooks';

const MAX_ATTEMPTS = 3;
const MAX_BATCH = 100;
const SQL_CHUNK = 50;
const RETRY_DELAY_SECONDS = 30;
const MAX_RETRY_DELAY_SECONDS = 43_200;

type ClaimedRecipient = {
   subscriber_id: string;
   message_id: string;
   attempts: number;
};

function chunk<T>(items: T[], size: number): T[][] {
   const result: T[][] = [];
   for (let index = 0; index < items.length; index += size) {
      result.push(items.slice(index, index + size));
   }
   return result;
}

async function claimRecipients(
   db: D1Database,
   campaignId: string,
   recipientIds: string[],
): Promise<ClaimedRecipient[]> {
   const claimed: ClaimedRecipient[] = [];

   for (const batch of chunk(recipientIds, SQL_CHUNK)) {
      const placeholders = batch.map(() => '?').join(', ');
      const rows = await db
         .prepare(
            `UPDATE campaign_recipients
             SET status = 'sending', attempts = attempts + 1
             WHERE campaign_id = ? AND status = 'queued'
               AND subscriber_id IN (${placeholders})
             RETURNING subscriber_id, message_id, attempts`,
         )
         .bind(campaignId, ...batch)
         .all<ClaimedRecipient>();

      claimed.push(...rows.results);
   }

   return claimed;
}

function failureResult(adapter: EmailSendAdapter, error: unknown): BatchItemResult {
   return {
      ok: false,
      code: errorCodeOf(error),
      failure: adapter.classifyError(error),
      message: error instanceof Error ? error.message : 'Send failed',
      retryAfterSeconds: adapter.retryAfterSeconds(error),
   };
}

async function sendChunk(
   adapter: EmailSendAdapter,
   messages: EmailMessage[],
): Promise<BatchItemResult[]> {
   if (adapter.sendBatch !== undefined && messages.length > 1) {
      try {
         return await adapter.sendBatch(messages);
      } catch (error) {
         return messages.map(() => failureResult(adapter, error));
      }
   }

   const results: BatchItemResult[] = [];
   for (const message of messages) {
      try {
         const result = await adapter.send(message);
         results.push({ ok: true, providerMessageId: result.providerMessageId });
      } catch (error) {
         results.push(failureResult(adapter, error));
      }
   }
   return results;
}

async function pace(adapter: EmailSendAdapter, hasMore: boolean): Promise<void> {
   if (!hasMore || adapter.ratePerSecond === null || adapter.batchSize <= 1) return;
   const delay = Math.ceil(1000 / adapter.ratePerSecond);
   await new Promise((resolve) => setTimeout(resolve, delay));
}

function retryDelay(seconds: number | null): number {
   const value = seconds ?? RETRY_DELAY_SECONDS;
   return Math.min(Math.max(value, 1), MAX_RETRY_DELAY_SECONDS);
}

export async function handleQueue(batch: MessageBatch<CampaignJob>, env: Env): Promise<void> {
   const origin = configuredAppOrigin(env);
   if (origin === null) {
      // Tracking, unsubscribe and media links need an absolute origin, and a
      // queue consumer has no request to derive one from. Pause instead of
      // sending mail with dead links; the campaign can resume once APP_URL is set.
      console.error('campaign_send_skipped', { reason: 'APP_URL is not configured' });
      const now = nowSeconds();
      for (const message of batch.messages) {
         message.ack();
         await env.DB.prepare(
            `UPDATE campaigns SET status = 'paused', updated_at = ?
             WHERE id = ? AND status = 'sending'`,
         )
            .bind(now, message.body.campaignId)
            .run();
      }
      return;
   }

   const groups = new Map<
      string,
      { ids: string[]; seen: Set<string>; messages: Message<CampaignJob>[] }
   >();

   for (const message of batch.messages) {
      const job = message.body;
      const group = groups.get(job.campaignId) ?? {
         ids: [],
         seen: new Set<string>(),
         messages: [],
      };
      for (const id of job.recipientIds) {
         if (group.seen.has(id)) continue;
         group.seen.add(id);
         group.ids.push(id);
      }
      group.messages.push(message);
      groups.set(job.campaignId, group);
   }

   for (const [campaignId, group] of groups) {
      const campaign = await env.DB.prepare('SELECT * FROM campaigns WHERE id = ?')
         .bind(campaignId)
         .first<CampaignRow>();

      if (campaign === null) {
         for (const message of group.messages) message.ack();
         continue;
      }

      if (campaign.status !== 'sending') {
         for (const message of group.messages) message.ack();
         continue;
      }

      const snapshot =
         campaign.ir_snapshot ??
         (
            await env.DB.prepare('SELECT ir_json FROM templates WHERE id = ?')
               .bind(campaign.template_id)
               .first<{ ir_json: string }>()
         )?.ir_json ??
         null;

      if (snapshot === null) {
         for (const message of group.messages) message.ack();
         continue;
      }

      const document = parseDocument(JSON.parse(snapshot));
      let adapter: EmailSendAdapter;

      try {
         adapter = await createEmailSender(
            env,
            isProviderId(campaign.provider) ? campaign.provider : 'cloudflare',
         );
      } catch (error) {
         console.error(
            JSON.stringify({
               event: 'campaign_send_skipped',
               reason: 'provider_unavailable',
               campaignId,
               detail: error instanceof Error ? error.message : String(error),
            }),
         );
         await env.DB.prepare(`UPDATE campaigns SET status = 'paused', updated_at = ? WHERE id = ?`)
            .bind(nowSeconds(), campaignId)
            .run();
         for (const message of group.messages) message.ack();
         continue;
      }

      const campaignContext = {
         id: campaign.id,
         utmCampaign: campaign.utm_campaign,
         metadata: parseMetadataJson(campaign.metadata_snapshot ?? campaign.metadata_json),
         data: parsePayloadJson(campaign.data_snapshot ?? campaign.data_json),
      };
      const batchSize = Math.max(1, Math.min(adapter.batchSize, MAX_BATCH));
      const slices = chunk(group.ids, batchSize);
      const retries = new Map<number, string[]>();
      let paused = false;
      let stopRate = false;
      let rateDelay = RETRY_DELAY_SECONDS;
      let stoppedAt = -1;

      for (const [sliceIndex, ids] of slices.entries()) {
         const claimed = await claimRecipients(env.DB, campaignId, ids);
         if (claimed.length === 0) continue;

         const subscriberIds = claimed.map((row) => row.subscriber_id);
         const [subscribers, tagsBySubscriber, metadataBySubscriber] = await Promise.all([
            loadSubscribersFor(env.DB, subscriberIds),
            loadSubscriberTagsFor(env.DB, subscriberIds),
            loadSubscriberMetadataFor(env.DB, subscriberIds),
         ]);

         const statements: D1PreparedStatement[] = [];
         const outbound: Array<{ recipient: ClaimedRecipient; message: EmailMessage }> = [];

         for (const recipient of claimed) {
            const subscriber = subscribers.get(recipient.subscriber_id);

            if (
               subscriber === undefined ||
               subscriber.status !== 'subscribed' ||
               subscriber.deleted_at !== null
            ) {
               statements.push(
                  env.DB.prepare(
                     `UPDATE campaign_recipients SET status = 'suppressed', error_code = ?
                      WHERE campaign_id = ? AND subscriber_id = ?`,
                  ).bind(
                     subscriber === undefined ? 'missing_subscriber' : 'suppressed',
                     campaignId,
                     recipient.subscriber_id,
                  ),
               );
               continue;
            }

            const prepared = await prepareEmail({
               env,
               origin,
               messageId: recipient.message_id,
               document,
               subscriber,
               tags: tagsBySubscriber.get(recipient.subscriber_id) ?? [],
               metadata: metadataBySubscriber.get(recipient.subscriber_id) ?? {},
               from: { name: campaign.from_name, email: campaign.from_email },
               replyTo: campaign.reply_to,
               subject: campaign.subject,
               campaign: campaignContext,
            });

            if (!prepared.ok) {
               statements.push(
                  env.DB.prepare(
                     `UPDATE campaign_recipients SET status = 'failed', error_code = ?
                      WHERE campaign_id = ? AND subscriber_id = ?`,
                  ).bind(prepared.code ?? 'render_error', campaignId, recipient.subscriber_id),
               );
               continue;
            }

            outbound.push({ recipient, message: prepared.prepared.message });
         }

         if (outbound.length > 0) {
            const results = await sendChunk(
               adapter,
               outbound.map((entry) => entry.message),
            );

            for (const [index, entry] of outbound.entries()) {
               const result = results[index];

               if (result === undefined) {
                  statements.push(
                     env.DB.prepare(
                        `UPDATE campaign_recipients SET status = 'queued', error_code = ?
                         WHERE campaign_id = ? AND subscriber_id = ?`,
                     ).bind('batch_missing', campaignId, entry.recipient.subscriber_id),
                  );
                  const delay = retryDelay(null);
                  retries.set(delay, [
                     ...(retries.get(delay) ?? []),
                     entry.recipient.subscriber_id,
                  ]);
                  continue;
               }

               if (result.ok) {
                  statements.push(
                     env.DB.prepare(
                        `UPDATE campaign_recipients
                         SET status = 'sent', sent_at = ?, provider_message_id = ?, error_code = NULL
                         WHERE campaign_id = ? AND subscriber_id = ?`,
                     ).bind(
                        nowSeconds(),
                        result.providerMessageId,
                        campaignId,
                        entry.recipient.subscriber_id,
                     ),
                  );
                  continue;
               }

               const code = result.code ?? result.failure;

               if (result.failure === 'daily_quota' || result.failure === 'account') {
                  statements.push(
                     env.DB.prepare(
                        `UPDATE campaign_recipients SET status = 'queued', error_code = ?
                         WHERE campaign_id = ? AND subscriber_id = ?`,
                     ).bind(code, campaignId, entry.recipient.subscriber_id),
                  );
                  paused = true;
                  continue;
               }

               if (
                  (result.failure === 'retry' || result.failure === 'rate') &&
                  entry.recipient.attempts < MAX_ATTEMPTS
               ) {
                  statements.push(
                     env.DB.prepare(
                        `UPDATE campaign_recipients SET status = 'queued', error_code = ?
                         WHERE campaign_id = ? AND subscriber_id = ?`,
                     ).bind(code, campaignId, entry.recipient.subscriber_id),
                  );
                  const delay = retryDelay(result.retryAfterSeconds);
                  retries.set(delay, [
                     ...(retries.get(delay) ?? []),
                     entry.recipient.subscriber_id,
                  ]);
                  if (result.failure === 'rate') {
                     stopRate = true;
                     rateDelay = delay;
                  }
                  continue;
               }

               statements.push(
                  env.DB.prepare(
                     `UPDATE campaign_recipients SET status = 'failed', error_code = ?
                      WHERE campaign_id = ? AND subscriber_id = ?`,
                  ).bind(code, campaignId, entry.recipient.subscriber_id),
               );
            }
         }

         if (paused) {
            statements.push(
               env.DB.prepare(
                  `UPDATE campaigns SET status = 'paused', updated_at = ?
                   WHERE id = ? AND status = 'sending'`,
               ).bind(nowSeconds(), campaignId),
            );
         }

         if (statements.length > 0) await env.DB.batch(statements);
         if (paused || stopRate) {
            stoppedAt = sliceIndex;
            break;
         }

         await pace(adapter, outbound.length > 0 && sliceIndex < slices.length - 1);
      }

      if (!paused && stoppedAt >= 0) {
         const pending = slices.slice(stoppedAt + 1).flat();
         if (pending.length > 0) {
            retries.set(rateDelay, [...(retries.get(rateDelay) ?? []), ...pending]);
         }
      }

      for (const [delay, ids] of retries) {
         await env.CAMPAIGN_QUEUE.sendBatch(
            ids.map((id) => ({ body: { campaignId, recipientIds: [id] } })),
            { delaySeconds: delay },
         );
      }

      const remaining = await env.DB.prepare(
         `SELECT COUNT(*) AS count FROM campaign_recipients
          WHERE campaign_id = ? AND status IN ('queued', 'sending')`,
      )
         .bind(campaignId)
         .first<{ count: number }>();

      if (!paused && (remaining?.count ?? 0) === 0) {
         const now = nowSeconds();
         const completed = await env.DB.prepare(
            `UPDATE campaigns SET status = 'sent', completed_at = ?, updated_at = ?
             WHERE id = ? AND status = 'sending'`,
         )
            .bind(now, now, campaignId)
            .run();

         if ((completed.meta.changes ?? 0) > 0) {
            await emitWebhookEventSafe(env, 'campaign.sent', {
               id: campaign.id,
               name: campaign.name,
               subject: campaign.subject,
               completed_at: now,
               audience_count: campaign.audience_count,
            });
         }
      }

      for (const message of group.messages) message.ack();
   }
}
