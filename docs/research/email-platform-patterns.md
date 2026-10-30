# Email platform patterns: Loops and Resend

> **Status (2026-10-30):** the custom metadata/public-subscribe and agent API/MCP work this document marks "in flight" has since merged into `master`. Read `CONTEXT.md`, `docs/PUBLIC-SUBSCRIBE.md` and `docs/AGENT-ACCESS.md` for the shipped contracts. The gap analysis below records the code as it stood when the research ran; the backlog is still the source of truth for what to build next.

Reference products for this repo, read against the actual code on 2026-10-30. All URLs were fetched on that date. This is a decision document, not a feature survey: every row ends in ADOPT, ADAPT, or SKIP for a single-tenant, tag-audience mailer with no automation builder, no A/B testing, and no billing.

## 1. Product model at a glance

| Concern       | Loops                                                                               | Resend                                                             | This repo                                                               |
| ------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| Contact       | One global audience; contact properties; mailing lists                              | One global contact book; segments; topics                          | `subscribers` with fixed `first_name`/`last_name` + free-form tags      |
| Audience      | Filters + saved segments over properties and activity                               | Manual segments (internal only) + topics for preference            | `tag:a -tag:b` query compiled to SQL                                    |
| Campaign      | Draft → scheduled → sending → sent; no campaign pause documented                    | Broadcast: draft → scheduled → queued → sent/canceled; no pause    | draft → scheduled → sending → paused/sent/cancelled                     |
| Content       | Email message attached to campaign; LMX/editor; draft + published for transactional | Broadcast HTML/Markdown; separate Templates with draft + published | Template IR pinned into campaign, `ir_snapshot` frozen at schedule/send |
| Transactional | Separate object with data variables; no unsubscribe, no tracking                    | Separate `/emails` API + Templates; no unsubscribe requirement     | Absent by design (campaigns only)                                       |
| API auth      | Per-team bearer key, no scopes                                                      | Bearer key with permission + optional domain restriction           | Session cookie + CSRF only                                              |
| Webhooks      | One endpoint per account, signed, retried                                           | Many endpoints, signed, retried, replayable                        | None                                                                    |
| MCP           | Hosted `mcp.loops.so`, OAuth (CIMD)                                                 | Hosted `mcp.resend.com`, OAuth or bearer key                       | None                                                                    |

## 2. Contacts, properties, and personalization

### Loops

- Contacts have default properties (`email`, `firstName`, `lastName`, `source`, `subscribed`, `userGroup`, `userId`) and typed custom properties: string, number, boolean, date ([contact properties](https://loops.so/docs/contacts/properties.md)).
- Custom property names are immutable after creation; deleting a property deletes its data. Reserved names are rejected. This is a schema, not an arbitrary JSON bag.
- Content uses `{propertyName}` for contacts, `{EVENT_PROPERTY:name}` for workflow events, and `{DATA_VARIABLE:name}` for transactional sends ([personalizing](https://loops.so/docs/creating-emails/personalizing-emails.md)). Campaign and workflow properties require a fallback value at author time; without one, a missing value blocks the send.
- Filters combine property conditions and activity conditions (sent/opened/clicked a campaign or workflow email) with `all`/`any`, and are evaluated at send time ([filters and segments](https://loops.so/docs/contacts/filters-segments.md)).

### Resend

- Contacts have `email`, `first_name`, `last_name`, `segments`, `topics`, `unsubscribed`, and a `properties` object ([contact properties](https://resend.com/docs/dashboard/contacts/properties.md)).
- A custom property is a declared key + type (string or number) + optional fallback. Values must match the declared type or the write fails. Keys are alphanumeric/underscore, max 50, case-sensitive.
- Broadcast content uses `{{{contact.first_name|fallback}}}`; the same property object is available in API-created HTML ([broadcast editor](https://resend.com/docs/dashboard/broadcasts/editor.md)).
- Segments are manual membership groups, not query definitions. They are internal only and are not a consent mechanism. Unsubscribed or suppressed contacts are skipped even if they are in the segment ([segments](https://resend.com/docs/dashboard/contacts/manage-segments.md)).
- Topics are the recipient-facing preference model: opt-in/opt-out, public/private, and the unsubscribe page can show them ([topics](https://resend.com/docs/dashboard/contacts/manage-topics.md)).

### Implication for this repo

Tags are the only segmentation primitive and fixed columns are the only personalization. That is coherent for the current scope, but it makes "plan = pro" either a tag (boolean only) or impossible. A typed key/value property store is the smallest change that unlocks both content and filters. It is already an in-flight thread; do not duplicate it.

## 3. Campaign / broadcast creation flow

| Step            | Loops                                                                                                          | Resend                                                        | This repo today                                                                |
| --------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Create draft    | `POST /v1/campaigns` creates campaign + empty email message; content set separately via `/email-messages/{id}` | `POST /broadcasts` with `send:false`; content inline          | `POST /api/v1/campaigns` creates a draft with template, sender, audience, UTMs |
| Compose         | Editor / LMX; sending settings (from, reply, subject, preview)                                                 | Dashboard editor or HTML/Markdown in API                      | Template editor only; campaign cannot edit content                             |
| Audience        | Mailing list, saved segment, or inline filter tree                                                             | Segment required before send                                  | Tag query with live count preview                                              |
| Test send       | Preview email message endpoint / editor test                                                                   | `Test email`, multiple addresses, optional test property data | `POST /:id/test` to one address, sample merge context                          |
| Preview         | Editor preview                                                                                                 | Dashboard preview / review checks                             | `GET /:id/preview` renders saved snapshot with sample data                     |
| Schedule        | `scheduling.method: schedule` + timestamp, or `now`                                                            | `scheduled_at` accepts ISO or natural language (`in 1 hour`)  | `POST /:id/schedule` with Unix seconds                                         |
| Send now        | `scheduling.method: now`                                                                                       | `send:true` at create, or `/send`                             | `POST /:id/send-now`                                                           |
| Pause / resume  | No campaign pause documented                                                                                   | No pause; cancel stops remaining deliveries                   | `POST /:id/pause`, resume with send-now                                        |
| Cancel          | Not a first-class campaign action in the API                                                                   | Cancel scheduled → draft; cancel queued → canceled            | `POST /:id/cancel` is terminal                                                 |
| Duplicate       | `••• → Duplicate`                                                                                              | `POST /broadcasts/:id/duplicate`                              | Missing for campaigns; templates have duplicate                                |
| Edit after send | Only name/group                                                                                                | Only name                                                     | Read-only                                                                      |

Sources: Loops [create](https://loops.so/docs/api-reference/create-campaign.md), [update](https://loops.so/docs/api-reference/update-campaign.md), [list](https://loops.so/docs/api-reference/list-campaigns.md), [duplicate](https://loops.so/docs/creating-emails/duplicating-emails.md); Resend [editor](https://resend.com/docs/dashboard/broadcasts/editor.md), [API](https://resend.com/docs/dashboard/broadcasts/send-broadcast-with-api.md), [manage](https://resend.com/docs/dashboard/broadcasts/manage-broadcasts.md), [cancel](https://resend.com/docs/knowledge-base/how-do-i-cancel-a-broadcast.md).

Resend's cancel semantics are the useful detail: canceling a scheduled broadcast returns it to `draft`, so the schedule can be changed without cloning. This repo collapses "unschedule" and "stop sending" into one terminal cancel.

## 4. Templates and revisions

### Loops

- There is no separate reusable "template" object in the campaign API. A campaign owns an email message; duplicating a campaign copies the message.
- Transactional emails are a distinct object with a draft and a published version. Editing creates a draft; the published version keeps sending until republish ([transactional](https://loops.so/docs/transactional.md)).
- Gallery templates are starting points, not versioned documents ([using templates](https://loops.so/docs/creating-emails/using-templates.md)).

### Resend

- Templates are for transactional sends. They start as drafts and must be published. The published version is used by `POST /emails` with `template.id` + variables.
- Version history stores every published version, with author and time, and can revert by creating a new draft. Reverting does not change the published version until publish ([version history](https://resend.com/docs/dashboard/templates/version-history.md)).
- Broadcasts are separate from Templates; a broadcast's content is edited in place and is not a template reference.

### Implication for this repo

The repo's campaign pinning is stronger than both products for marketing: `campaigns.ir_snapshot` is written at schedule/send and the queue renders the snapshot, so a template edit cannot change an in-flight send. The weakness is the template side: `templates.revision` is only a counter. `PATCH /templates/:id` overwrites `ir_json` and bumps the number; there is no row for revision 4, so the UI cannot show or restore it. Campaigns are safe; the library is not.

## 5. Audience and segment UX

- Loops: filter builder over properties/activity, live match mode, save as segment, reuse in campaigns/workflows. Segments update automatically because they are stored filters ([filters and segments](https://loops.so/docs/contacts/filters-segments.md)).
- Resend: segments are named membership lists; the dashboard lists member counts and supports bulk add/remove. No rule builder ([segments](https://resend.com/docs/dashboard/contacts/manage-segments.md)).
- This repo: text query + tag picker, debounced count preview, suppression explained inline. `GET /api/v1/audience/preview` returns `{ count, query }`; the webapp type also declares `sample: Subscriber[]` but the API never returns it ([audience.ts](../../packages/api/src/routes/audience.ts), [types.ts](../../packages/webapp/src/lib/api/types.ts)).

The repo's grammar is deliberately smaller than Loops and that is correct. What is missing is confidence: a count with no sample and no per-tag breakdown makes a typo look plausible. Resend's member list and Loops' live filter both answer "who exactly?".

## 6. API shape, keys, webhooks, idempotency

| Concern     | Loops                                                                                                                                                                                                    | Resend                                                                                                                                                                                                                     |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth        | `Authorization: Bearer <team key>`; named keys; no scopes documented ([API intro](https://loops.so/docs/api-reference/intro.md))                                                                         | Bearer key; permission (`full_access` vs sending) and optional domain restriction; keys listed with last use ([API keys](https://resend.com/docs/dashboard/api-keys/introduction.md))                                      |
| Rate limit  | 10 rps; content API 60/min; `x-ratelimit-*` headers                                                                                                                                                      | 10 rps; 429 on exceed ([API intro](https://resend.com/docs/api-reference/introduction.md))                                                                                                                                 |
| Pagination  | Cursor + `perPage` 10–50, `pagination.nextCursor`                                                                                                                                                        | Cursor-based on list endpoints                                                                                                                                                                                             |
| Idempotency | Not documented for campaigns/contacts                                                                                                                                                                    | `Idempotency-Key` on send/batch send, 24 h; 409 on payload mismatch or concurrent use ([idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys.md))                                                        |
| Webhooks    | One endpoint per account; signed (`Webhook-Id`, `Webhook-Timestamp`, `Webhook-Signature`); 8 attempts over ~28 h; 10/s; disabled after 5 days of failure ([webhooks](https://loops.so/docs/webhooks.md)) | Many endpoints; signed; retries and replay; event catalogue includes sent/delivered/bounced/complained/opened/clicked/suppressed, contacts, domains, topics ([webhooks](https://resend.com/docs/webhooks/introduction.md)) |
| Versioning  | OpenAPI 1.x, additive                                                                                                                                                                                    | No URL version; calendar headers planned                                                                                                                                                                                   |

Neither product offers request-level idempotency on campaign creation. Resend's key insight is narrower and more useful: idempotency belongs on the irreversible operation (send), not every CRUD call. This repo already has stronger internal idempotency than either product (recipient claim with `UPDATE ... WHERE status = 'queued'`), but has no request-level key for safe client retries.

## 7. MCP and OAuth for agents

- Loops hosts `https://mcp.loops.so` as a remote Streamable HTTP MCP server. Clients sign in through OAuth; the docs say clients must support OAuth with Client ID Metadata Documents (CIMD), and cover ChatGPT, Claude, Claude Code, Codex, OpenCode, VS Code ([Loops MCP](https://loops.so/docs/mcp-server.md)).
- Resend hosts `https://mcp.resend.com/mcp`. OAuth login in the browser, or a Resend API key as a bearer header for headless clients. The tool surface mirrors the product: emails, broadcasts, contacts, segments, templates, domains, webhooks, logs, editor ([Resend MCP](https://resend.com/docs/mcp-server.md)).
- Resend's OAuth implementation is a useful concrete reference: OAuth 2.1 + PKCE, public and confidential clients, CIMD preferred over DCR, scopes `emails:send` and `full_access`, loopback redirect rules, refresh rotation, and an explicit note that RFC 8707 `resource` is accepted but ignored ([OAuth client guide](https://resend.com/docs/guides/building-a-resend-oauth-client.md)). Ignoring `resource` is a deliberate simplification, not a pattern to copy for a multi-resource host.

Both products treat the agent surface as a first-class API client, not a separate product. That is the right model for this repo: one API, two auth modes (session for the SPA, scoped token for agents), and MCP as a thin adapter over the same routes.

## 8. Pattern table

| Pattern                                         | Why it exists                                                | Decision                                                                         |
| ----------------------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| Typed contact properties with fallbacks         | Personalization and filters without schema churn per feature | **ADOPT** (in flight: custom key/value metadata)                                 |
| Property/activity filter builder with all/any   | Non-technical audience building                              | **SKIP** for now; tag grammar is the contract                                    |
| Saved segments as stored filters                | Reuse and reduce send-time mistakes                          | **ADAPT**: named saved tag queries, not a rule tree                              |
| Manual segments                                 | Simple internal grouping                                     | **SKIP**: tags already do this                                                   |
| Topics / preference center                      | Recipient control beyond one-click unsubscribe               | **SKIP** until there is more than one publication                                |
| Draft → scheduled → sending → sent lifecycle    | Predictable state machine                                    | **ADOPT**; already present                                                       |
| Unschedule back to draft                        | Change a schedule without cloning                            | **ADOPT**                                                                        |
| Pause / resume mid-send                         | Stop a bad send without losing queued work                   | **ADAPT**: keep repo behavior; neither reference product has it                  |
| Campaign duplicate                              | Repeatable newsletter workflow                               | **ADOPT**                                                                        |
| Test send to several addresses with sample data | Catch rendering and merge mistakes                           | **ADAPT**: multiple recipients + explicit merge values, no inbox preview service |
| Preview the exact send render                   | Preview parity                                               | **ADOPT**; already the core invariant                                            |
| Author-time merge validation with fallbacks     | Prevent silent missing data at send                          | **ADAPT**: validate against known property keys and require `default`            |
| Template draft + published versions             | Edit production content safely                               | **ADOPT** for templates, with immutable revisions                                |
| Version history + restore                       | Recover from a bad edit                                      | **ADAPT**: store revisions; restore as a new draft                               |
| Transactional vs marketing separation           | Consent and deliverability                                   | **SKIP**: repo is marketing-only                                                 |
| API keys with scopes/domain restriction         | Least privilege for integrations                             | **ADAPT**: one scoped token model, no per-domain keys                            |
| `Idempotency-Key` on send                       | Safe retries                                                 | **ADOPT** for send-now and test send                                             |
| Signed outbound webhooks with retries           | Integrate without polling                                    | **ADAPT** later: one endpoint, signed, queue-backed retries                      |
| Hosted MCP + OAuth                              | Agent access without bespoke integrations                    | **ADAPT** (in flight: agent API + MCP)                                           |
| Mandatory pre-send review checks                | Catch broken links/content                                   | **ADAPT**: surface existing `renderEmail` warnings in the send confirmation      |
| Automation builder, A/B tests, billing          | Growth features                                              | **SKIP** by charter                                                              |

## 9. Gap analysis against this repo

Read: `packages/api/src/routes/{campaigns,templates,subscribers,audience,tracking}.ts`, `packages/api/src/jobs/{dispatch,send}.ts`, `packages/api/src/app.ts`, `packages/webapp/src/routes/{campaigns,campaign-detail,templates,template-detail}.tsx`, `packages/webapp/src/components/campaigns/*`, `packages/shared/src/{audience,contracts}`, `packages/email/src/template/index.ts`, `migrations/0001_init.sql`.

**Campaign list is filtered in the browser, not the API.** `GET /api/v1/campaigns` ignores `q` and `status` and returns every row via `ok()`, not `paginated()` ([campaigns.ts](../../packages/api/src/routes/campaigns.ts)). The webapp sends both params and then filters again ([campaigns.tsx](../../packages/webapp/src/routes/campaigns.tsx)). The result is correct only while the table is small; it also means the list endpoint has no cursor.

**Recipient list has no email.** `GET /:id/recipients` selects `campaign_recipients` only, so the webapp falls back to `subscriber_id` as the display email ([campaigns.ts](../../packages/api/src/routes/campaigns.ts), [model.ts](../../packages/webapp/src/components/campaigns/model.ts)). This is a visible defect in the sent-campaign view.

**No duplicate, no unschedule, no draft delete.** Transitions are `draft → scheduled|sending`, `scheduled → sending|cancelled`, `sending → paused|sent`, `paused → sending|cancelled` ([campaigns.ts](../../packages/api/src/routes/campaigns.ts)). A scheduled campaign can only become terminal `cancelled`; there is no `scheduled → draft`. Resend and Loops both support duplicate; Resend returns a canceled schedule to draft.

**Create accepts `scheduledAt` but never schedules.** `campaignInput` includes `scheduledAt`, and `POST /campaigns` writes it with `status = 'draft'` ([contracts](../../packages/shared/src/contracts/index.ts), [campaigns.ts](../../packages/api/src/routes/campaigns.ts)). The cron only selects `status = 'scheduled'`, so the value is inert and misleading. Either remove it from create or make create-and-schedule explicit.

**Preview ignores unsaved edits.** `GET /:id/preview` renders `campaign.ir_snapshot` or the saved template ([campaigns.ts](../../packages/api/src/routes/campaigns.ts)). The detail screen permits preview while the form is dirty, but the request renders the saved snapshot, so the preview can be stale. Resend previews the draft in place.

**Test send is single-recipient and uses fixed sample data.** `POST /:id/test` takes one optional email and `sampleMergeContext()` ([campaigns.ts](../../packages/api/src/routes/campaigns.ts), [sample.ts](../../packages/api/src/lib/sample.ts)). Resend supports multiple addresses and per-property test data. The repo cannot exercise a property fallback or a tag-dependent block.

**Audience preview is count-only.** `GET /api/v1/audience/preview` returns `{ count, query }` ([audience.ts](../../packages/api/src/routes/audience.ts)). The webapp `AudiencePreview` type expects `sample`, but it is never populated. There is no per-term breakdown, so a wrong tag that still matches people looks healthy.

**Subscribers cannot be suppressed through the API.** `subscriberPatch` is `subscriberInput.partial()`: email, first name, last name only ([contracts](../../packages/shared/src/contracts/index.ts)). `bounced` and `complained` exist in the status vocabulary and are honored by the send job, but no route can set them. `email_events` exists in the schema and is never written ([0001_init.sql](../../migrations/0001_init.sql), `grep email_events`). There is no delivery-event intake in this codebase; the event surface Cloudflare Email Service provides would need to be confirmed, so bounce/complaint ingestion is an open integration question, not just a missing route.

**No public subscribe endpoint.** Every `/api/v1/*` route is behind session auth + CSRF ([app.ts](../../packages/api/src/app.ts)). `RATE_LIMITS.publicSubscribe` exists and is only used by magic-link ([contracts](../../packages/shared/src/contracts/index.ts), [auth.ts](../../packages/api/src/routes/auth.ts)). A newsletter form on another site has nothing to call. This blocks the EmDash work and any hosted signup form.

**No API keys, no webhooks, no MCP, no OAuth.** Auth is cookie-only; CORS allows only the Vite dev origins ([app.ts](../../packages/api/src/app.ts), [auth.ts](../../packages/api/src/middleware/auth.ts)). There are no `.well-known` routes, no bearer-token middleware, no `/mcp`, no outbound event delivery. `email_events` is the only trace of an event model.

**Templates have a counter, not history.** `PATCH /templates/:id` overwrites `ir_json` and increments `revision` when `bumpRevision !== false` ([templates.ts](../../packages/api/src/routes/templates.ts)). Autosave updates content without bumping, so the number is a save marker, not a version pointer. Campaigns are protected by `ir_snapshot`; the template library has no restore path.

**Campaign content is coupled to the template editor.** There is no per-campaign content override. Loops and Resend both let a campaign own its message and treat templates as either a starting point or a transactional artifact. This repo's model is simpler and defensible, but it means "duplicate last week's campaign and tweak the intro" requires duplicating the template first.

## 10. Backlog

Ordered by value/effort. Each row is intended to be one PR. S ≈ a day, M ≈ a few days, L ≈ a week or more. "In flight" means another thread owns it; do not start it here.

| #   | Change                                                                                                                                                                 | Why                                                                            | Effort | Status                               |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------ | ------------------------------------ |
| 1   | Server-side campaign list: `q`, `status`, cursor pagination, `paginated()` envelope                                                                                    | Removes a silent scale limit and a double-filter; makes the existing UI honest | S      | —                                    |
| 2   | Join `subscribers` in `/:id/recipients`; return `email` and a stable cursor                                                                                            | Fixes the sent-campaign recipient view                                         | S      | —                                    |
| 3   | `POST /campaigns/:id/duplicate` + list/detail action; copy fields, pin current template revision, reset status/timestamps                                              | The most common newsletter workflow; Loops and Resend both have it             | S      | —                                    |
| 4   | `scheduled → draft` unschedule endpoint + UI; clear `scheduled_at`, keep snapshot                                                                                      | Change a schedule without cloning or cancelling                                | S      | —                                    |
| 5   | Remove `scheduledAt` from `campaignInput` (or implement create-and-schedule); align contract, API, and UI                                                              | Removes an inert, misleading field                                             | S      | —                                    |
| 6   | Preview unsaved campaign: accept a draft patch/document in `GET /:id/preview`; webapp previews current form                                                            | Preview parity for the thing being edited                                      | S/M    | —                                    |
| 7   | Test send to multiple addresses with optional merge context values                                                                                                     | Exercises fallbacks and tag-dependent content                                  | S      | —                                    |
| 8   | Audience preview returns 5 sample subscribers + per-term counts; webapp renders them                                                                                   | Catches wrong-tag mistakes before send                                         | S      | —                                    |
| 9   | `DELETE /campaigns/:id` for drafts only; confirm dialog                                                                                                                | Cleanup without terminal cancel                                                | S      | —                                    |
| 10  | Public subscribe endpoint: `POST /api/public/subscribe`, rate-limited, honeypot/Turnstile-ready, optional tag allowlist, generic response; CORS for configured origins | Prerequisite for EmDash and any hosted form                                    | M      | — (prerequisite for EmDash)          |
| 11  | Subscriber status transitions: `PATCH` supports `status` for `bounced`/`complained`/`unsubscribed` with audit fields; admin action                                     | Makes the existing suppression vocabulary reachable                            | M      | —                                    |
| 12  | Template revision storage: append `template_revisions` on explicit save; keep current `revision` as the pointer                                                        | Enables history without changing campaign pinning                              | M      | —                                    |
| 13  | Revision list/restore UI and endpoint; restore as a new draft revision                                                                                                 | Recovery from a bad template edit                                              | M      | —                                    |
| 14  | `Idempotency-Key` for `send-now`, `test`, and `duplicate`; store key + response hash with TTL                                                                          | Safe client retries; Resend's model                                            | M      | —                                    |
| 15  | API keys: `api_keys` table, hashed secret, scopes (`read`, `write`, `send`), last-used, revoke UI; bearer middleware alongside session                                 | Agent and integration access                                                   | M      | In flight: agent API + MCP           |
| 16  | MCP server over Streamable HTTP + OAuth 2.1 (PRM, AS metadata, PKCE, CIMD/DCR), tools mapped to the existing routes                                                    | ChatGPT/Claude connectors without bespoke integrations                         | L      | In flight: agent API + MCP           |
| 17  | Outbound webhooks: one endpoint setting, signed payloads, queue-backed retry with backoff, event log                                                                   | Integrate without polling; parity with both products                           | M/L    | —                                    |
| 18  | Custom key/value subscriber metadata: table, merge path, CSV columns, API, editor tag list                                                                             | Unlocks real personalization and property filters                              | M      | In flight: custom key/value metadata |
| 19  | EmDash plugin: settings, signup route, draft-from-post action; depends on #10                                                                                          | Distribution into EmDash sites                                                 | M      | In flight: EmDash packaging          |

Deliberately not on the list: automation builder, A/B tests, topics/preference center, multi-tenant billing, a visual segment rule builder, inbox preview services, and a per-campaign content editor. They are either out of charter or only worth it after properties and API keys land.
