import { createId, sha256Hex } from '@postwren/worker-kit/ids';
import { compileAudience } from '@postwren/shared/audience';
import { parseDocument } from '@postwren/email/ir';
import { parseMetadataJson } from '@postwren/shared/metadata';
import type { Env } from '../env';
import { createCloudflareAdapter } from '../adapters/email';
import { configuredAppOrigin } from '../lib/app-url';
import type { AutomationRow, AutomationRunRow } from '../lib/automation-rows';
import {
   parseAutomationSteps,
   readTriggerConfig,
   triggerMatches,
   waitSeconds,
} from '../lib/automation';
import type { AutomationEvent, AutomationStep } from '../lib/automation';
import { deliverEmail } from '../lib/delivery';
import {
   attachTag,
   ensureTag,
   loadSubscriberMetadata,
   loadSubscriberTags,
} from '../lib/subscribers';
import { nowSeconds } from '../lib/time';

const SWEEP_LIMIT = 20;
const CONTINUE_DELAY_SECONDS = 1;

function parseGraph(value: string): AutomationStep[] {
   try {
      return parseAutomationSteps(JSON.parse(value));
   } catch {
      return [];
   }
}

async function entryMatches(
   db: D1Database,
   subscriberId: string,
   entryQuery: string,
): Promise<boolean> {
   const trimmed = entryQuery.trim();
   if (trimmed.length === 0) return true;

   try {
      const compiled = compileAudience(trimmed);
      const row = await db
         .prepare(`SELECT 1 AS ok FROM subscribers s WHERE s.id = ? AND (${compiled.sql})`)
         .bind(subscriberId, ...compiled.params)
         .first<{ ok: number }>();
      return row !== null;
   } catch {
      return false;
   }
}

function eventKey(event: AutomationEvent, automationId: string, version: number): string {
   const suffix = `${automationId}:${event.subscriberId}:${version}`;
   switch (event.kind) {
      case 'subscriber.created':
         return `created:${suffix}`;
      case 'tag.added':
         return `tag:${event.tag}:${suffix}`;
      case 'campaign.clicked':
         return `click:${event.messageId}:${event.linkId ?? ''}:${suffix}`;
      case 'api.event':
         return `event:${event.eventId}:${suffix}`;
   }
}

/**
 * Enrols one subscriber in every active automation whose trigger accepts the
 * event. The run id derives from the event, so a replayed write cannot enrol the
 * same subscriber twice for the same trigger occurrence.
 */
export async function enrollAutomations(
   env: Env,
   event: AutomationEvent,
   now = nowSeconds(),
): Promise<number> {
   const automations = await env.DB.prepare(
      `SELECT * FROM automations
       WHERE status = 'active' AND trigger_type = ?
       ORDER BY created_at ASC`,
   )
      .bind(event.kind)
      .all<AutomationRow>();

   let enrolled = 0;
   for (const automation of automations.results) {
      const config = readTriggerConfig(automation.trigger_type, automation.trigger_config_json);
      if (!triggerMatches(automation.trigger_type, config, event)) continue;
      if (!(await entryMatches(env.DB, event.subscriberId, automation.entry_query))) continue;

      const idempotencyKey = eventKey(event, automation.id, automation.version);
      const runId = `run_${(await sha256Hex(idempotencyKey)).slice(0, 24)}`;

      const result = await env.DB.prepare(
         `INSERT OR IGNORE INTO automation_runs
            (id, automation_id, automation_version, subscriber_id, status, graph_json,
             current_step_index, next_run_at, entered_at, idempotency_key)
          VALUES (?, ?, ?, ?, 'waiting', ?, 0, ?, ?, ?)`,
      )
         .bind(
            runId,
            automation.id,
            automation.version,
            event.subscriberId,
            automation.steps_json,
            now,
            now,
            idempotencyKey,
         )
         .run();

      if ((result.meta.changes ?? 0) > 0) enrolled += 1;
   }

   return enrolled;
}

/** Backwards-compatible wrapper for the original subscriber.created trigger. */
export function enrollSubscriberCreated(
   env: Env,
   subscriberId: string,
   now = nowSeconds(),
): Promise<number> {
   return enrollAutomations(env, { kind: 'subscriber.created', subscriberId }, now);
}

/** Enrols tag.added automations after a tag write. Best-effort by design. */
export async function enrollAddedTags(
   env: Env,
   subscriberId: string,
   tags: string[],
   now = nowSeconds(),
): Promise<void> {
   for (const tag of tags) {
      try {
         await enrollAutomations(env, { kind: 'tag.added', subscriberId, tag }, now);
      } catch {
         // The tag exists; a later event or a retry can enrol the subscriber.
      }
   }
}

type RunWithAutomation = AutomationRunRow & {
   automation_name: string;
   automation_status: string;
   trigger_type: string;
   from_name: string;
   from_email: string;
   reply_to: string | null;
   metadata_json: string;
};

async function loadRun(db: D1Database, runId: string): Promise<RunWithAutomation | null> {
   return db
      .prepare(
         `SELECT r.*, a.name AS automation_name, a.status AS automation_status,
                 a.trigger_type, a.from_name, a.from_email, a.reply_to, a.metadata_json
          FROM automation_runs r
          JOIN automations a ON a.id = r.automation_id
          WHERE r.id = ?`,
      )
      .bind(runId)
      .first<RunWithAutomation>();
}

async function finishRun(
   env: Env,
   runId: string,
   status: 'completed' | 'exited' | 'failed',
   reason: string,
   error: string | null = null,
): Promise<void> {
   const now = nowSeconds();
   await env.DB.prepare(
      `UPDATE automation_runs
       SET status = ?, completed_at = ?, next_run_at = NULL, exit_reason = ?, last_error = ?
       WHERE id = ?`,
   )
      .bind(status, now, reason, error, runId)
      .run();
}

async function advanceRun(env: Env, run: RunWithAutomation, nextIndex: number): Promise<void> {
   const graph = parseGraph(run.graph_json);
   if (nextIndex >= graph.length) {
      await finishRun(env, run.id, 'completed', 'completed');
      return;
   }

   await env.DB.prepare(
      `UPDATE automation_runs
       SET status = 'waiting', current_step_index = ?, next_run_at = ?, attempts = 0,
           last_error = NULL
       WHERE id = ?`,
   )
      .bind(nextIndex, nowSeconds() + CONTINUE_DELAY_SECONDS, run.id)
      .run();
}

async function sendStep(env: Env, run: RunWithAutomation, step: AutomationStep): Promise<void> {
   if (step.type !== 'send') return;

   const origin = configuredAppOrigin(env);
   if (origin === null) {
      await finishRun(env, run.id, 'failed', 'app_url_missing', 'APP_URL is not configured');
      return;
   }

   const subscriber = await env.DB.prepare(
      `SELECT id, email, first_name, last_name, status, deleted_at
       FROM subscribers WHERE id = ?`,
   )
      .bind(run.subscriber_id)
      .first<{
         id: string;
         email: string;
         first_name: string | null;
         last_name: string | null;
         status: string;
         deleted_at: number | null;
      }>();

   if (
      subscriber === null ||
      subscriber.status !== 'subscribed' ||
      subscriber.deleted_at !== null
   ) {
      await finishRun(env, run.id, 'exited', 'suppressed');
      return;
   }

   let snapshot = step.irSnapshot ?? null;
   if (snapshot === null) {
      const row = await env.DB.prepare(
         'SELECT ir_json, revision, subject FROM templates WHERE id = ?',
      )
         .bind(step.templateId)
         .first<{ ir_json: string; revision: number; subject: string }>();
      if (row === null) {
         await finishRun(env, run.id, 'failed', 'template_missing', 'Template not found');
         return;
      }
      snapshot = row.ir_json;
   }

   let document;
   try {
      document = parseDocument(JSON.parse(snapshot));
   } catch (error) {
      await finishRun(
         env,
         run.id,
         'failed',
         'invalid_template',
         error instanceof Error ? error.message : 'Invalid template',
      );
      return;
   }

   const tags = await loadSubscriberTags(env.DB, run.subscriber_id);
   const metadata = await loadSubscriberMetadata(env.DB, run.subscriber_id);
   const deliveryId = createId('msg');
   const queuedAt = nowSeconds();
   const subject = step.subject ?? 'Update';

   const outcome = await deliverEmail({
      env,
      adapter: createCloudflareAdapter(env),
      origin,
      messageId: deliveryId,
      document,
      subscriber,
      tags,
      metadata,
      from: { name: run.from_name, email: run.from_email },
      replyTo: run.reply_to,
      subject,
      campaign: { id: run.automation_id, utmCampaign: '', metadata: {} },
      automation: { id: run.automation_id, metadata: parseMetadataJson(run.metadata_json) },
      beforeSend: async () => {
         await env.DB.prepare(
            `INSERT INTO automation_deliveries
              (id, run_id, automation_id, subscriber_id, template_id, template_revision, subject,
               from_name, from_email, status, created_at, step_index, queued_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'sending', ?, ?, ?)`,
         )
            .bind(
               deliveryId,
               run.id,
               run.automation_id,
               run.subscriber_id,
               step.templateId,
               step.templateRevision ?? 1,
               subject,
               run.from_name,
               run.from_email,
               queuedAt,
               run.current_step_index,
               queuedAt,
            )
            .run();
      },
   });

   if (!outcome.ok) {
      if (outcome.stage === 'render') {
         await finishRun(env, run.id, 'failed', 'render_error', outcome.message);
         return;
      }

      await env.DB.prepare(
         `UPDATE automation_deliveries SET status = 'failed', error_code = ? WHERE id = ?`,
      )
         .bind(outcome.code ?? 'send_failed', deliveryId)
         .run();
      await finishRun(env, run.id, 'failed', 'send_failed', outcome.message);
      return;
   }

   const sentAt = nowSeconds();
   await env.DB.prepare(
      `UPDATE automation_deliveries
       SET status = 'sent', sent_at = ?, provider_message_id = ?,
           duration_ms = (? - queued_at) * 1000
       WHERE id = ?`,
   )
      .bind(sentAt, outcome.providerMessageId, sentAt, deliveryId)
      .run();

   await env.DB.prepare('UPDATE automation_runs SET sent_count = sent_count + 1 WHERE id = ?')
      .bind(run.id)
      .run();

   await advanceRun(env, run, run.current_step_index + 1);
}

async function addTag(env: Env, subscriberId: string, tag: string): Promise<void> {
   const now = nowSeconds();
   const tagId = await ensureTag(env.DB, tag, now);
   const attached = await attachTag(env.DB, subscriberId, tagId);

   if (attached) {
      // A tag step is a real tag attachment, so it can start another automation.
      try {
         await enrollAutomations(env, { kind: 'tag.added', subscriberId, tag }, now);
      } catch {
         // The step succeeded; a failed downstream enrolment must not fail it.
      }
   }
}

async function removeTag(env: Env, subscriberId: string, tag: string): Promise<void> {
   await env.DB.prepare(
      `DELETE FROM subscriber_tags
       WHERE subscriber_id = ?
         AND tag_id IN (SELECT id FROM tags WHERE name = ?)`,
   )
      .bind(subscriberId, tag)
      .run();
}

async function setMetadata(
   env: Env,
   subscriberId: string,
   key: string,
   value: string,
): Promise<void> {
   await env.DB.prepare(
      `INSERT INTO subscriber_metadata (subscriber_id, key, value)
       VALUES (?, ?, ?)
       ON CONFLICT(subscriber_id, key) DO UPDATE SET value = excluded.value`,
   )
      .bind(subscriberId, key, value)
      .run();
}

async function processRun(env: Env, run: RunWithAutomation): Promise<void> {
   if (run.automation_status !== 'active') {
      await finishRun(env, run.id, 'exited', 'automation_paused');
      return;
   }

   const graph = parseGraph(run.graph_json);
   const step = graph[run.current_step_index];
   if (step === undefined) {
      await finishRun(env, run.id, 'completed', 'completed');
      return;
   }

   const subscriber = await env.DB.prepare(
      'SELECT status, deleted_at FROM subscribers WHERE id = ?',
   )
      .bind(run.subscriber_id)
      .first<{ status: string; deleted_at: number | null }>();

   if (
      subscriber === null ||
      subscriber.status !== 'subscribed' ||
      subscriber.deleted_at !== null
   ) {
      await finishRun(env, run.id, 'exited', 'suppressed');
      return;
   }

   await env.DB.prepare(
      `UPDATE automation_runs
       SET steps_executed = steps_executed + 1, last_step_at = ?
       WHERE id = ?`,
   )
      .bind(nowSeconds(), run.id)
      .run();

   switch (step.type) {
      case 'wait': {
         await env.DB.prepare(
            `UPDATE automation_runs
             SET status = 'waiting', current_step_index = ?, next_run_at = ?, last_error = NULL
             WHERE id = ?`,
         )
            .bind(
               run.current_step_index + 1,
               nowSeconds() + waitSeconds(step.amount, step.unit),
               run.id,
            )
            .run();
         return;
      }
      case 'send':
         await sendStep(env, run, step);
         return;
      case 'add_tag':
         await addTag(env, run.subscriber_id, step.tag);
         await advanceRun(env, run, run.current_step_index + 1);
         return;
      case 'remove_tag':
         await removeTag(env, run.subscriber_id, step.tag);
         await advanceRun(env, run, run.current_step_index + 1);
         return;
      case 'set_metadata':
         await setMetadata(env, run.subscriber_id, step.key, step.value);
         await advanceRun(env, run, run.current_step_index + 1);
         return;
      case 'exit':
         await finishRun(env, run.id, 'exited', 'exit_step');
         return;
   }
}

export async function runAutomationSweep(env: Env, now = nowSeconds()): Promise<void> {
   const due = await env.DB.prepare(
      `SELECT id FROM automation_runs
       WHERE status = 'waiting' AND next_run_at IS NOT NULL AND next_run_at <= ?
       ORDER BY next_run_at ASC
       LIMIT ?`,
   )
      .bind(now, SWEEP_LIMIT)
      .all<{ id: string }>();

   for (const row of due.results) {
      const claim = await env.DB.prepare(
         `UPDATE automation_runs
          SET status = 'running', attempts = attempts + 1,
              started_at = COALESCE(started_at, ?)
          WHERE id = ? AND status = 'waiting'`,
      )
         .bind(now, row.id)
         .run();

      if ((claim.meta.changes ?? 0) !== 1) continue;

      const run = await loadRun(env.DB, row.id);
      if (run === null) continue;

      try {
         await processRun(env, run);
      } catch (error) {
         await finishRun(
            env,
            run.id,
            'failed',
            'engine_error',
            error instanceof Error ? error.message : String(error),
         );
      }
   }
}
