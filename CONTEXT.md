# CONTEXT

Vocabulary and seams for this repo. Read before changing code.

## Domain

| Term                 | Meaning                                                                                                                                                                                                                                                                                                                                          |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **IR**               | The email document: `{ version, settings, preheader?, children: Block[] }`. Source of truth. Never HTML.                                                                                                                                                                                                                                         |
| **Block**            | One of 17 types: `heading`, `text`, `markdown`, `button`, `image`, `divider`, `spacer`, `columns`, `social`, `list`, `quote`, `code`, `link`, `avatar`, `gallery`, `table`, `section`. Every block has a stable, immutable `id`. `columns` and `section` are containers: 2-3 columns, or a section with at most 20 leaf children and no nesting. |
| **Render**           | Pure transformation `IR -> { html, text, bytes, warnings }`. Table-only markup.                                                                                                                                                                                                                                                                  |
| **Preview parity**   | The browser preview and the sent message are produced by the same `renderEmail` call. Only `resolveLink` differs.                                                                                                                                                                                                                                |
| **Campaign**         | A pinned `template_revision` plus an audience query, sender, schedule, UTMs.                                                                                                                                                                                                                                                                     |
| **Recipient**        | One `(campaign, subscriber)` row owning a unique `message_id`.                                                                                                                                                                                                                                                                                   |
| **Dispatch**         | Cron-driven, resumable creation of recipient rows and queue jobs.                                                                                                                                                                                                                                                                                |
| **Send**             | Queue-driven, idempotent rendering and delivery for one batch of recipient IDs.                                                                                                                                                                                                                                                                  |
| **Audience query**   | `tag:a -tag:b` plus `meta:key=value` / `-meta:key=value` grammar compiled to parameterised SQL.                                                                                                                                                                                                                                                  |
| **Metadata**         | Custom key/value pairs. Subscribers store one row per key in `subscriber_metadata`; campaigns store a flat string map in `campaigns.metadata_json`. Keys match `^[a-z][a-z0-9_]{0,63}$`. Keys `id`, `email`, `first_name`, `last_name`, `status` and `tags` are reserved.                                                                        |
| **Subscribe key**    | A publishable `pk_live_…` credential for the public subscribe endpoint. Only a SHA-256 hash and a display prefix are stored; the secret is shown once.                                                                                                                                                                                           |
| **Public ingestion** | `POST /api/public/subscribe`, authenticated by a subscribe key rather than a session. Browser origins are restricted per key.                                                                                                                                                                                                                    |
| **OAuth provider**   | `@cloudflare/workers-oauth-provider` owns MCP authorization: discovery, DCR/CIMD, PKCE, codes and token rotation. Grants and hashed tokens live in the `OAUTH_KV` namespace; `pwr_` API keys stay in D1.                                                                                                                                         |
| **link_id**          | A block `id`, used as the click-analytics key.                                                                                                                                                                                                                                                                                                   |
| **Suppression**      | A subscriber who must not be enqueued: unsubscribed, bounced, complained, deleted.                                                                                                                                                                                                                                                               |

## Modules and their seams

Deep modules: small interface, large implementation. Tests cross these seams only.

| Module                      | Interface                                                                      | Owns                                                   |
| --------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------ |
| `@postwren/email/ir`        | `createDocument()`, `parseDocument()`, `migrateDocument()`, `documentIssues()` | Schema, defaults, versioning, migration chain          |
| `@postwren/email/render`    | `renderEmail(doc, opts)`                                                       | HTML, plain text, warnings, byte budget, client quirks |
| `@postwren/email/template`  | `applyMergeTags(doc, ctx)`, `validateTemplate(text)`, `findMergeTags(text)`    | Merge grammar, escaping, filter semantics              |
| `@postwren/shared/audience` | `compileAudience(query)`                                                       | Grammar, parameterisation, SQL generation              |
| `@postwren/shared/metadata` | `metadataKeyError()`, `metadataRecord`, `mergeMetadata()`                      | Key grammar, reserved keys, JSON map helpers           |
| `@postwren/shared/tokens`   | `signToken()`, `verifyToken()`                                                 | HMAC, TTL, purpose separation                          |
| `@postwren/shared/csv`      | `parseSubscriberCsv(text)`                                                     | Delimiter/quote handling, per-row errors               |
| `@postwren/api`             | `createApp(env)`, queue handler, scheduled handler                             | Routing, auth, campaigns, adapters                     |
| `@postwren/editor`          | `<EmailEditor value onChange />`                                               | Block list, property panel, preview, keyboard reorder  |

Rules:

- `@postwren/email` imports nothing but `zod`. No React, no DOM, no `hono`, no app code (lint-enforced).
- The editor receives an `onUploadImage` callback from its host; uploads go to R2 and are served from `/media/*`. `@postwren/editor` imports no API code.
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

`POST /api/public/subscribe` is the only unauthenticated write path. It accepts a publishable subscribe key as `Authorization: Bearer pk_live_…` or `X-Subscribe-Key: pk_live_…`. The key's `allowed_origins` list controls browser CORS and is enforced on the request, not just advertised in the preflight. A non-empty `website` field is a honeypot and returns a successful no-op.

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

## Local development

- Worker on `:8787`, Vite on `:5173` (proxy). Override the Worker port with `--port`; `APP_URL` in `wrangler.dev.jsonc` must match if you rely on generated links.
- There is no `send_email` binding locally. `createCloudflareAdapter` falls back to a log-only sink (`email_dev_sink`) outside production, returning a `dev-*` provider id, so the queue consumer, campaign stats, and resend paths are exercisable without a sending domain.
- `wrangler dev` does not fire cron automatically; trigger it with `curl http://127.0.0.1:<port>/cdn-cgi/local/scheduled`.
- `OAUTH_KV` is a local namespace under `wrangler dev`; a manual production deploy needs a real KV namespace id in `wrangler.jsonc`, while Appflare and the Deploy button create the namespace themselves (see `docs/APPFLARE.md`).
- API tests run inside workerd via `@cloudflare/vitest-pool-workers` with real D1 and the migrations applied per run. Pure logic tests belong in `shared`, `worker-kit`, or `email`, which run in Node.
