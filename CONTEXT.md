# CONTEXT

Vocabulary and seams for this repo. Read before changing code.

## Domain

| Term                    | Meaning                                                                                                                                                                                                                                                                                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **IR**                  | The email document: `{ version, settings, preheader?, children: Block[] }`. Source of truth. Never HTML.                                                                                                                                                                                                                                         |
| **Block**               | One of 17 types: `heading`, `text`, `markdown`, `button`, `image`, `divider`, `spacer`, `columns`, `social`, `list`, `quote`, `code`, `link`, `avatar`, `gallery`, `table`, `section`. Every block has a stable, immutable `id`. `columns` and `section` are containers: 2-3 columns, or a section with at most 20 leaf children and no nesting. |
| **Render**              | Pure transformation `IR -> { html, text, bytes, warnings }`. Table-only markup.                                                                                                                                                                                                                                                                  |
| **Preview parity**      | The browser preview and the sent message are produced by the same `renderEmail` call. Only `resolveLink` differs.                                                                                                                                                                                                                                |
| **Campaign**            | A pinned `template_revision` plus an audience query, sender, schedule, UTMs.                                                                                                                                                                                                                                                                     |
| **Recipient**           | One `(campaign, subscriber)` row owning a unique `message_id`.                                                                                                                                                                                                                                                                                   |
| **Automation**          | An ordered, linear sequence of steps with one trigger. Steps are wait, send, add tag, remove tag, set custom field or exit. Triggers are `subscriber.created`, `tag.added`, `campaign.clicked` or `api.event`; the trigger config is validated by `@postwren/shared/automation`.                                                                 |
| **Automation run**      | One subscriber in one automation version, with a frozen graph, current step index and next due time. Trigger-driven runs have a deterministic id (hash of automation, subscriber and version) so a replayed event cannot enrol them twice; manual enrolments get a random id.                                                                    |
| **Automation delivery** | One email produced by an automation send step, with its own message id, step index and queue/send timings. It is shown inside its run, not as a separate history.                                                                                                                                                                                |
| **Automation event**    | A named event posted to `POST /api/v1/events` with `events:write`, stored in `automation_events`. An `(credential, idempotencyKey)` pair enrols at most once.                                                                                                                                                                                    |
| **Run log**             | `automation_runs` records when a run was queued, first started, last ran and finished, plus steps executed and emails sent. Duration is derived, not stored.                                                                                                                                                                                     |
| **Template version**    | Every revision bump writes an immutable `template_versions` row (name, subject, IR, preview HTML). Restoring a version creates a new revision rather than rewriting history.                                                                                                                                                                     |
| **Block note**          | A per-template comment attached to a block `id`, stored in `template_comments`. `open` notes show on the block outline and in the property panel; `done` notes stay as history. Notes survive template saves because block ids are stable.                                                                                                       |     |
| **Tag rename**          | `tag:name` references in `campaigns.audience_query` and `automations.entry_query`, plus tag steps in `automations.steps_json`, are rewritten on rename so saved audiences keep working. Tag usage counts are computed from those references.                                                                                                     |
| **Dispatch**            | Cron-driven, resumable creation of recipient rows and queue jobs.                                                                                                                                                                                                                                                                                |
| **Send**                | Queue-driven, idempotent rendering and delivery for one batch of recipient IDs.                                                                                                                                                                                                                                                                  |
| **Transactional email** | One message to one recipient sent through `POST /api/v1/emails` with `emails:write`. No campaign or recipient rows; suppressed recipients are refused.                                                                                                                                                                                           |
| **Audience query**      | `tag:a -tag:b` plus `meta:key=value` / `-meta:key=value` grammar compiled to parameterised SQL.                                                                                                                                                                                                                                                  |
| **Metadata**            | Custom key/value pairs. Subscribers store one row per key in `subscriber_metadata`; campaigns store a flat string map in `campaigns.metadata_json`. Keys match `^[a-z][a-z0-9_]{0,63}$`. Keys `id`, `email`, `first_name`, `last_name`, `status` and `tags` are reserved.                                                                        |
| **Subscribe key**       | A publishable `pk_live_…` credential for the public subscribe endpoint. Only a SHA-256 hash and a display prefix are stored; the secret is shown once.                                                                                                                                                                                           |
| **Public ingestion**    | `POST /api/public/subscribe`, authenticated by a subscribe key rather than a session. Browser origins are restricted per key.                                                                                                                                                                                                                    |
| **Sign-in code**        | A six-digit, single-use code in the sign-in email. Only its HMAC is stored in `magic_links.code_hash`; the code and the magic-link token consume the same row.                                                                                                                                                                                   |
| **Embed origin**        | An exact origin allowed to frame the admin SPA. Stored in `embed_origins`, enforced as `Content-Security-Policy: frame-ancestors`. Same-origin is always allowed; the default is no external origin.                                                                                                                                             |
| **OAuth provider**      | `@cloudflare/workers-oauth-provider` owns MCP authorization: discovery, DCR/CIMD, PKCE, codes and token rotation. Grants and hashed tokens live in the `OAUTH_KV` namespace; `pwr_` API keys stay in D1.                                                                                                                                         |
| **link_id**             | A block `id`, used as the click-analytics key.                                                                                                                                                                                                                                                                                                   |
| **Suppression**         | The single application-level gate: `subscribers.status` (`pending`, `subscribed`, `unsubscribed`, `bounced`, `complained`, `deleted`) plus `deleted_at`. Campaign audiences and automations only select `subscribed`; the transactional endpoint refuses the rest. Cloudflare separately keeps its own sending-domain suppression list.          |
| **Public web version**  | `GET /p/:id` renders a `sent` campaign's frozen IR. A signed `?t=` token from `{{ links.web }}` binds it to one recipient's merge tags and unsubscribe link; without it the page is the anonymous, shareable version. No tracking pixel. Drafts and in-flight campaigns return 404.                                                              |
| **Double opt-in**       | A subscribe key option (`require_confirmation`). New rows are `pending`, receive a signed `confirm` token, and become `subscribed` only on `POST /confirm/:token`; GET shows the button so mail scanners cannot confirm.                                                                                                                         |
| **Email hygiene**       | A static disposable-domain and typo list, plus a production-only DoH MX/A check that fails open. Runs before the public subscribe write.                                                                                                                                                                                                         |
| **Webhook endpoint**    | An HTTPS receiver with a signing secret and a set of event names, stored in `webhook_endpoints`. The secret is readable because it signs deliveries.                                                                                                                                                                                             |
| **Webhook delivery**    | One signed POST attempt for an event, stored in `webhook_deliveries` before the call. The cron sweep retries with backoff and keeps the response status and error.                                                                                                                                                                               |
| **Email Sending event** | A Cloudflare Email Sending lifecycle event consumed from the `postwren-email-events` queue. `message.complained` and a hard `message.bounced` suppress the subscriber; soft bounces are recorded only.                                                                                                                                           |
| **Event id**            | Cloudflare's `payload.eventId`, unique in `email_events`, making a redelivered event a no-op for subscriber and webhook side effects.                                                                                                                                                                                                            |
| **Turnstile key**       | A non-empty `subscribe_keys.turnstile_site_key` requires `turnstileToken` on public subscribe; `TURNSTILE_SECRET` is a Worker secret and a missing secret fails closed.                                                                                                                                                                          |

## Modules and their seams

Deep modules: small interface, large implementation. Tests cross these seams only.

| Module                           | Interface                                                                      | Owns                                                   |
| -------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------ |
| `@postwren/email/ir`             | `createDocument()`, `parseDocument()`, `migrateDocument()`, `documentIssues()` | Schema, defaults, versioning, migration chain          |
| `@postwren/email/render`         | `renderEmail(doc, opts)`                                                       | HTML, plain text, warnings, byte budget, client quirks |
| `@postwren/email/template`       | `applyMergeTags(doc, ctx)`, `validateTemplate(text)`, `findMergeTags(text)`    | Merge grammar, escaping, filter semantics              |
| `@postwren/shared/audience`      | `compileAudience(query)`                                                       | Grammar, parameterisation, SQL generation              |
| `@postwren/shared/metadata`      | `metadataKeyError()`, `metadataRecord`, `mergeMetadata()`                      | Key grammar, reserved keys, JSON map helpers           |
| `@postwren/shared/automation`    | `parseAutomationSteps(value)`, step types, limits                              | Step grammar, issue codes, validation rules            |
| `@postwren/shared/tokens`        | `signToken()`, `verifyToken()`                                                 | HMAC, TTL, purpose separation                          |
| `@postwren/shared/webhooks`      | `webhookSignature()`, `WEBHOOK_EVENTS`                                         | Signed body format, event vocabulary, hex HMAC         |
| `@postwren/shared/csv`           | `parseSubscriberCsv(text)`                                                     | Delimiter/quote handling, per-row errors               |
| `@postwren/api`                  | `createApp(env)`, queue handler, scheduled handler                             | Routing, auth, campaigns, adapters                     |
| `packages/api/jobs/email-events` | `processEmailEvent()`, `handleEmailEventQueue()`                               | Event dedupe, bounce/complaint policy, run exit        |
| `@postwren/editor`               | `<EmailEditor value onChange />`                                               | Block list, property panel, preview, keyboard reorder  |

Rules:

- `@postwren/email` imports nothing but `zod`. No React, no DOM, no `hono`, no app code (lint-enforced).
- The editor receives `onUploadImage` and `onPickImage` callbacks from its host; uploads go to R2's `media/` prefix, metadata lives in `media_assets`, and images are served from `/media/*`. `@postwren/editor` imports no API code.
- Callers never construct HTML, SQL, or signed tokens themselves.
- Campaign and automation sends both go through the single `deliverEmail` module in the API; each job owns only its persistence and retry policy.
- Errors are values where the caller must branch (`RenderWarning`, CSV row errors); exceptions for genuine faults.

## Test seams

Test at these, not at internals:

1. `renderEmail` output for each block type and for composed documents (golden + invariants).
2. IR parse/migrate round-trips from fixture JSON.
3. `applyMergeTags` on a document with known context.
4. `compileAudience` returns `{ sql, params }` for a query.
5. HTTP: status + body envelope through `createApp` / `SELF.fetch`.
6. Campaign lifecycle through the queue handler: replay a batch, assert one send.
7. Editor: document in -> callbacks out. No DOM assertions on internals.
8. Automation sweep: replay a due run, assert one step and one delivery per tick.
9. Double opt-in: subscribe through a confirming key, assert `pending`, post the token, assert `subscribed` and one enrolment.
10.   Webhook delivery: emit an event, run the sweep with a stub fetch, assert the signature and the retry schedule.
11.   Email Sending event: replay a complaint, assert one status change and one webhook row.

## Conventions

- TypeScript, ESM, strict. No `any` in public signatures.
- Zod 3 syntax (`z.object`, `z.string().email()`).
- Unix seconds for persisted timestamps.
- Hex colours only inside email content.
- No comments that restate the code. Explain _why_ only when it is not obvious.
- Tests read like sentences and assert observable behaviour.

## Wire format

- JSON **request bodies are camelCase** (`firstName`, `templateId`, `irJson`, `scheduledAt`).
- JSON **resource representations are snake_case**, mirroring the D1 columns (`first_name`, `audience_count`, `template_revision`). The webapp normalises at its API client boundary; do not add a second mapping layer.
- Every response is `{ data, error }`, plus `meta` when paginated. Failures are `{ data: null, error: { code, message, details? } }`.
- Cursor pagination is opaque; clients never construct a cursor.
- Campaigns freeze their content: `campaigns.ir_snapshot` and `campaigns.metadata_snapshot` are written when a campaign is scheduled or sent, and the queue consumer renders that snapshot and its metadata, not the live template or campaign row.
- A template's `revision` increments only on an explicit save. Autosave updates content and `updated_at` without bumping it; campaigns pin a revision.

## Custom metadata

Subscribers and campaigns both carry dynamic key/value metadata, but they are stored differently on purpose.

- **Subscribers are audience rows.** Their metadata lives in `subscriber_metadata`, one row per `(subscriber_id, key)`, with an index on `(key, value)`. Audience queries must filter on individual keys (`meta:plan=pro`), and a normalised table keeps those filters parameterised, indexed and free of JSON parsing inside SQL. `subscriber_metadata` cascades with the subscriber.
- **Campaigns are content.** Their metadata is a flat string map in `campaigns.metadata_json`. Campaigns are read as a whole row when rendering, never filtered by metadata key, so a JSON map avoids a join and matches the existing frozen-campaign model. When a campaign is pinned, `metadata_snapshot` copies `metadata_json` next to `ir_snapshot`; the queue consumer and preview read the snapshot, so editing metadata after scheduling cannot change an in-flight send.

Shared rules live in `@postwren/shared/metadata`:

- Keys match `^[a-z][a-z0-9_]{0,63}$`.
- At most 50 keys per subscriber, value at most 1024 characters.
- Reserved keys that duplicate real subscriber columns are rejected: `id`, `email`, `first_name`, `last_name`, `status`, `tags`.
- A missing key renders as an empty string.

Content uses `{{ subscriber.meta.<key> }}` and `{{ campaign.meta.<key> }}`. All existing filters (`default`, `upper`, `lower`, `trim`, `date`) apply. In hrefs, a merged value must still resolve to an absolute `https://` URL at send time.

## Public subscription

`POST /api/public/subscribe` is the only unauthenticated write path. It accepts a publishable subscribe key as `Authorization: Bearer pk_live_…` or `X-Subscribe-Key: pk_live_…`. The key's `allowed_origins` list controls browser CORS and is enforced on the request, not just advertised in the preflight. A non-empty `website` field is a honeypot and returns a successful no-op. A non-empty `turnstile_site_key` requires `turnstileToken` in the body and a matching `TURNSTILE_SECRET`; verification fails closed. The static hygiene check runs on every key; the DoH MX/A lookup runs only when `ENVIRONMENT=production` and fails open. `require_confirmation` is per key: `pending` rows never enter an audience query and are enrolled in automations only after `POST /confirm/:token`.

The body is camelCase:

```json
{
   "email": "ada@example.com",
   "firstName": "Ada",
   "lastName": "Lovelace",
   "tags": ["newsletter"],
   "metadata": { "signup_source": "emdash" },
   "source": "emdash-form",
   "sourceUrl": "https://example.com/newsletter",
   "website": ""
}
```

The endpoint is idempotent: an existing email gains tags and metadata, keeps its status (an unsubscribed or bounced subscriber is never revived), and records `source` / `source_url`. `subscribe_keys.default_tags` are added to every signup. Requests are rate limited with `RATE_LIMITS.publicSubscribe` against `rate_limits`. Every accepted request returns `202 { "data": { "subscribed": true } }` regardless of whether the address was new, so the public endpoint cannot be used to test list membership.

Keys are managed under `/api/v1/subscribe-keys` with a normal session. `POST` returns the secret once; `GET` lists prefix, origins and default tags; `DELETE` revokes.

## Iframe embedding

The admin SPA is framable only by its own origin plus the exact origins in `embed_origins`. The
`frame-policy` middleware sets `Content-Security-Policy: frame-ancestors` on every HTML response,
which is why `run_worker_first` routes every request through the Worker. An origin is scheme +
host + optional port, HTTPS only outside loopback development; paths, wildcards and credentials are
rejected. `X-Frame-Options: SAMEORIGIN` is only a fallback while the list is empty; it is removed
once an allowlist exists because it cannot express one. The session cookie stays `SameSite=Lax`, so
a cross-site embed may load but stay signed out. Sign-in inside the frame uses the emailed 6-digit
code; the magic link remains the top-level path.

## Local development

- Worker on `:8787`, Vite on `:5173` (proxy). Override the Worker port with `--port`; `APP_URL` in `wrangler.dev.jsonc` must match if you rely on generated links.
- There is no `send_email` binding locally. `createCloudflareAdapter` falls back to a log-only sink (`email_dev_sink`) outside production, returning a `dev-*` provider id, so the queue consumer, campaign stats, and resend paths are exercisable without a sending domain.
- `wrangler dev` does not fire cron automatically; trigger it with `curl http://127.0.0.1:<port>/cdn-cgi/local/scheduled`.
- Email Sending events come from Cloudflare, so they do not appear in local Queues. Exercise ingestion through `processEmailEvent` in tests, not by waiting for a real complaint.
- `OAUTH_KV` is a local namespace under `wrangler dev`; a manual production deploy needs a real KV namespace id in `wrangler.jsonc`, while Appflare and the Deploy button create the namespace themselves (see `docs/APPFLARE.md`).
- API tests run inside workerd via `@cloudflare/vitest-pool-workers` with real D1 and the migrations applied per run. Pure logic tests belong in `shared`, `worker-kit`, or `email`, which run in Node.
