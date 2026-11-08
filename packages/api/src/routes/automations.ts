import { Hono } from 'hono';
import { z } from 'zod';
import { createId } from '@postwren/worker-kit/ids';
import { ok } from '@postwren/worker-kit/envelope';
import { ConflictError, NotFoundError, ValidationError } from '@postwren/worker-kit/errors';
import {
   MAX_METADATA_KEYS,
   mergeMetadata,
   metadataPatch,
   parseMetadataJson,
   serialiseMetadata,
} from '@postwren/shared/metadata';
import type { AppEnv } from '../env';
import type {
   AutomationDeliveryRow,
   AutomationRow,
   AutomationRunRow,
} from '../lib/automation-rows';
import {
   AUTOMATION_TRIGGERS,
   parseAutomationSteps,
   parseTriggerConfig,
   readTriggerConfig,
   stepLabel,
} from '../lib/automation';
import type { AutomationStep, AutomationTriggerConfig } from '../lib/automation';
import { assertAudienceQuery } from '../lib/audience';
import { assertSenderAllowed } from '../lib/senders';
import { readJson } from '../lib/validation';
import { nowSeconds } from '../lib/time';

const emailField = z
   .string()
   .trim()
   .email()
   .transform((value) => value.toLowerCase());

const createInput = z
   .object({
      name: z.string().trim().min(1).max(200),
      triggerType: z.enum(AUTOMATION_TRIGGERS).default('subscriber.created'),
      triggerConfig: z.unknown().optional(),
      entryQuery: z.string().trim().max(2000).default(''),
      fromName: z.string().trim().min(1).max(100),
      fromEmail: emailField,
      replyTo: emailField.optional(),
      steps: z.unknown(),
      metadata: metadataPatch.optional(),
   })
   .strict();

const updateInput = z
   .object({
      name: z.string().trim().min(1).max(200).optional(),
      triggerType: z.enum(AUTOMATION_TRIGGERS).optional(),
      triggerConfig: z.unknown().optional(),
      entryQuery: z.string().trim().max(2000).optional(),
      fromName: z.string().trim().min(1).max(100).optional(),
      fromEmail: emailField.optional(),
      replyTo: emailField.nullable().optional(),
      steps: z.unknown().optional(),
      metadata: metadataPatch.optional(),
   })
   .strict();

const enrollInput = z.object({ email: emailField }).strict();

function stepsForResponse(steps: AutomationStep[]): AutomationStep[] {
   return steps.map((step) => {
      if (step.type !== 'send') return step;
      const { irSnapshot: _snapshot, ...rest } = step;
      return rest;
   });
}

function readSteps(row: AutomationRow): AutomationStep[] {
   try {
      return parseAutomationSteps(JSON.parse(row.steps_json));
   } catch {
      return [];
   }
}

function validatedTriggerConfig(triggerType: string, config: unknown): AutomationTriggerConfig {
   const result = parseTriggerConfig(triggerType, config);
   if (result.issues.length > 0) {
      throw new ValidationError(result.issues[0]?.message ?? 'Invalid trigger settings', {
         triggerConfig: result.issues.map((issue) => issue.message),
      });
   }
   return result.config;
}

function present(row: AutomationRow) {
   return {
      id: row.id,
      name: row.name,
      status: row.status,
      triggerType: row.trigger_type,
      triggerConfig: readTriggerConfig(row.trigger_type, row.trigger_config_json),
      entryQuery: row.entry_query,
      fromName: row.from_name,
      fromEmail: row.from_email,
      replyTo: row.reply_to,
      steps: stepsForResponse(readSteps(row)),
      metadata: parseMetadataJson(row.metadata_json),
      version: row.version,
      created_at: row.created_at,
      updated_at: row.updated_at,
      activated_at: row.activated_at,
   };
}

async function findAutomation(db: D1Database, id: string): Promise<AutomationRow | null> {
   return db.prepare('SELECT * FROM automations WHERE id = ?').bind(id).first<AutomationRow>();
}

async function requireAutomation(db: D1Database, id: string): Promise<AutomationRow> {
   const row = await findAutomation(db, id);
   if (row === null) throw new NotFoundError('Automation not found');
   return row;
}

function assertEditable(status: string): void {
   if (status === 'archived') {
      throw new ConflictError('This automation is archived');
   }
}

async function snapshotSteps(db: D1Database, steps: AutomationStep[]): Promise<AutomationStep[]> {
   const snapshotted: AutomationStep[] = [];

   for (const step of steps) {
      if (step.type !== 'send') {
         snapshotted.push(step);
         continue;
      }

      const template = await db
         .prepare('SELECT ir_json, revision, subject FROM templates WHERE id = ?')
         .bind(step.templateId)
         .first<{ ir_json: string; revision: number; subject: string }>();

      if (template === null) {
         throw new ValidationError(`The template for a send step no longer exists`);
      }

      snapshotted.push({
         ...step,
         templateRevision: template.revision,
         irSnapshot: template.ir_json,
         subject: step.subject ?? template.subject,
      });
   }

   return snapshotted;
}

export const automationRoutes = new Hono<AppEnv>();

const AUTOMATION_RUN_STATUSES = ['waiting', 'running', 'completed', 'exited', 'failed'];

automationRoutes.get('/', async (c) => {
   const rows = await c.env.DB.prepare(
      `SELECT a.*,
              (SELECT COUNT(*) FROM automation_runs r
               WHERE r.automation_id = a.id AND r.status IN ('waiting', 'running')) AS active_runs,
              (SELECT COUNT(*) FROM automation_runs r WHERE r.automation_id = a.id) AS total_runs,
              (SELECT COUNT(*) FROM automation_deliveries d
               WHERE d.automation_id = a.id AND d.status = 'sent') AS sent_count
       FROM automations a
       WHERE a.status != 'archived'
       ORDER BY a.updated_at DESC, a.id DESC`,
   ).all<AutomationRow & { active_runs: number; total_runs: number; sent_count: number }>();

   return ok(
      rows.results.map((row) => ({
         ...present(row),
         activeRuns: row.active_runs,
         totalRuns: row.total_runs,
         sentCount: row.sent_count,
      })),
      { requestId: c.get('requestId') },
   );
});

automationRoutes.post('/', async (c) => {
   const body = createInput.parse(await readJson(c));
   assertAudienceQuery(body.entryQuery);
   await assertSenderAllowed(c.env.DB, body.fromEmail, c.env.EMAIL_FROM);
   const steps = parseAutomationSteps(body.steps);
   const triggerConfig = validatedTriggerConfig(body.triggerType, body.triggerConfig);

   const id = createId('atm');
   const now = nowSeconds();

   await c.env.DB.prepare(
      `INSERT INTO automations
        (id, name, status, trigger_type, trigger_config_json, entry_query, from_name, from_email,
         reply_to, steps_json, metadata_json, version, created_at, updated_at)
       VALUES (?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
   )
      .bind(
         id,
         body.name,
         body.triggerType,
         JSON.stringify(triggerConfig),
         body.entryQuery,
         body.fromName,
         body.fromEmail,
         body.replyTo ?? null,
         JSON.stringify(steps),
         serialiseMetadata(mergeMetadata({}, body.metadata ?? {})),
         now,
         now,
      )
      .run();

   return ok(present(await requireAutomation(c.env.DB, id)), {
      status: 201,
      requestId: c.get('requestId'),
   });
});

automationRoutes.get('/:id', async (c) => {
   const row = await requireAutomation(c.env.DB, c.req.param('id'));

   const status = c.req.query('status')?.trim() ?? '';
   const search = c.req.query('q')?.trim() ?? '';
   const limitParam = Number.parseInt(c.req.query('limit') ?? '25', 10);
   const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 100) : 25;

   const where: string[] = ['r.automation_id = ?'];
   const params: (string | number)[] = [row.id];

   if (AUTOMATION_RUN_STATUSES.includes(status)) {
      where.push('r.status = ?');
      params.push(status);
   }
   if (search.length > 0) {
      where.push('s.email LIKE ?');
      params.push(`%${search.toLowerCase()}%`);
   }

   const runs = await c.env.DB.prepare(
      `SELECT r.*, s.email AS email
       FROM automation_runs r
       JOIN subscribers s ON s.id = r.subscriber_id
       WHERE ${where.join(' AND ')}
       ORDER BY r.entered_at DESC, r.id DESC
       LIMIT ?`,
   )
      .bind(...params, limit)
      .all<AutomationRunRow & { email: string }>();

   const runIds = runs.results.map((run) => run.id);
   const deliveries =
      runIds.length === 0
         ? []
         : (
              await c.env.DB.prepare(
                 `SELECT * FROM automation_deliveries
                  WHERE run_id IN (${runIds.map(() => '?').join(', ')})
                  ORDER BY created_at ASC, id ASC`,
              )
                 .bind(...runIds)
                 .all<AutomationDeliveryRow>()
           ).results;

   const deliveriesByRun = new Map<string, AutomationDeliveryRow[]>();
   for (const delivery of deliveries) {
      const list = deliveriesByRun.get(delivery.run_id);
      if (list === undefined) deliveriesByRun.set(delivery.run_id, [delivery]);
      else list.push(delivery);
   }

   return ok(
      {
         ...present(row),
         runs: runs.results.map((run) => {
            let currentStep = 'Finished';
            try {
               const graph = parseAutomationSteps(JSON.parse(run.graph_json));
               currentStep = stepLabel(graph[run.current_step_index]);
            } catch {
               currentStep = 'Unavailable';
            }
            return {
               id: run.id,
               status: run.status,
               subscriberId: run.subscriber_id,
               email: run.email,
               automationVersion: run.automation_version,
               currentStep,
               nextRunAt: run.next_run_at,
               enteredAt: run.entered_at,
               startedAt: run.started_at,
               lastStepAt: run.last_step_at,
               completedAt: run.completed_at,
               durationMs:
                  run.started_at === null
                     ? null
                     : ((run.completed_at ?? run.last_step_at ?? run.started_at) - run.started_at) *
                       1000,
               stepsExecuted: run.steps_executed,
               sentCount: run.sent_count,
               attempts: run.attempts,
               exitReason: run.exit_reason,
               lastError: run.last_error,
               deliveries: (deliveriesByRun.get(run.id) ?? []).map((delivery) => ({
                  id: delivery.id,
                  email: run.email,
                  subject: delivery.subject,
                  status: delivery.status,
                  stepIndex: delivery.step_index,
                  sentAt: delivery.sent_at,
                  openedAt: delivery.opened_at,
                  clickedAt: delivery.clicked_at,
                  queuedAt: delivery.queued_at,
                  durationMs: delivery.duration_ms,
                  errorCode: delivery.error_code,
               })),
            };
         }),
      },
      { requestId: c.get('requestId') },
   );
});

automationRoutes.patch('/:id', async (c) => {
   const id = c.req.param('id');
   const existing = await requireAutomation(c.env.DB, id);
   assertEditable(existing.status);

   const body = updateInput.parse(await readJson(c));
   if (body.entryQuery !== undefined) assertAudienceQuery(body.entryQuery);
   if (body.fromEmail !== undefined) {
      await assertSenderAllowed(c.env.DB, body.fromEmail, c.env.EMAIL_FROM);
   }

   const sets: string[] = [];
   const params: (string | number | null)[] = [];
   const assign = (column: string, value: string | null | undefined): void => {
      if (value !== undefined) {
         sets.push(`${column} = ?`);
         params.push(value);
      }
   };

   assign('name', body.name);
   assign('entry_query', body.entryQuery);
   assign('from_name', body.fromName);
   assign('from_email', body.fromEmail);
   assign('reply_to', body.replyTo);

   if (body.triggerType !== undefined || body.triggerConfig !== undefined) {
      const nextTriggerType = body.triggerType ?? existing.trigger_type;
      const nextConfig =
         body.triggerConfig !== undefined
            ? validatedTriggerConfig(nextTriggerType, body.triggerConfig)
            : body.triggerType !== undefined && body.triggerType !== existing.trigger_type
              ? validatedTriggerConfig(nextTriggerType, undefined)
              : readTriggerConfig(existing.trigger_type, existing.trigger_config_json);

      if (body.triggerType !== undefined) assign('trigger_type', body.triggerType);
      assign('trigger_config_json', JSON.stringify(nextConfig));
   }

   if (body.steps !== undefined) {
      let steps = parseAutomationSteps(body.steps);
      if (existing.status === 'active') {
         steps = await snapshotSteps(c.env.DB, steps);
         sets.push('version = version + 1');
      }
      sets.push('steps_json = ?');
      params.push(JSON.stringify(steps));
   }

   if (body.metadata !== undefined) {
      const merged = mergeMetadata(parseMetadataJson(existing.metadata_json), body.metadata);
      if (Object.keys(merged).length > MAX_METADATA_KEYS) {
         throw new ValidationError(`At most ${MAX_METADATA_KEYS} custom fields are allowed`);
      }
      sets.push('metadata_json = ?');
      params.push(serialiseMetadata(merged));
   }

   if (sets.length > 0) {
      sets.push('updated_at = ?');
      params.push(nowSeconds());
      await c.env.DB.prepare(`UPDATE automations SET ${sets.join(', ')} WHERE id = ?`)
         .bind(...params, id)
         .run();
   }

   return ok(present(await requireAutomation(c.env.DB, id)));
});

automationRoutes.post('/:id/activate', async (c) => {
   const id = c.req.param('id');
   const existing = await requireAutomation(c.env.DB, id);
   if (existing.status === 'archived') throw new ConflictError('This automation is archived');

   const steps = await snapshotSteps(c.env.DB, readSteps(existing));
   const now = nowSeconds();

   await c.env.DB.prepare(
      `UPDATE automations
       SET status = 'active', steps_json = ?, version = version + 1,
           activated_at = COALESCE(activated_at, ?), updated_at = ?
       WHERE id = ?`,
   )
      .bind(JSON.stringify(steps), now, now, id)
      .run();

   return ok(present(await requireAutomation(c.env.DB, id)));
});

automationRoutes.post('/:id/pause', async (c) => {
   const id = c.req.param('id');
   const existing = await requireAutomation(c.env.DB, id);
   if (existing.status !== 'active') {
      throw new ConflictError('Only an active automation can be paused');
   }

   await c.env.DB.prepare(`UPDATE automations SET status = 'paused', updated_at = ? WHERE id = ?`)
      .bind(nowSeconds(), id)
      .run();

   return ok(present(await requireAutomation(c.env.DB, id)));
});

automationRoutes.post('/:id/enroll', async (c) => {
   const id = c.req.param('id');
   const automation = await requireAutomation(c.env.DB, id);
   if (automation.status !== 'active') {
      throw new ConflictError('Activate the automation before enrolling anyone');
   }

   const body = enrollInput.parse(await readJson(c));
   const subscriber = await c.env.DB.prepare(
      `SELECT id FROM subscribers
       WHERE email = ? AND deleted_at IS NULL`,
   )
      .bind(body.email)
      .first<{ id: string }>();

   if (subscriber === null) throw new NotFoundError('Subscriber not found');

   const now = nowSeconds();
   const result = await c.env.DB.prepare(
      `INSERT OR IGNORE INTO automation_runs
        (id, automation_id, automation_version, subscriber_id, status, graph_json,
         current_step_index, next_run_at, entered_at)
       VALUES (?, ?, ?, ?, 'waiting', ?, 0, ?, ?)`,
   )
      .bind(createId('run'), id, automation.version, subscriber.id, automation.steps_json, now, now)
      .run();

   if ((result.meta.changes ?? 0) === 0) {
      throw new ConflictError('That subscriber already has an active run in this automation');
   }

   return ok(
      { enrolled: true, subscriberId: subscriber.id },
      { status: 201, requestId: c.get('requestId') },
   );
});

automationRoutes.delete('/:id', async (c) => {
   const id = c.req.param('id');
   await requireAutomation(c.env.DB, id);

   await c.env.DB.prepare(`UPDATE automations SET status = 'archived', updated_at = ? WHERE id = ?`)
      .bind(nowSeconds(), id)
      .run();

   return ok({ id, archived: true });
});
