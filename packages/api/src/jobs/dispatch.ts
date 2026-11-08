import { createId } from '@postwren/worker-kit/ids';
import type { Env } from '../env';
import type { CampaignRow } from '../lib/rows';
import { compileAudience } from '@postwren/shared/audience';
import { countAudience } from '../lib/audience';
import { nowSeconds } from '../lib/time';
import { runAutomationSweep } from './automation';

const PAGE_SIZE = 500;
const INSERT_ROWS_PER_STATEMENT = 20;
const QUEUE_BATCH_SIZE = 100;

function chunk<T>(items: T[], size: number): T[][] {
   const chunks: T[][] = [];
   for (let index = 0; index < items.length; index += size) {
      chunks.push(items.slice(index, index + size));
   }
   return chunks;
}

export async function loadCampaign(db: D1Database, id: string): Promise<CampaignRow | null> {
   return db.prepare('SELECT * FROM campaigns WHERE id = ?').bind(id).first<CampaignRow>();
}

async function insertRecipients(
   db: D1Database,
   campaignId: string,
   subscriberIds: string[],
): Promise<void> {
   const statements: D1PreparedStatement[] = [];

   for (const batch of chunk(subscriberIds, INSERT_ROWS_PER_STATEMENT)) {
      const values = batch.map(() => '(?, ?, ?, ?)').join(', ');
      const params: string[] = [];
      for (const subscriberId of batch) {
         params.push(campaignId, subscriberId, createId('msg'), 'queued');
      }

      statements.push(
         db
            .prepare(
               `INSERT OR IGNORE INTO campaign_recipients
                (campaign_id, subscriber_id, message_id, status)
                VALUES ${values}`,
            )
            .bind(...params),
      );
   }

   if (statements.length > 0) {
      await db.batch(statements);
   }
}

async function enqueue(env: Env, campaignId: string, recipientIds: string[]): Promise<void> {
   const messages = chunk(recipientIds, QUEUE_BATCH_SIZE).map((ids) => ({
      body: { campaignId, recipientIds: ids },
   }));
   if (messages.length > 0) {
      await env.CAMPAIGN_QUEUE.sendBatch(messages);
   }
}

async function enqueueQueued(env: Env, campaignId: string): Promise<void> {
   let cursor = '';
   for (;;) {
      const page = await env.DB.prepare(
         `SELECT subscriber_id FROM campaign_recipients
          WHERE campaign_id = ? AND status = 'queued' AND subscriber_id > ?
          ORDER BY subscriber_id ASC
          LIMIT ?`,
      )
         .bind(campaignId, cursor, PAGE_SIZE)
         .all<{ subscriber_id: string }>();

      const ids = page.results.map((row) => row.subscriber_id);
      if (ids.length === 0) break;

      await enqueue(env, campaignId, ids);

      const last = ids[ids.length - 1];
      if (last === undefined) break;
      cursor = last;

      if (ids.length < PAGE_SIZE) break;
   }
}

export async function dispatchCampaign(
   env: Env,
   campaignId: string,
   now = nowSeconds(),
): Promise<void> {
   const campaign = await loadCampaign(env.DB, campaignId);
   if (campaign === null) return;
   if (campaign.status === 'cancelled' || campaign.status === 'sent') return;

   if (campaign.status !== 'sending') {
      await env.DB.prepare(
         `UPDATE campaigns
          SET status = 'sending', started_at = COALESCE(started_at, ?), updated_at = ?
          WHERE id = ?`,
      )
         .bind(now, now, campaignId)
         .run();
   }

   let audienceCount = campaign.audience_count;
   if (audienceCount === null) {
      audienceCount = await countAudience(env.DB, campaign.audience_query);
      await env.DB.prepare('UPDATE campaigns SET audience_count = ? WHERE id = ?')
         .bind(audienceCount, campaignId)
         .run();
   }

   const compiled = compileAudience(campaign.audience_query);
   let cursor = campaign.dispatch_cursor ?? '';

   for (;;) {
      const page = await env.DB.prepare(
         `SELECT s.id FROM subscribers s
          WHERE (${compiled.sql}) AND s.id > ?
          ORDER BY s.id ASC
          LIMIT ?`,
      )
         .bind(...compiled.params, cursor, PAGE_SIZE)
         .all<{ id: string }>();

      const ids = page.results.map((row) => row.id);
      if (ids.length === 0) break;

      await insertRecipients(env.DB, campaignId, ids);

      const last = ids[ids.length - 1];
      if (last === undefined) break;
      cursor = last;

      await env.DB.prepare('UPDATE campaigns SET dispatch_cursor = ? WHERE id = ?')
         .bind(cursor, campaignId)
         .run();

      if (ids.length < PAGE_SIZE) break;
   }

   await enqueueQueued(env, campaignId);

   const total = await env.DB.prepare(
      'SELECT COUNT(*) AS count FROM campaign_recipients WHERE campaign_id = ?',
   )
      .bind(campaignId)
      .first<{ count: number }>();

   if ((total?.count ?? 0) === 0) {
      await env.DB.prepare(
         `UPDATE campaigns SET status = 'sent', completed_at = ?, updated_at = ?
          WHERE id = ? AND status = 'sending'`,
      )
         .bind(now, now, campaignId)
         .run();
   }
}

export async function runDispatch(env: Env, now = nowSeconds()): Promise<void> {
   const due = await env.DB.prepare(
      `SELECT id FROM campaigns
       WHERE status = 'scheduled' AND scheduled_at IS NOT NULL AND scheduled_at <= ?
       ORDER BY scheduled_at ASC
       LIMIT 5`,
   )
      .bind(now)
      .all<{ id: string }>();

   for (const campaign of due.results) {
      await dispatchCampaign(env, campaign.id, now);
   }
}

export async function pruneExpired(env: Env, now = nowSeconds()): Promise<void> {
   await env.DB.batch([
      env.DB.prepare('DELETE FROM rate_limits WHERE window_start < ?').bind(now - 3600),
      env.DB.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(now),
      env.DB.prepare('DELETE FROM magic_links WHERE expires_at <= ?').bind(now),
   ]);
}

export async function handleScheduled(
   _controller: ScheduledController,
   env: Env,
   ctx: ExecutionContext,
): Promise<void> {
   const now = nowSeconds();
   ctx.waitUntil(
      (async () => {
         await runDispatch(env, now);
         await runAutomationSweep(env, now);
         await pruneExpired(env, now);
      })(),
   );
}
