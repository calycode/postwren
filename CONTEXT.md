# CONTEXT

Vocabulary and seams for this repo. Read before changing code.

## Domain

| Term               | Meaning                                                                                                                                                                                                                                                                                                                              |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **IR**             | The email document: `{ version, settings, preheader?, children: Block[] }`. Source of truth. Never HTML.                                                                                                                                                                                                                             |
| **Block**          | One of 16 types: `heading`, `text`, `button`, `image`, `divider`, `spacer`, `columns`, `social`, `list`, `quote`, `code`, `link`, `avatar`, `gallery`, `table`, `section`. Every block has a stable, immutable `id`. `columns` and `section` are containers: 2-3 columns, or a section with at most 20 leaf children and no nesting. |
| **Render**         | Pure transformation `IR -> { html, text, bytes, warnings }`. Table-only markup.                                                                                                                                                                                                                                                      |
| **Preview parity** | The browser preview and the sent message are produced by the same `renderEmail` call. Only `resolveLink` differs.                                                                                                                                                                                                                    |
| **Campaign**       | A pinned `template_revision` plus an audience query, sender, schedule, UTMs.                                                                                                                                                                                                                                                         |
| **Recipient**      | One `(campaign, subscriber)` row owning a unique `message_id`.                                                                                                                                                                                                                                                                       |
| **Dispatch**       | Cron-driven, resumable creation of recipient rows and queue jobs.                                                                                                                                                                                                                                                                    |
| **Send**           | Queue-driven, idempotent rendering and delivery for one batch of recipient IDs.                                                                                                                                                                                                                                                      |
| **Audience query** | `tag:a -tag:b` grammar compiled to parameterised SQL.                                                                                                                                                                                                                                                                                |
| **link_id**        | A block `id`, used as the click-analytics key.                                                                                                                                                                                                                                                                                       |
| **Suppression**    | A subscriber who must not be enqueued: unsubscribed, bounced, complained, deleted.                                                                                                                                                                                                                                                   |

## Modules and their seams

Deep modules: small interface, large implementation. Tests cross these seams only.

| Module                    | Interface                                                                      | Owns                                                   |
| ------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------ |
| `@mailer/email/ir`        | `createDocument()`, `parseDocument()`, `migrateDocument()`, `documentIssues()` | Schema, defaults, versioning, migration chain          |
| `@mailer/email/render`    | `renderEmail(doc, opts)`                                                       | HTML, plain text, warnings, byte budget, client quirks |
| `@mailer/email/template`  | `applyMergeTags(doc, ctx)`, `validateTemplate(text)`, `findMergeTags(text)`    | Merge grammar, escaping, filter semantics              |
| `@mailer/shared/audience` | `compileAudience(query)`                                                       | Grammar, parameterisation, SQL generation              |
| `@mailer/shared/tokens`   | `signToken()`, `verifyToken()`                                                 | HMAC, TTL, purpose separation                          |
| `@mailer/shared/csv`      | `parseSubscriberCsv(text)`                                                     | Delimiter/quote handling, per-row errors               |
| `@mailer/api`             | `createApp(env)`, queue handler, scheduled handler                             | Routing, auth, campaigns, adapters                     |
| `@mailer/editor`          | `<EmailEditor value onChange />`                                               | Block list, property panel, preview, keyboard reorder  |

Rules:

- `@mailer/email` imports nothing but `zod`. No React, no DOM, no `hono`, no app code (lint-enforced).
- The editor receives an `onUploadImage` callback from its host; uploads go to R2 and are served from `/media/*`. `@mailer/editor` imports no API code.
- Callers never construct HTML, SQL, or signed tokens themselves.
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
- Campaigns freeze their content: `campaigns.ir_snapshot` is written when a campaign is scheduled or sent, and the queue consumer renders that snapshot, not the live template row.
- A template's `revision` increments only on an explicit save. Autosave updates content and `updated_at` without bumping it; campaigns pin a revision.

## Local development

- Worker on `:8787`, Vite on `:5173` (proxy). Override the Worker port with `--port`; `APP_URL` in `wrangler.dev.jsonc` must match if you rely on generated links.
- There is no `send_email` binding locally. `createCloudflareAdapter` falls back to a log-only sink (`email_dev_sink`) outside production, returning a `dev-*` provider id, so the queue consumer, campaign stats, and resend paths are exercisable without a sending domain.
- `wrangler dev` does not fire cron automatically; trigger it with `curl http://127.0.0.1:<port>/cdn-cgi/local/scheduled`.
- API tests run inside workerd via `@cloudflare/vitest-pool-workers` with real D1 and the migrations applied per run. Pure logic tests belong in `shared`, `worker-kit`, or `email`, which run in Node.
