import { Hono } from 'hono';
import { ok } from '@postwren/worker-kit/envelope';
import type { AppEnv } from '../env';
import { nowSeconds } from '../lib/time';

const WEEK_SECONDS = 7 * 24 * 60 * 60;
const GROWTH_WEEKS = 12;
const ENGAGEMENT_DAYS = 30;

type CampaignSummaryRow = {
   id: string;
   name: string;
   subject: string;
   status: string;
   audience_count: number | null;
   scheduled_at: number | null;
   started_at: number | null;
   completed_at: number | null;
   created_at: number;
   updated_at: number;
};

type CountRow = { count: number };
type GrowthRow = { bucket: number; count: number };
type EngagementRow = { sent: number | null; opened: number | null; clicked: number | null };

function summary(row: CampaignSummaryRow) {
   return {
      id: row.id,
      name: row.name,
      subject: row.subject,
      status: row.status,
      audienceCount: row.audience_count,
      scheduledAt: row.scheduled_at,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
   };
}

export const dashboardRoutes = new Hono<AppEnv>();

dashboardRoutes.get('/', async (c) => {
   const now = nowSeconds();
   const db = c.env.DB;

   const [activeSubscribers, totalSubscribers, unsubscribed, templates, campaignsSent] =
      await Promise.all([
         db
            .prepare(
               "SELECT COUNT(*) AS count FROM subscribers WHERE deleted_at IS NULL AND status = 'subscribed'",
            )
            .first<CountRow>(),
         db
            .prepare('SELECT COUNT(*) AS count FROM subscribers WHERE deleted_at IS NULL')
            .first<CountRow>(),
         db
            .prepare(
               "SELECT COUNT(*) AS count FROM subscribers WHERE deleted_at IS NULL AND status = 'unsubscribed'",
            )
            .first<CountRow>(),
         db.prepare('SELECT COUNT(*) AS count FROM templates').first<CountRow>(),
         db
            .prepare("SELECT COUNT(*) AS count FROM campaigns WHERE status = 'sent'")
            .first<CountRow>(),
      ]);

   const [scheduled, verifiedSender, sentCampaign, engagement] = await Promise.all([
      db
         .prepare("SELECT COUNT(*) AS count FROM campaigns WHERE status = 'scheduled'")
         .first<CountRow>(),
      db
         .prepare('SELECT 1 AS count FROM sender_addresses WHERE verified_at IS NOT NULL LIMIT 1')
         .first<CountRow>(),
      db
         .prepare(
            "SELECT 1 AS count FROM campaigns WHERE status IN ('sending', 'sent', 'paused') LIMIT 1",
         )
         .first<CountRow>(),
      db
         .prepare(
            `SELECT COUNT(*) AS sent,
                    SUM(CASE WHEN cr.opened_at IS NOT NULL THEN 1 ELSE 0 END) AS opened,
                    SUM(CASE WHEN cr.clicked_at IS NOT NULL THEN 1 ELSE 0 END) AS clicked
             FROM campaign_recipients cr
             JOIN campaigns c ON c.id = cr.campaign_id
             WHERE c.completed_at IS NOT NULL AND c.completed_at >= ?
               AND cr.status IN ('sent', 'delivered')`,
         )
         .bind(now - ENGAGEMENT_DAYS * 24 * 60 * 60)
         .first<EngagementRow>(),
   ]);

   const currentBucket = Math.floor(now / WEEK_SECONDS);
   const firstBucket = currentBucket - GROWTH_WEEKS + 1;
   const growthRows = await db
      .prepare(
         `SELECT CAST(created_at / ? AS INTEGER) AS bucket, COUNT(*) AS count
          FROM subscribers
          WHERE deleted_at IS NULL AND created_at >= ?
          GROUP BY bucket
          ORDER BY bucket`,
      )
      .bind(WEEK_SECONDS, firstBucket * WEEK_SECONDS)
      .all<GrowthRow>();

   const byBucket = new Map(growthRows.results.map((row) => [row.bucket, row.count]));
   const growth = Array.from({ length: GROWTH_WEEKS }, (_, index) => {
      const bucket = firstBucket + index;
      return { weekStart: bucket * WEEK_SECONDS, count: byBucket.get(bucket) ?? 0 };
   });

   const recentRows = await db
      .prepare(
         `SELECT id, name, subject, status, audience_count, scheduled_at, started_at,
                 completed_at, created_at, updated_at
          FROM campaigns
          WHERE status IN ('sent', 'sending', 'paused', 'cancelled', 'failed')
          ORDER BY COALESCE(completed_at, updated_at) DESC, id DESC
          LIMIT 5`,
      )
      .all<CampaignSummaryRow>();

   const upcomingRows = await db
      .prepare(
         `SELECT id, name, subject, status, audience_count, scheduled_at, started_at,
                 completed_at, created_at, updated_at
          FROM campaigns
          WHERE status = 'scheduled'
          ORDER BY scheduled_at ASC, id ASC
          LIMIT 3`,
      )
      .all<CampaignSummaryRow>();

   const sent = engagement?.sent ?? 0;
   const opened = engagement?.opened ?? 0;
   const clicked = engagement?.clicked ?? 0;

   const automationCounts = await db
      .prepare(
         `SELECT
            (SELECT COUNT(*) FROM automations WHERE status = 'active') AS active_automations,
            (SELECT COUNT(*) FROM automation_runs WHERE status IN ('waiting', 'running')) AS active_runs,
            (SELECT COUNT(*) FROM automation_runs WHERE entered_at >= ?) AS runs_7d,
            (SELECT COUNT(*) FROM automation_runs
             WHERE status IN ('completed', 'exited') AND completed_at >= ?) AS finished_7d,
            (SELECT COUNT(*) FROM automation_deliveries
             WHERE status = 'sent' AND sent_at >= ?) AS sent_7d`,
      )
      .bind(now - WEEK_SECONDS, now - WEEK_SECONDS, now - WEEK_SECONDS)
      .first<{
         active_automations: number;
         active_runs: number;
         runs_7d: number;
         finished_7d: number;
         sent_7d: number;
      }>();

   const automationRuns = await db
      .prepare(
         `SELECT r.id, r.status, r.entered_at, r.completed_at, r.exit_reason,
                 a.name AS automation_name, a.id AS automation_id, s.email AS email
          FROM automation_runs r
          JOIN automations a ON a.id = r.automation_id
          JOIN subscribers s ON s.id = r.subscriber_id
          ORDER BY r.entered_at DESC, r.id DESC
          LIMIT 5`,
      )
      .all<{
         id: string;
         status: string;
         entered_at: number;
         completed_at: number | null;
         exit_reason: string | null;
         automation_name: string;
         automation_id: string;
         email: string;
      }>();

   return ok(
      {
         generatedAt: now,
         counts: {
            activeSubscribers: activeSubscribers?.count ?? 0,
            totalSubscribers: totalSubscribers?.count ?? 0,
            unsubscribed: unsubscribed?.count ?? 0,
            templates: templates?.count ?? 0,
            campaignsSent: campaignsSent?.count ?? 0,
            scheduled: scheduled?.count ?? 0,
         },
         engagement: {
            windowDays: ENGAGEMENT_DAYS,
            sent,
            opened,
            clicked,
            openRate: sent > 0 ? opened / sent : null,
            clickRate: sent > 0 ? clicked / sent : null,
         },
         growth,
         recent: recentRows.results.map(summary),
         upcoming: upcomingRows.results.map(summary),
         automations: {
            activeAutomations: automationCounts?.active_automations ?? 0,
            activeRuns: automationCounts?.active_runs ?? 0,
            runs7d: automationCounts?.runs_7d ?? 0,
            finished7d: automationCounts?.finished_7d ?? 0,
            sent7d: automationCounts?.sent_7d ?? 0,
            windowDays: 7,
            recent: automationRuns.results.map((row) => ({
               id: row.id,
               automationId: row.automation_id,
               automationName: row.automation_name,
               email: row.email,
               status: row.status,
               enteredAt: row.entered_at,
               completedAt: row.completed_at,
               exitReason: row.exit_reason,
            })),
         },
         setup: {
            verifiedSender: verifiedSender !== null,
            template: (templates?.count ?? 0) > 0,
            sentCampaign: sentCampaign !== null,
         },
      },
      { requestId: c.get('requestId') },
   );
});
