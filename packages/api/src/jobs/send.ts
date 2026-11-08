import type { Env, CampaignJob } from '../env';
import { parseDocument } from '@postwren/email/ir';
import { parseMetadataJson } from '@postwren/shared/metadata';
import type { CampaignRow, MailSubscriberRow } from '../lib/rows';
import { createCloudflareAdapter } from '../adapters/email';
import { configuredAppOrigin } from '../lib/app-url';
import { nowSeconds } from '../lib/time';
import { loadSubscriberMetadata, loadSubscriberTags } from '../lib/subscribers';
import { deliverEmail } from '../lib/delivery';

const MAX_ATTEMPTS = 3;

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

   const groups = new Map<string, { ids: string[]; messages: Message<CampaignJob>[] }>();

   for (const message of batch.messages) {
      const job = message.body;
      const group = groups.get(job.campaignId) ?? { ids: [], messages: [] };
      for (const id of job.recipientIds) {
         if (!group.ids.includes(id)) group.ids.push(id);
      }
      group.messages.push(message);
      groups.set(job.campaignId, group);
   }

   const adapter = createCloudflareAdapter(env);

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
      const retryIds: string[] = [];

      for (const subscriberId of group.ids) {
         const claim = await env.DB.prepare(
            `UPDATE campaign_recipients
             SET status = 'sending', attempts = attempts + 1
             WHERE campaign_id = ? AND subscriber_id = ? AND status = 'queued'`,
         )
            .bind(campaignId, subscriberId)
            .run();

         if ((claim.meta.changes ?? 0) !== 1) continue;

         const recipient = await env.DB.prepare(
            'SELECT message_id, attempts FROM campaign_recipients WHERE campaign_id = ? AND subscriber_id = ?',
         )
            .bind(campaignId, subscriberId)
            .first<{ message_id: string; attempts: number }>();

         if (recipient === null) continue;

         const subscriber = await env.DB.prepare(
            `SELECT id, email, first_name, last_name, status, deleted_at
             FROM subscribers WHERE id = ?`,
         )
            .bind(subscriberId)
            .first<MailSubscriberRow>();

         if (
            subscriber === null ||
            subscriber.status !== 'subscribed' ||
            subscriber.deleted_at !== null
         ) {
            await env.DB.prepare(
               `UPDATE campaign_recipients SET status = 'suppressed', error_code = ?
                WHERE campaign_id = ? AND subscriber_id = ?`,
            )
               .bind(
                  subscriber === null ? 'missing_subscriber' : 'suppressed',
                  campaignId,
                  subscriberId,
               )
               .run();
            continue;
         }

         const tags = await loadSubscriberTags(env.DB, subscriberId);
         const metadata = await loadSubscriberMetadata(env.DB, subscriberId);

         const outcome = await deliverEmail({
            env,
            adapter,
            origin,
            messageId: recipient.message_id,
            document,
            subscriber,
            tags,
            metadata,
            from: { name: campaign.from_name, email: campaign.from_email },
            replyTo: campaign.reply_to,
            subject: campaign.subject,
            campaign: {
               id: campaign.id,
               utmCampaign: campaign.utm_campaign,
               metadata: parseMetadataJson(campaign.metadata_snapshot ?? campaign.metadata_json),
            },
         });

         if (outcome.ok) {
            await env.DB.prepare(
               `UPDATE campaign_recipients
                SET status = 'sent', sent_at = ?, provider_message_id = ?, error_code = NULL
                WHERE campaign_id = ? AND subscriber_id = ?`,
            )
               .bind(nowSeconds(), outcome.providerMessageId, campaignId, subscriberId)
               .run();
            continue;
         }

         if (outcome.stage === 'render') {
            await env.DB.prepare(
               `UPDATE campaign_recipients SET status = 'failed', error_code = ?
                WHERE campaign_id = ? AND subscriber_id = ?`,
            )
               .bind(outcome.code ?? 'render_error', campaignId, subscriberId)
               .run();
            continue;
         }

         const failure = outcome.failure;
         const code = outcome.code ?? failure;

         if (failure === 'daily_quota' || failure === 'account') {
            await env.DB.prepare(
               `UPDATE campaigns SET status = 'paused', updated_at = ? WHERE id = ?`,
            )
               .bind(nowSeconds(), campaignId)
               .run();
            await env.DB.prepare(
               `UPDATE campaign_recipients SET status = 'queued', error_code = ?
                WHERE campaign_id = ? AND subscriber_id = ?`,
            )
               .bind(code, campaignId, subscriberId)
               .run();
            break;
         }

         if (failure === 'retry' || failure === 'rate') {
            if (recipient.attempts < MAX_ATTEMPTS) {
               await env.DB.prepare(
                  `UPDATE campaign_recipients SET status = 'queued', error_code = ?
                   WHERE campaign_id = ? AND subscriber_id = ?`,
               )
                  .bind(code, campaignId, subscriberId)
                  .run();
               retryIds.push(subscriberId);
            } else {
               await env.DB.prepare(
                  `UPDATE campaign_recipients SET status = 'failed', error_code = ?
                   WHERE campaign_id = ? AND subscriber_id = ?`,
               )
                  .bind(code, campaignId, subscriberId)
                  .run();
            }
            continue;
         }

         await env.DB.prepare(
            `UPDATE campaign_recipients SET status = 'failed', error_code = ?
             WHERE campaign_id = ? AND subscriber_id = ?`,
         )
            .bind(code, campaignId, subscriberId)
            .run();
      }

      if (retryIds.length > 0) {
         await env.CAMPAIGN_QUEUE.sendBatch(
            retryIds.map((id) => ({ body: { campaignId, recipientIds: [id] } })),
            { delaySeconds: 30 },
         );
      }

      const remaining = await env.DB.prepare(
         `SELECT COUNT(*) AS count FROM campaign_recipients
          WHERE campaign_id = ? AND status IN ('queued', 'sending')`,
      )
         .bind(campaignId)
         .first<{ count: number }>();

      if ((remaining?.count ?? 0) === 0) {
         const now = nowSeconds();
         await env.DB.prepare(
            `UPDATE campaigns SET status = 'sent', completed_at = ?, updated_at = ?
             WHERE id = ? AND status = 'sending'`,
         )
            .bind(now, now, campaignId)
            .run();
      }

      for (const message of group.messages) message.ack();
   }
}
