# Architecture

Postwren is one Worker with three entrypoints: `fetch`, `queue` and `scheduled`.
Everything else is a package or a D1 migration.

## Entrypoints

| Entrypoint  | Owns                                                                  |
| ----------- | --------------------------------------------------------------------- |
| `fetch`     | OAuth provider, admin SPA assets, HTTP API, public pages, tracking    |
| `queue`     | Campaign dispatch batches and Cloudflare Email Sending events         |
| `scheduled` | Cron sweep: dispatch, automation steps, webhook retries, token purges |

`packages/api/src/index.ts` wraps the Hono app in
`@cloudflare/workers-oauth-provider`. The provider owns `/mcp`, OAuth discovery,
authorization, token exchange and dynamic client registration; every other
request goes to `createApp(env)`.

## Packages

| Package                | Responsibility                                                          |
| ---------------------- | ----------------------------------------------------------------------- |
| `@postwren/email`      | IR schema, migration chain, table-only renderer, merge tags             |
| `@postwren/shared`     | Audience grammar, metadata, payload limits, tokens, CSV, webhook format |
| `@postwren/worker-kit` | Response envelope, errors, ids, request context, HTTP helpers           |
| `@postwren/api`        | Hono routes, middleware, jobs, adapters, tracking, MCP server           |
| `@postwren/editor`     | Block list, property panel, canvas, keyboard reorder                    |
| `@postwren/ui`         | Vendored shadcn primitives and theme tokens                             |
| `@postwren/webapp`     | Preact SPA: routes, API clients, editor host                            |
| `@postwren/emdash`     | Native EmDash plugin that proxies signups and renders settings          |

The dependency direction is deliberate: `email` and `shared` know nothing about
Hono or Preact; `api` composes them; `webapp` talks to `api` only through HTTP.

## Request lifecycle

1. The OAuth provider resolves the origin and either handles `/mcp` and OAuth
   routes, or forwards to the Hono app.
2. `requestContext` assigns a request id and client IP.
3. `framePolicy` sets `Content-Security-Policy: frame-ancestors` from the embed
   allowlist. `run_worker_first` exists so every HTML response passes through
   this middleware.
4. Public routes (`/api/public/subscribe`, `/confirm/:token`, `/p/:id`,
   `/t/*`, `/u/:token`, `/media/*`) are handled without a session.
5. `/api/auth/*` handles magic links, six-digit codes and sessions. Cookie
   mutations require `x-csrf-token`.
6. `/api/v1/*` requires a session or a scoped `pwr_` bearer. Bearer access is
   mapped to one scope per path; session users are unrestricted.
7. A not-found request that is not under `/api` falls back to the `ASSETS`
   binding, which serves the SPA shell.

## Campaign lifecycle

```text
template revision ──► campaign (schedule/send-now)
                         │  freeze IR, metadata, data
                         ▼
                      dispatch (cron, resumable)
                         │  create campaign_recipients with message ids
                         ▼
                      queue batch ──► send job
                         │  claim queued recipient (conditional UPDATE)
                         │  render frozen snapshot per recipient
                         │  rewrite links, add tracking and unsubscribe
                         ▼
                      Cloudflare Email Sending
                         │
                         ├─► link_clicks / open pixel
                         └─► email_events (bounced, complained, delivered)
```

Two invariants hold the design together:

- **Freeze on schedule.** `ir_snapshot`, `metadata_snapshot` and `data_snapshot`
  are written once. Live templates and campaign rows are not read during send.
- **Idempotent delivery.** A recipient is claimed with
  `UPDATE ... WHERE status = 'queued'`. Replaying a queue batch sends nothing.

## Automation lifecycle

An automation is a trigger plus up to 30 linear steps. Trigger events write an
`automation_events` row and enqueue runs with a deterministic id derived from
automation, subscriber and version, so a replay cannot double-enrol. Each run
stores a frozen graph, the current step index and the next due time. The cron
sweep executes due steps; waits are data, not sleeping Workers.

Sends inside an automation use the same delivery module as campaigns but write
`automation_deliveries`, not campaign recipients.

## Storage

| Store  | Holds                                                                                                                 |
| ------ | --------------------------------------------------------------------------------------------------------------------- |
| D1     | Subscribers, tags, templates, versions, campaigns, recipients, runs, events, keys, sessions, webhooks, media metadata |
| R2     | Uploaded media under `media/`                                                                                         |
| Queues | Campaign batches, Email Sending events, dead-letter queues                                                            |
| KV     | OAuth grants, codes and tokens (`OAUTH_KV`)                                                                           |

Core tables: `subscribers`, `subscriber_tags`, `subscriber_metadata`, `tags`,
`templates`, `template_versions`, `template_comments`, `campaigns`,
`campaign_recipients`, `automations`, `automation_runs`, `automation_deliveries`,
`automation_events`, `email_events`, `webhook_endpoints`, `webhook_deliveries`,
`subscribe_keys`, `api_keys`, `sender_addresses`, `embed_origins`,
`media_assets`, `sessions`, `magic_links`, `rate_limits`.

All persisted timestamps are Unix seconds. Subscriber metadata is one row per
key so audience filters stay indexed and parameterised; campaign metadata is a
flat JSON map because campaigns are read whole.

## Auth model

- **Owner session.** Magic link or six-digit code, exchanged for a session
  cookie. There is one owner address (`OWNER_EMAIL`) and no user management.
- **API keys.** `pwr_` bearer keys, hashed at rest, with explicit scopes.
- **Subscribe keys.** Publishable `pk_live_` credentials for the public
  subscribe endpoint, with per-key origins.
- **OAuth.** The provider issues tokens for MCP clients; grants live in KV.
- **Service tokens.** Short-lived, signed credentials let MCP tools call the
  REST surface without duplicating SQL, so one scope gate applies to both.

## Email rendering

`@postwren/email` is an IR plus a pure renderer. The IR is the source of truth;
HTML is never edited. The renderer emits only `table`/`tr`/`td` with inline
styles and MSO conditional comments, because Outlook on Windows renders with
Word's engine. There is no `div`, no flex, and no `max-width` outside the root
table. It also produces plain text and a byte budget warning at 102,400 bytes.

The same function renders the editor preview and the queued send. Preview and
send differ only in link resolution.

## Wire format

- Request bodies are camelCase.
- Resource representations are snake_case and mirror D1 columns.
- Every response is `{ data, error }`, plus `meta` when paginated.
- Cursors are opaque.
- Validation errors return a stable code and field details; the SPA maps them
  to form fields at its API boundary.

## Testing

Pure packages run in Node. API tests run in `workerd` through
`@cloudflare/vitest-pool-workers` against real D1 with migrations applied per
run. Playwright drives a fresh local Worker for the primary journeys. See
[End-to-end tests](e2e.md) and the seam list in the
[developer guide](README.md#test-at-the-seams).
