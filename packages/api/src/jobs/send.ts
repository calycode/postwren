import { signToken } from '@mailer/shared/tokens';
import type { Env, CampaignJob } from '../env';
import { parseDocument } from '@mailer/email/ir';
import type { Block, Document } from '@mailer/email/ir';
import { renderEmail } from '@mailer/email/render';
import { applyMergeTags } from '@mailer/email/template';
import type { MergeContext } from '@mailer/email/template';
import { parseMetadataJson } from '@mailer/shared/metadata';
import type { CampaignRow, MailSubscriberRow } from '../lib/rows';
import { createCloudflareAdapter, errorCodeOf } from '../adapters/email';
import { nowSeconds } from '../lib/time';
import { loadSubscriberMetadata } from '../lib/subscribers';

const CLICK_TTL_SECONDS = 60 * 60 * 24;
const OPEN_TTL_SECONDS = 60 * 60 * 24;
const UNSUBSCRIBE_TTL_SECONDS = 60 * 60 * 24 * 30;
const MAX_ATTEMPTS = 3;
const TRANSPARENT_PNG =
   'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const INLINE_LINK = /\[[^\]]+\]\((https:\/\/[^\s)]+)\)/g;

type LinkTarget = { href: string; linkId: string };

function collectLinks(document: Document): LinkTarget[] {
   const targets: LinkTarget[] = [];

   const visit = (block: Block): void => {
      switch (block.type) {
         case 'button':
            targets.push({ href: block.href, linkId: block.id });
            return;
         case 'image':
            if (block.href !== undefined) targets.push({ href: block.href, linkId: block.id });
            return;
         case 'social':
            for (const link of block.links) targets.push({ href: link.href, linkId: block.id });
            return;
         case 'heading':
         case 'text':
            for (const match of block.text.matchAll(INLINE_LINK)) {
               const href = match[1];
               if (href !== undefined) targets.push({ href, linkId: block.id });
            }
            return;
         case 'list':
            for (const item of block.items.split('\n')) {
               for (const match of item.matchAll(INLINE_LINK)) {
                  const href = match[1];
                  if (href !== undefined) targets.push({ href, linkId: block.id });
               }
            }
            return;
         case 'quote':
            for (const match of block.text.matchAll(INLINE_LINK)) {
               const href = match[1];
               if (href !== undefined) targets.push({ href, linkId: block.id });
            }
            return;
         case 'link':
            targets.push({ href: block.href, linkId: block.id });
            return;
         case 'code':
            return;
         case 'avatar':
            if (block.href !== undefined) targets.push({ href: block.href, linkId: block.id });
            return;
         case 'gallery':
            for (const image of block.images) {
               if (image.href !== undefined) targets.push({ href: image.href, linkId: block.id });
            }
            return;
         case 'table':
            for (const value of [block.header, block.rows]) {
               for (const match of value.matchAll(INLINE_LINK)) {
                  const href = match[1];
                  if (href !== undefined) targets.push({ href, linkId: block.id });
               }
            }
            return;
         case 'section':
            for (const child of block.children) visit(child);
            return;
         case 'columns':
            for (const column of block.columns) {
               for (const child of column.blocks) visit(child);
            }
            return;
         default:
            return;
      }
   };

   for (const block of document.children) visit(block);
   return targets;
}

function linkKey(linkId: string, href: string): string {
   return `${linkId}\u0000${href}`;
}

async function signClickLinks(
   env: Env,
   document: Document,
   messageId: string,
): Promise<Map<string, string>> {
   const resolved = new Map<string, string>();
   const seen = new Set<string>();

   for (const target of collectLinks(document)) {
      const key = linkKey(target.linkId, target.href);
      if (seen.has(key)) continue;
      seen.add(key);

      const token = await signToken(
         { m: messageId, u: target.href, l: target.linkId },
         { secret: env.TOKEN_SECRET, purpose: 'click', ttlSeconds: CLICK_TTL_SECONDS },
      );
      resolved.set(key, `${env.APP_URL}/t/c/${token}`);
   }

   return resolved;
}

async function loadSubscriberTags(db: D1Database, subscriberId: string): Promise<string[]> {
   const rows = await db
      .prepare(
         `SELECT t.name FROM tags t JOIN subscriber_tags st ON st.tag_id = t.id
          WHERE st.subscriber_id = ? ORDER BY t.name`,
      )
      .bind(subscriberId)
      .all<{ name: string }>();

   return rows.results.map((row) => row.name);
}

function mailDomain(env: Env): string {
   const at = env.EMAIL_FROM.lastIndexOf('@');
   return at === -1 ? 'example.com' : env.EMAIL_FROM.slice(at + 1);
}

export async function handleQueue(batch: MessageBatch<CampaignJob>, env: Env): Promise<void> {
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
         const unsubToken = await signToken(
            { s: subscriberId, c: campaignId },
            {
               secret: env.TOKEN_SECRET,
               purpose: 'unsubscribe',
               ttlSeconds: UNSUBSCRIBE_TTL_SECONDS,
            },
         );
         const unsubscribeUrl = `${env.APP_URL}/u/${unsubToken}`;

         const mergeContext: MergeContext = {
            subscriber: {
               id: subscriber.id,
               email: subscriber.email,
               first_name: subscriber.first_name,
               last_name: subscriber.last_name,
               tags,
               meta: metadata,
            },
            campaign: {
               id: campaign.id,
               subject: campaign.subject,
               utm_campaign: campaign.utm_campaign,
               meta: parseMetadataJson(campaign.metadata_snapshot ?? campaign.metadata_json),
            },
            links: { unsubscribe: unsubscribeUrl },
         };

         let html: string;
         let text: string;

         try {
            const merged = applyMergeTags(document, mergeContext);
            const links = await signClickLinks(env, merged, recipient.message_id);
            const rendered = renderEmail(merged, {
               unsubscribeUrl,
               resolveLink: (href, linkId) => links.get(linkKey(linkId, href)) ?? href,
            });

            const openToken = await signToken(
               { m: recipient.message_id },
               {
                  secret: env.TOKEN_SECRET,
                  purpose: 'open',
                  ttlSeconds: OPEN_TTL_SECONDS,
               },
            );
            const pixel = `<img src="${env.APP_URL}/t/o/${openToken}.png" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;outline:none;text-decoration:none;">`;

            html = rendered.html.replace('</body>', `${pixel}</body>`);
            if (!html.includes(pixel)) html = `${html}${pixel}`;
            text = rendered.text;
         } catch (error) {
            const code = errorCodeOf(error) ?? 'render_error';
            await env.DB.prepare(
               `UPDATE campaign_recipients SET status = 'failed', error_code = ?
                WHERE campaign_id = ? AND subscriber_id = ?`,
            )
               .bind(code, campaignId, subscriberId)
               .run();
            continue;
         }

         const headers: Record<string, string> = {
            'List-Unsubscribe': `<${unsubscribeUrl}>, <mailto:unsubscribe@${mailDomain(env)}>`,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
         };

         try {
            const result = await adapter.send({
               from: { name: campaign.from_name, email: campaign.from_email },
               ...(campaign.reply_to === null ? {} : { replyTo: campaign.reply_to }),
               to: subscriber.email,
               subject: campaign.subject,
               html,
               text,
               headers,
            });

            await env.DB.prepare(
               `UPDATE campaign_recipients
                SET status = 'sent', sent_at = ?, provider_message_id = ?, error_code = NULL
                WHERE campaign_id = ? AND subscriber_id = ?`,
            )
               .bind(nowSeconds(), result.providerMessageId, campaignId, subscriberId)
               .run();
         } catch (error) {
            const failure = adapter.classifyError(error);
            const code = errorCodeOf(error) ?? failure;

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

export { TRANSPARENT_PNG };
