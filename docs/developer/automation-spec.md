# Automation module spec

Status: first draft implemented. The current build ships a linear automations
engine, all four v1 triggers and the builder. It intentionally covers less than
the full design below.

## What is implemented

- Four triggers: `subscriber.created`, `tag.added`, `campaign.clicked` and
  `api.event`, each with validated trigger config and an optional entry query.
- Tag attachments from the dashboard, bulk tag action, CSV import, public
  subscribe and automation tag steps all feed `tag.added` automations.
- Linear steps: wait, send, add tag, remove tag, set custom field, exit. No
  branches or cycles. Exit must be the last step.
- Automation-level custom fields render in send steps as
  `{{ automation.meta.key }}`; existing `{{ campaign.meta.key }}` tags also
  resolve to them for compatibility.
- Draft, active and paused states. Active automations can be edited; each save
  snapshots send templates and bumps the version, and existing runs keep their
  frozen graph.
- Steps can be reordered by dragging the grip or with the arrow buttons. Insert a
  step from the hover control at a card's bottom edge, or from the button above
  Exit. Exit is locked in last place and every other step is edited in place.
  Steps after an exit are rejected.
- One active run per subscriber per automation, enforced by a partial index.
- Cron sweep, one step per run per minute. Waiting is a database row, not a timer.
- Runs carry a log: queued/started/last-step/finished timestamps, steps executed,
  sent count, attempts and last error. Deliveries are listed inside their run and
  can be filtered by run status and subscriber.
- Trigger-driven enrolment is idempotent: the run id is derived from the
  automation, subscriber and version, so a replayed `subscriber.created` event
  cannot create a second run.
- Automatic exit for unsubscribed, bounced, complained and deleted subscribers.
- Per-automation deliveries with open and click tracking, separate from campaign
  tracking.
- Admin list, builder, run history, delivery history and manual enrollment.
- A manual enrollment API for testing.
- Automation variables are indexed in Settings, and edited in a dialog instead of
  a sidebar form.

## What is not implemented yet

- Branch steps and the audience-query branch semantics.
- Immutable version history. Activation bumps a version and snapshots runs, but
  there is no version browser.
- Shared delivery tracking with campaigns. Automations have their own delivery
  and click tables for now.
- Frequency caps across automations, retry backoff and dead-letter handling.
- MCP tools for automations.

The rest of this file is the target design, kept as the north star for the next
phases.

## Why this is a separate decision

The UI review recommended staying narrow. An automation engine is the one large
feature that would change that position, so it needs its own case.

The case for it: subscribers already carry tags and metadata, campaigns already
freeze content and send idempotently, and the queue already exists. A small
linear automation engine reuses those primitives. The case against it: Resend
and Loops both turn automations into a workflow canvas, and a canvas is a second
product with its own editor, testing, permissions and support burden.

This spec keeps the first version deliberately smaller: **linear sequences with
waits, branches and tag changes**, not a general workflow canvas.

## Goals

1. Send a sequence of emails to a subscriber after a trigger, with waits between
   them.
2. Change the subscriber's tags or metadata as part of the sequence, so the next
   campaign can target the result.
3. Stop immediately when the subscriber unsubscribes, bounces, complains or is
   deleted.
4. Make every step replay-safe, because the queue is at-least-once.
5. Show a readable run history: who entered, where they are, what was sent and
   why a run exited.
6. Reuse templates, senders, audience queries, tracking and suppression rules
   instead of introducing a second content model.

## Non-goals for version 1

- Arbitrary graphs with cycles. The graph is validated as a directed acyclic
  graph and capped at 50 steps.
- Calendar dates, time zones and "send at 9am local". Waits are durations.
- A/B tests, revenue attribution, goal tracking, webhooks, inbound email or
  SMS.
- Per-automation custom HTML. Every email step points at a template revision.
- Multi-tenant or per-team permissions.
- A free-form canvas editor. The first UI is a vertical list of steps, like a
  recipe, with a branch that shows two labelled paths.

## Domain vocabulary

| Term                   | Meaning                                                                                      |
| ---------------------- | -------------------------------------------------------------------------------------------- |
| **Automation**         | A named, versioned sequence with one trigger.                                                |
| **Automation version** | An immutable published graph. Editing a draft creates a new version on publish.              |
| **Trigger**            | The event that enrolls a subscriber.                                                         |
| **Entry query**        | An audience query evaluated at trigger time. A subscriber outside the query is not enrolled. |
| **Enrollment**         | One subscriber in one automation version, represented by a run.                              |
| **Run**                | The state of one enrollment: current step, next due time, status, exit reason.               |
| **Step**               | One node in the graph: send, wait, branch, tag change, metadata change, exit.                |
| **Step attempt**       | One execution attempt of a step, with its own idempotency key.                               |
| **Delivery**           | One email produced by a send step, with its own tracking message id.                         |

## Trigger types

Version 1 supports four triggers, all implemented. Each trigger has a config
object and an optional entry query.

| Type                 | Config                                     | Enrollment rule                                                                         |
| -------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------- |
| `subscriber.created` | none                                       | A new subscriber is created by any path: manual, CSV, public subscribe or API.          |
| `tag.added`          | `{ tag: string }`                          | The tag is attached to a subscriber. Enroll once per subscriber per automation version. |
| `campaign.clicked`   | `{ campaignId?: string, linkId?: string }` | A tracked click arrives. With no filter, any campaign click enrolls.                    |
| `api.event`          | `{ name: string }`                         | A scoped `events:write` key posts a named event for one subscriber.                     |

Deliberately excluded from v1: `campaign.opened` (opens are approximate),
`subscriber.unsubscribed` (a sequence should exit, not start), and date-based
triggers (they need calendar semantics).

Trigger evaluation happens **after** the primary write commits. A subscriber
created by the public endpoint must exist before enrollment, or the run points
at a missing row.

## Graph format

The graph is stored as JSON so a published version is immutable and cheap to
read. It is validated on every write and again when a run loads it, through
`@postwren/shared/automation` so the API and the editor apply the same rules.

```json
{
   "version": 1,
   "start": "wait-1",
   "steps": [
      {
         "id": "wait-1",
         "type": "wait",
         "amount": 1,
         "unit": "days",
         "next": "send-1"
      },
      {
         "id": "send-1",
         "type": "send",
         "templateId": "tpl_...",
         "templateRevision": 4,
         "senderId": "snd_...",
         "next": "branch-1"
      },
      {
         "id": "branch-1",
         "type": "branch",
         "query": "tag:trial",
         "whenTrue": "tag-1",
         "whenFalse": "exit-1"
      },
      {
         "id": "tag-1",
         "type": "add_tag",
         "tag": "trial_started",
         "next": "exit-1"
      },
      {
         "id": "exit-1",
         "type": "exit",
         "reason": "completed"
      }
   ]
}
```

Rules:

- Exactly one `start` step. Every referenced step exists and is reachable.
- Terminal steps are `exit`. A step with no `next` is invalid.
- `branch` is the only node with two outgoing edges, `whenTrue` and `whenFalse`.
- No cycles. The validator returns a readable list of problems, not a thrown
  exception, so the UI can show them inline.
- `send` pins the template revision at publish time, matching campaigns.
- `wait` is `{ amount: 1..365, unit: 'minutes' | 'hours' | 'days' }`.
- `branch` uses the existing audience query grammar. The run's subscriber is
  tested directly, not compiled to a list query. The same rules apply:
  `tag:`, `-tag:`, `meta:key=value`, `-meta:key=value`.

## Data model

New migration, numbered after the current head.

```sql
CREATE TABLE automations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft', -- draft | active | paused | archived
  trigger_type TEXT NOT NULL,
  trigger_config_json TEXT NOT NULL,
  entry_query TEXT NOT NULL DEFAULT '',
  current_version INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  activated_at INTEGER NULL
);

CREATE TABLE automation_versions (
  automation_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  graph_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  published_at INTEGER NOT NULL,
  PRIMARY KEY (automation_id, version),
  FOREIGN KEY (automation_id) REFERENCES automations(id) ON DELETE CASCADE
);

CREATE TABLE automation_runs (
  id TEXT PRIMARY KEY,
  automation_id TEXT NOT NULL,
  automation_version INTEGER NOT NULL,
  subscriber_id TEXT NOT NULL,
  status TEXT NOT NULL, -- waiting | running | completed | exited | failed | cancelled
  current_step_id TEXT NULL,
  next_run_at INTEGER NULL,
  entered_at INTEGER NOT NULL,
  completed_at INTEGER NULL,
  exit_reason TEXT NULL,
  last_error TEXT NULL,
  FOREIGN KEY (automation_id) REFERENCES automations(id) ON DELETE CASCADE,
  FOREIGN KEY (subscriber_id) REFERENCES subscribers(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX idx_automation_runs_active
  ON automation_runs(automation_id, subscriber_id)
  WHERE status IN ('waiting', 'running');

CREATE INDEX idx_automation_runs_due
  ON automation_runs(status, next_run_at);

CREATE TABLE automation_steps (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  step_id TEXT NOT NULL,
  status TEXT NOT NULL, -- pending | running | completed | skipped | failed
  attempts INTEGER NOT NULL DEFAULT 0,
  scheduled_at INTEGER NULL,
  started_at INTEGER NULL,
  completed_at INTEGER NULL,
  error_code TEXT NULL,
  error_message TEXT NULL,
  output_json TEXT NULL,
  FOREIGN KEY (run_id) REFERENCES automation_runs(id) ON DELETE CASCADE
);

CREATE INDEX idx_automation_steps_run ON automation_steps(run_id, scheduled_at);
```

### Delivery tracking

Send steps need opens, clicks, unsubscribe and provider ids. The current
`campaign_recipients` table is campaign-shaped, so v1 reuses it by adding a
nullable `automation_run_id` and making `campaign_id` nullable. That is a
migration on a core table and deserves its own review.

The alternative, a new `deliveries` table shared by campaigns and automations,
is cleaner but a larger change. Recommendation: do the shared `deliveries`
table before any automation code, then migrate campaigns onto it behind the
existing `renderEmail` + queue seams. Automations should not introduce a second
tracking path that drifts from campaign tracking.

Tracking rules stay the same:

- One `message_id` per delivery.
- Open and click timestamps are per delivery.
- Unsubscribe uses the same signed token, scoped to the subscriber.
- `link_clicks` gains `automation_run_id` if tracking is not unified.

## Engine design

The engine is a pure module plus a queue consumer.

### `@postwren/automation`

Small interface, large implementation, testable without D1:

```ts
validateGraph(input: unknown): { graph, issues }
enrollable(trigger, subscriber, now): boolean
nextStep(graph, stepId, subscriber): { step, nextStepId, state }
dueAt(step, now): number
```

It owns:

- Graph validation, reachability and acyclicity.
- Trigger matching against a subscriber and event payload.
- Branch evaluation against one subscriber.
- Wait arithmetic and terminal-state rules.
- The list of side effects a step requests, as values, not as database calls.

It imports `@postwren/shared/audience` for query evaluation, `@postwren/email`
for nothing, and no D1 or Hono code.

### `jobs/automation.ts`

The queue consumer owns persistence and side effects:

1. Claim the next due step with a conditional update:
   `UPDATE automation_steps SET status='running', attempts=attempts+1 WHERE id=? AND status='pending'`.
   If no row changes, another consumer won the claim and this message is done.
2. Execute the step:
   - `wait`: set run `next_run_at` and status `waiting`, queue a delayed job.
   - `send`: re-check suppression, resolve the pinned template snapshot, render,
     claim a delivery row, hand it to the email adapter, write provider id.
   - `branch`: evaluate and continue to one child immediately.
   - `add_tag` / `remove_tag`: write the tag, continue.
   - `set_metadata`: write one metadata key, continue.
   - `exit`: close the run.
3. On success, mark the step completed and point the run at the next step.
4. On failure, record the error. Retry transient failures with backoff up to
   three attempts, then mark the run `failed`.

Queue messages carry `{ kind: 'automation', runId, stepId }`. The consumer is
idempotent because the step claim and the delivery claim are both conditional.

### Scheduling

Cron already runs every minute. Add one sweep:

```sql
SELECT id FROM automation_runs
WHERE status = 'waiting' AND next_run_at <= ?
ORDER BY next_run_at
LIMIT 200
```

For each run, enqueue a start message and advance `next_run_at` to a short
lease, so two cron ticks cannot enqueue the same run twice. If the queue
message is lost, the lease expires and the run is picked up again. This is the
same "claim, then act" pattern the campaign queue already uses.

Long waits are rows, not timers. A 30-day wait costs no queue storage until it
is due.

## Enrollment and triggers

Trigger hooks live next to the existing write paths:

- `upsertSubscriber`: after commit, if the row was created, call
  `enrollAutomations({ kind: 'subscriber.created', subscriberId })`.
- `attachTag`: after commit, call
  `enrollAutomations({ kind: 'tag.added', subscriberId, tag })`.
- Tracking click handler: after `link_clicks` and `clicked_at` are written,
  call `enrollAutomations({ kind: 'campaign.clicked', subscriberId, campaignId, linkId })`.
- Public event endpoint: resolve the subscriber by email, write an event row,
  then enroll.

Enrollment is best-effort and must never fail the primary write. A failed
enrollment is written to a dead-letter table or logged with the subscriber id,
and the cron sweep can retry it. The primary action succeeds even if automation
enrollment does not.

## Exit rules

A run exits when any of these is true. The check runs before every step, not
only at the trigger:

- Subscriber status is `unsubscribed`, `bounced`, `complained` or `deleted`.
- The automation is paused or archived.
- The subscriber no longer matches the entry query, if one is set.
- The run reaches an `exit` step.
- A step fails permanently.
- An operator cancels the run.

Exit reasons are stored as strings: `completed`, `unsubscribed`, `bounced`,
`complained`, `deleted`, `entry_query_failed`, `automation_paused`,
`step_failed`, `cancelled`.

## Frequency and safety limits

Version 1 defaults, all configurable at deploy time:

- At most one active run per subscriber per automation.
- At most 50 steps per graph.
- At most 365 days per wait.
- At most 10 automation emails per subscriber per 24 hours across all
  automations.
- At most 100 new enrollments per automation per minute; excess waits for the
  next cron tick.
- Every send re-checks suppression, unsubscribed token validity and the sender
  allowlist.
- Pausing an automation stops new steps. It does not delete runs; resuming
  continues from the current step.
- A failed send never advances the graph.

## HTTP API

All routes are session-authenticated. Bearer keys use the existing scope rules
plus one new scope.

| Method   | Path                                     | Purpose                                          |
| -------- | ---------------------------------------- | ------------------------------------------------ |
| `GET`    | `/api/v1/automations`                    | List automations with status and run counts.     |
| `POST`   | `/api/v1/automations`                    | Create a draft. Body: name, trigger, entryQuery. |
| `GET`    | `/api/v1/automations/:id`                | Automation, draft graph, current version.        |
| `PATCH`  | `/api/v1/automations/:id`                | Update name, trigger, entryQuery or draft graph. |
| `DELETE` | `/api/v1/automations/:id`                | Archive. Runs are kept.                          |
| `POST`   | `/api/v1/automations/:id/publish`        | Validate and publish a version.                  |
| `POST`   | `/api/v1/automations/:id/activate`       | Start enrolling and running.                     |
| `POST`   | `/api/v1/automations/:id/pause`          | Stop new steps.                                  |
| `GET`    | `/api/v1/automations/:id/runs`           | Cursor page of runs.                             |
| `GET`    | `/api/v1/automations/runs/:runId`        | Run detail with step history.                    |
| `POST`   | `/api/v1/automations/runs/:runId/cancel` | Cancel one run.                                  |
| `POST`   | `/api/v1/automations/:id/test`           | Enroll one subscriber in dry-run mode.           |

Response envelopes follow the existing `{ data, error }` contract. JSON
resource fields stay snake_case at the boundary; request bodies are camelCase.

### Public event ingestion

`POST /api/v1/events` lets scripts post a named event for one subscriber with
the `events:write` scope. It is a write path, so it has:

- `email`, `event`, optional `properties`, optional `idempotencyKey`.
- Rate limits per credential and per email.
- Idempotency by `(credential, idempotencyKey)` through `automation_events`.
- A 202 response regardless of whether the subscriber exists, matching the
  public subscribe endpoint's anti-enumeration rule.

## MCP tools

Two read tools and two write tools, scoped to the same permissions as the HTTP
API:

- `list_automations`
- `get_automation`
- `create_automation_draft`
- `activate_automation` / `pause_automation`

No tool sends an email directly. Activation is the only action that starts
enrollment, and it is explicit.

## UI

New route `/automations`, grouped under "Email" in the sidebar.

### List

- Status chips: draft, active, paused, archived.
- Trigger summary in plain language: "When a subscriber is created", "When
  `trial` is added", "When a campaign link is clicked".
- Counts: active runs, completed last 7 days, exited last 7 days.
- Primary action: New automation.

### Builder

A vertical recipe, not a canvas:

```
Trigger: subscriber.created
  Entry filter: (optional audience query)
Step 1  Wait 1 day
Step 2  Send "Welcome" (v4)
Step 3  Branch: tag:trial
          Yes -> Add tag trial_started -> Exit
          No  -> Exit
```

- Each step is a card with drag, move up/down, and delete. Exit is not a normal
  step: it is locked last and cannot be removed.
- "Add step" is a command menu: Send email, Wait, Branch, Add tag, Remove tag,
  Set field. Insert controls live at the bottom edge of a card (on hover) and in
  one fixed slot above Exit.
- Publish validates and freezes the graph. Draft edits never affect running
  runs.
- A "Test run" action picks a subscriber and shows what would happen without
  writing deliveries or tags.

### Run detail

`GET /api/v1/automations/:id` accepts `status` and `q` and returns runs newest
first, each with its own deliveries nested under `deliveries`. The builder shows
one Runs table: expand a row to see queued/started/finished timings, steps run,
attempts and the emails that run produced.

- Subscriber header with status and entry time.
- Vertical timeline of steps: completed, waiting until a timestamp, skipped,
  failed.
- Each send shows subject, template revision, delivery status, opens and
  clicks.
- Exit reason in plain language.
- Cancel run.

### Empty and error states

- No automations: explain the three useful sequences (welcome, trial follow-up,
  win-back) and offer a starter, but do not auto-create anything.
- No runs: show the trigger and a "Test with a subscriber" action.
- Paused automation: banner on the builder and list, with a resume action.
- Validation errors: inline list on publish.

## Tests

Test at the seams, per `CONTEXT.md`:

1. Graph validator: missing start, cycles, unreachable steps, bad references,
   wait bounds, branch arity.
2. Trigger matching: each trigger type, entry query pass/fail, duplicate
   enrollment.
3. Step planner: wait arithmetic, branch selection, terminal exit, suppressed
   subscriber.
4. Queue consumer: replay the same message twice, assert one delivery and one
   tag write.
5. Cron sweep: due runs claimed once across two concurrent sweeps.
6. Failure: transient error retries, permanent error fails the run, provider
   error never advances the graph.
7. API: publish validation, activation, pause, run listing, cancellation.
8. UI document operations if the builder gets a client-side graph editor.

## Rollout

**Phase 0: shared delivery tracking.** Unify campaign and automation sends in
one delivery table, or add nullable automation columns to the existing tracking
tables. No UI. Ship with migration tests.

**Phase 1: linear automations.** `subscriber.created` trigger, wait, send,
exit. List, builder, run history, activate/pause. This is the smallest useful
product and the one to validate first.

**Phase 2: subscriber changes.** Add/remove tag, set metadata, branch on the
audience grammar, `tag.added` trigger. This is where automations start feeding
campaign targeting.

**Phase 3: engagement triggers.** `campaign.clicked`, public events API, MCP
write tools, frequency caps.

**Phase 4: polish.** Starter automations, duplicate, version history, dry-run
comparison, per-automation analytics.

Phase 1 and 2 are the useful core. Phase 3 is where the maintenance cost grows
because there are more entry points and more ways to enroll someone twice.

## What this costs

- One new queue and DLQ, or careful reuse of the campaign queue.
- One new scheduler sweep on cron.
- A tracking migration that touches the most sensitive part of the product.
- A new builder UI with its own validation and test-run states.
- More support surface: waits that never fire, duplicate enrollments, paused
  runs, and "why did this person get this email".

This is why the feature is a spec, not a yes. If it ships, it should ship after
the UI rework and the shared delivery table, not before.
