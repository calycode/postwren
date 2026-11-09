import { Hono } from 'hono';
import { z } from 'zod';
import { createId } from '@postwren/worker-kit/ids';
import { ok, paginated } from '@postwren/worker-kit/envelope';
import {
   AppError,
   ConflictError,
   NotFoundError,
   ValidationError,
} from '@postwren/worker-kit/errors';
import { campaignInput, paginationQuery } from '@postwren/shared/contracts';
import {
   MAX_METADATA_KEYS,
   mergeMetadata,
   metadataPatch,
   parseMetadataJson,
   serialiseMetadata,
} from '@postwren/shared/metadata';
import type { MetadataRecord } from '@postwren/shared/metadata';
import { parsePayload, parsePayloadJson } from '@postwren/shared/payload';
import type { PayloadData } from '@postwren/shared/payload';
import { parseDocument } from '@postwren/email/ir';
import { renderEmail } from '@postwren/email/render';
import { applyMergeTags } from '@postwren/email/template';
import type { Env } from '../env';
import type { AppEnv } from '../env';
import type { CampaignRow, RecipientRow, TemplateRow } from '../lib/rows';
import { readJson } from '../lib/validation';
import { requireConfiguredAppOrigin } from '../lib/app-url';
import { decodeCursor, encodeCursor } from '../lib/cursor';
import { nowSeconds } from '../lib/time';
import { assertAudienceQuery, countAudience } from '../lib/audience';
import { assertSenderAllowed } from '../lib/senders';
import { createCloudflareAdapter } from '../adapters/email';
import { dispatchCampaign, loadCampaign } from '../jobs/dispatch';
import { SAMPLE_UNSUBSCRIBE_URL, sampleMergeContext } from '../lib/sample';
import { emitWebhookEventSafe } from '../lib/webhooks';

const TRANSITIONS: Record<string, string[]> = {
   draft: ['scheduled', 'sending'],
   scheduled: ['sending', 'cancelled'],
   sending: ['paused', 'sent'],
   paused: ['sending', 'cancelled'],
   sent: [],
   cancelled: [],
};

const scheduleInput = z.object({ scheduledAt: z.number().int().nonnegative() });

const testInput = z.object({
   email: z
      .string()
      .trim()
      .email()
      .transform((value) => value.toLowerCase())
      .optional(),
});

const campaignPatch = z
   .object({
      name: z.string().trim().min(1).max(200).optional(),
      templateId: z.string().trim().min(1).max(100).optional(),
      subject: z.string().trim().min(1).max(998).optional(),
      fromName: z.string().trim().min(1).max(100).optional(),
      fromEmail: z
         .string()
         .trim()
         .email()
         .transform((value) => value.toLowerCase())
         .optional(),
      replyTo: z
         .string()
         .trim()
         .email()
         .transform((value) => value.toLowerCase())
         .optional(),
      audienceQuery: z.string().trim().max(2000).optional(),
      utmSource: z.string().trim().min(1).max(100).optional(),
      utmMedium: z.string().trim().min(1).max(100).optional(),
      utmCampaign: z.string().trim().min(1).max(191).optional(),
      metadata: metadataPatch.optional(),
      data: z.unknown().optional(),
   })
   .strict();

const recipientsQuery = paginationQuery;

export const campaignRoutes = new Hono<AppEnv>();

type StatsCacheEntry = { expiresAt: number; value: unknown };
const statsCache = new Map<string, StatsCacheEntry>();
const STATS_TTL_MS = 30_000;

function assertTransition(from: string, to: string): void {
   const allowed = TRANSITIONS[from] ?? [];
   if (!allowed.includes(to)) {
      throw new ConflictError(`Cannot move campaign from ${from} to ${to}`);
   }
}

async function requireTemplate(db: D1Database, id: string): Promise<TemplateRow> {
   const template = await db
      .prepare('SELECT * FROM templates WHERE id = ?')
      .bind(id)
      .first<TemplateRow>();
   if (template === null) {
      throw new NotFoundError('Template not found');
   }
   return template;
}

export type CampaignResource = Omit<CampaignRow, 'metadata_json' | 'data_json'> & {
   metadata: MetadataRecord;
   data: PayloadData;
};

function campaignResource(row: CampaignRow): CampaignResource {
   const { metadata_json, data_json, ...rest } = row;
   return {
      ...rest,
      metadata: parseMetadataJson(metadata_json),
      data: parsePayloadJson(data_json),
   };
}

function campaignMergeMetadata(campaign: CampaignResource): MetadataRecord {
   if (campaign.ir_snapshot === null || campaign.metadata_snapshot === null) {
      return campaign.metadata;
   }
   return parseMetadataJson(campaign.metadata_snapshot);
}

function campaignMergeData(campaign: CampaignResource): PayloadData {
   if (campaign.ir_snapshot === null || campaign.data_snapshot === null) {
      return campaign.data;
   }
   return parsePayloadJson(campaign.data_snapshot);
}

function requirePayload(value: unknown): PayloadData {
   const parsed = parsePayload(value);
   if (!parsed.ok) {
      throw new AppError(422, 'validation_error', 'Campaign data is invalid', {
         issues: parsed.errors,
      });
   }
   return parsed.data;
}

async function findCampaign(db: D1Database, id: string): Promise<CampaignResource> {
   const campaign = await loadCampaign(db, id);
   if (campaign === null) {
      throw new NotFoundError('Campaign not found');
   }
   return campaignResource(campaign);
}

async function pinAudience(
   env: Env,
   campaignId: string,
   query: string,
   template: TemplateRow,
): Promise<number> {
   const count = await countAudience(env.DB, query);
   await env.DB.prepare(
      `UPDATE campaigns
       SET template_revision = ?, ir_snapshot = ?, metadata_snapshot = metadata_json,
           data_snapshot = data_json, audience_count = ?, updated_at = ?
       WHERE id = ?`,
   )
      .bind(template.revision, template.ir_json, count, nowSeconds(), campaignId)
      .run();
   return count;
}

campaignRoutes.get('/', async (c) => {
   const rows = await c.env.DB.prepare(
      'SELECT * FROM campaigns ORDER BY created_at DESC, id DESC',
   ).all<CampaignRow>();

   return ok(rows.results.map(campaignResource), { requestId: c.get('requestId') });
});

campaignRoutes.post('/', async (c) => {
   const body = campaignInput.parse(await readJson(c));
   assertAudienceQuery(body.audienceQuery);
   await assertSenderAllowed(c.env.DB, body.fromEmail, c.env.EMAIL_FROM);
   const data = body.data === undefined ? {} : requirePayload(body.data);

   const template = await requireTemplate(c.env.DB, body.templateId);
   const now = nowSeconds();
   const id = createId('cmp');

   await c.env.DB.prepare(
      `INSERT INTO campaigns
       (id, template_id, template_revision, name, subject, from_name, from_email, reply_to,
        audience_query, scheduled_at, status, utm_source, utm_medium, utm_campaign,
        metadata_json, data_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?)`,
   )
      .bind(
         id,
         body.templateId,
         template.revision,
         body.name,
         body.subject,
         body.fromName,
         body.fromEmail,
         body.replyTo ?? null,
         body.audienceQuery,
         body.scheduledAt ?? null,
         body.utmSource ?? '',
         body.utmMedium ?? '',
         body.utmCampaign ?? '',
         serialiseMetadata(body.metadata ?? {}),
         JSON.stringify(data),
         now,
         now,
      )
      .run();

   const campaign = await findCampaign(c.env.DB, id);
   return ok(campaign, { status: 201, requestId: c.get('requestId') });
});

campaignRoutes.get('/:id', async (c) => {
   return ok(await findCampaign(c.env.DB, c.req.param('id')));
});

campaignRoutes.patch('/:id', async (c) => {
   const id = c.req.param('id');
   const existing = await findCampaign(c.env.DB, id);
   const body = campaignPatch.parse(await readJson(c));

   if (body.audienceQuery !== undefined) {
      assertAudienceQuery(body.audienceQuery);
   }

   if (body.fromEmail !== undefined) {
      await assertSenderAllowed(c.env.DB, body.fromEmail, c.env.EMAIL_FROM);
   }

   const sets: string[] = [];
   const params: (string | number | null)[] = [];

   const assign = (column: string, value: string | undefined): void => {
      if (value !== undefined) {
         sets.push(`${column} = ?`);
         params.push(value);
      }
   };

   assign('name', body.name);
   assign('subject', body.subject);
   assign('from_name', body.fromName);
   assign('from_email', body.fromEmail);
   assign('reply_to', body.replyTo);
   assign('audience_query', body.audienceQuery);
   assign('utm_source', body.utmSource);
   assign('utm_medium', body.utmMedium);
   assign('utm_campaign', body.utmCampaign);

   if (body.metadata !== undefined) {
      const merged = mergeMetadata(existing.metadata, body.metadata);
      if (Object.keys(merged).length > MAX_METADATA_KEYS) {
         throw new ValidationError(`At most ${MAX_METADATA_KEYS} metadata keys are allowed`);
      }
      sets.push('metadata_json = ?');
      params.push(serialiseMetadata(merged));
   }

   if (body.data !== undefined) {
      sets.push('data_json = ?');
      params.push(JSON.stringify(requirePayload(body.data)));
   }

   if (body.templateId !== undefined) {
      const template = await requireTemplate(c.env.DB, body.templateId);
      sets.push('template_id = ?', 'template_revision = ?');
      params.push(template.id, template.revision);
   }

   if (sets.length > 0) {
      sets.push('updated_at = ?');
      params.push(nowSeconds());
      await c.env.DB.prepare(`UPDATE campaigns SET ${sets.join(', ')} WHERE id = ?`)
         .bind(...params, id)
         .run();
   }

   return ok(await findCampaign(c.env.DB, existing.id));
});

campaignRoutes.post('/:id/schedule', async (c) => {
   const id = c.req.param('id');
   const campaign = await findCampaign(c.env.DB, id);
   const body = scheduleInput.parse(await readJson(c));
   const now = nowSeconds();

   if (body.scheduledAt <= now) {
      throw new AppError(422, 'validation_error', 'scheduledAt must be in the future');
   }

   assertTransition(campaign.status, 'scheduled');
   requireConfiguredAppOrigin(c.env);
   const template = await requireTemplate(c.env.DB, campaign.template_id);
   const audienceCount = await pinAudience(c.env, id, campaign.audience_query, template);

   await c.env.DB.prepare(
      `UPDATE campaigns SET status = 'scheduled', scheduled_at = ?, updated_at = ?
       WHERE id = ?`,
   )
      .bind(body.scheduledAt, now, id)
      .run();

   await emitWebhookEventSafe(c.env, 'campaign.scheduled', {
      id,
      name: campaign.name,
      subject: campaign.subject,
      scheduled_at: body.scheduledAt,
      audience_count: audienceCount,
   });

   return ok(await findCampaign(c.env.DB, id));
});

campaignRoutes.post('/:id/send-now', async (c) => {
   const id = c.req.param('id');
   const campaign = await findCampaign(c.env.DB, id);
   assertTransition(campaign.status, 'sending');
   requireConfiguredAppOrigin(c.env);

   const template = await requireTemplate(c.env.DB, campaign.template_id);
   await pinAudience(c.env, id, campaign.audience_query, template);

   const now = nowSeconds();
   await c.env.DB.prepare(
      `UPDATE campaigns SET status = 'sending', started_at = COALESCE(started_at, ?), updated_at = ?
       WHERE id = ?`,
   )
      .bind(now, now, id)
      .run();

   await dispatchCampaign(c.env, id, now);
   return ok(await findCampaign(c.env.DB, id));
});

campaignRoutes.post('/:id/pause', async (c) => {
   const id = c.req.param('id');
   const campaign = await findCampaign(c.env.DB, id);
   assertTransition(campaign.status, 'paused');

   await c.env.DB.prepare(`UPDATE campaigns SET status = 'paused', updated_at = ? WHERE id = ?`)
      .bind(nowSeconds(), id)
      .run();

   return ok(await findCampaign(c.env.DB, id));
});

campaignRoutes.post('/:id/cancel', async (c) => {
   const id = c.req.param('id');
   const campaign = await findCampaign(c.env.DB, id);
   assertTransition(campaign.status, 'cancelled');

   await c.env.DB.prepare(`UPDATE campaigns SET status = 'cancelled', updated_at = ? WHERE id = ?`)
      .bind(nowSeconds(), id)
      .run();

   return ok(await findCampaign(c.env.DB, id));
});

campaignRoutes.post('/:id/test', async (c) => {
   const id = c.req.param('id');
   const campaign = await findCampaign(c.env.DB, id);
   const body = testInput.parse(await readJson(c).catch(() => ({})));

   const recipient = body.email ?? c.env.OWNER_EMAIL?.trim().toLowerCase();
   if (recipient === undefined || recipient.length === 0) {
      throw new ValidationError('No test recipient available');
   }

   const template = await requireTemplate(c.env.DB, campaign.template_id);
   const document = parseDocument(JSON.parse(template.ir_json));
   const merged = applyMergeTags(
      document,
      sampleMergeContext({
         id: campaign.id,
         subject: campaign.subject,
         utm_campaign: campaign.utm_campaign,
         meta: campaignMergeMetadata(campaign),
         data: campaignMergeData(campaign),
      }),
   );
   const rendered = renderEmail(merged, { unsubscribeUrl: SAMPLE_UNSUBSCRIBE_URL });

   const adapter = createCloudflareAdapter(c.env);
   try {
      await adapter.send({
         from: { name: campaign.from_name, email: campaign.from_email },
         ...(campaign.reply_to === null ? {} : { replyTo: campaign.reply_to }),
         to: recipient,
         subject: campaign.subject,
         html: rendered.html,
         text: rendered.text,
      });
   } catch (error) {
      throw new AppError(502, 'send_failed', 'Test message could not be sent', {
         reason: error instanceof Error ? error.message : String(error),
      });
   }

   return ok({ sent: true, to: recipient });
});

campaignRoutes.get('/:id/recipients', async (c) => {
   const id = c.req.param('id');
   await findCampaign(c.env.DB, id);
   const query = recipientsQuery.parse(c.req.query());

   const clauses = ['cr.campaign_id = ?'];
   const params: string[] = [id];

   if (query.cursor !== undefined) {
      clauses.push('cr.subscriber_id > ?');
      params.push(decodeCursor(query.cursor));
   }

   const rows = await c.env.DB.prepare(
      `SELECT cr.*, s.email AS email
       FROM campaign_recipients cr
       LEFT JOIN subscribers s ON s.id = cr.subscriber_id
       WHERE ${clauses.join(' AND ')}
       ORDER BY cr.subscriber_id ASC
       LIMIT ?`,
   )
      .bind(...params, query.limit + 1)
      .all<RecipientRow & { email: string | null }>();

   const hasMore = rows.results.length > query.limit;
   const page = hasMore ? rows.results.slice(0, query.limit) : rows.results;
   const last = page[page.length - 1];

   return paginated(page, {
      nextCursor: hasMore && last !== undefined ? encodeCursor(last.subscriber_id) : null,
      hasMore,
      requestId: c.get('requestId'),
   });
});

campaignRoutes.get('/:id/preview', async (c) => {
   const campaign = await findCampaign(c.env.DB, c.req.param('id'));
   const snapshot =
      campaign.ir_snapshot ?? (await requireTemplate(c.env.DB, campaign.template_id)).ir_json;

   const base = parseDocument(JSON.parse(snapshot));
   const document = applyMergeTags(
      base,
      sampleMergeContext({
         subject: campaign.subject,
         utm_campaign: campaign.utm_campaign,
         meta: campaignMergeMetadata(campaign),
         data: campaignMergeData(campaign),
      }),
   );
   const result = renderEmail(document, { unsubscribeUrl: SAMPLE_UNSUBSCRIBE_URL });

   return ok(result, { requestId: c.get('requestId') });
});

campaignRoutes.get('/:id/stats', async (c) => {
   const id = c.req.param('id');
   const campaign = await findCampaign(c.env.DB, id);

   const cached = statsCache.get(id);
   if (cached !== undefined && cached.expiresAt > Date.now()) {
      return ok(cached.value);
   }

   const statusRows = await c.env.DB.prepare(
      `SELECT status, COUNT(*) AS count FROM campaign_recipients
       WHERE campaign_id = ? GROUP BY status`,
   )
      .bind(id)
      .all<{ status: string; count: number }>();

   const statuses: Record<string, number> = {};
   let total = 0;
   for (const row of statusRows.results) {
      statuses[row.status] = row.count;
      total += row.count;
   }

   const opens = await c.env.DB.prepare(
      'SELECT COUNT(*) AS count FROM campaign_recipients WHERE campaign_id = ? AND opened_at IS NOT NULL',
   )
      .bind(id)
      .first<{ count: number }>();

   const clicks = await c.env.DB.prepare(
      'SELECT COUNT(*) AS count FROM campaign_recipients WHERE campaign_id = ? AND clicked_at IS NOT NULL',
   )
      .bind(id)
      .first<{ count: number }>();

   const links = await c.env.DB.prepare(
      `SELECT url, COUNT(*) AS clicks, COUNT(DISTINCT subscriber_id) AS clickers,
              MAX(clicked_at) AS last_clicked_at
       FROM link_clicks
       WHERE campaign_id = ?
       GROUP BY url
       ORDER BY clicks DESC, url ASC
       LIMIT 8`,
   )
      .bind(id)
      .all<{ url: string; clicks: number; clickers: number; last_clicked_at: number }>();

   const recentClicks = await c.env.DB.prepare(
      `SELECT s.email AS email, lc.url AS url, lc.clicked_at AS clicked_at
       FROM link_clicks lc
       LEFT JOIN subscribers s ON s.id = lc.subscriber_id
       WHERE lc.campaign_id = ?
       ORDER BY lc.clicked_at DESC
       LIMIT 8`,
   )
      .bind(id)
      .all<{ email: string | null; url: string; clicked_at: number }>();

   const audienceSize = campaign.audience_count ?? total;
   const uniqueClicks = clicks?.count ?? 0;

   const value = {
      campaignId: id,
      audienceSize,
      totalRecipients: total,
      statuses,
      uniqueOpens: opens?.count ?? 0,
      uniqueClicks,
      clickThroughRate: audienceSize > 0 ? uniqueClicks / audienceSize : 0,
      topLinks: links.results.map((row) => ({
         url: row.url,
         clicks: row.clicks,
         clickers: row.clickers,
         lastClickedAt: row.last_clicked_at,
      })),
      recentClicks: recentClicks.results.map((row) => ({
         email: row.email,
         url: row.url,
         clickedAt: row.clicked_at,
      })),
   };

   statsCache.set(id, { expiresAt: Date.now() + STATS_TTL_MS, value });
   return ok(value);
});
