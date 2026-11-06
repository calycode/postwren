# EmDash plugin packaging

Decision document for making this repo installable inside an EmDash site. Phase 1 is shipped:
`packages/emdash-plugin` (`@postwren/emdash`) forwards newsletter signups to the standalone Worker.
Phase 2 — absorbing the Worker — remains a port, not a repackage.

Evidence base: EmDash 1.3.1 as bundled in `alfatours-emdash` and, for phase 1, the published
`emdash@1.3.1` types installed in `packages/emdash-plugin` (`node_modules/emdash/dist`). Every claim
about EmDash below was read from that source, not from prose docs, unless marked _documented_.
Section 8 lists what is verified where.

## 1. Verdict

**Phase 1 — shipped.** A native plugin is a trusted site dependency: a descriptor factory plus a
module exporting `createPlugin(options)`. It registers a public signup route, two private status
routes, a settings form and an opt-in page-fragment form. The Worker stays standalone and owns
everything durable — subscribers, keys, rate limits, CORS, sending. See §5.

**Phase 2 — possible, but it is a port, not a repackage.** Three EmDash properties decide the
architecture:

1. Plugin data is JSON documents in the host's `_plugin_storage` table with expression indexes.
   There are no joins, no per-collection SQL, no multi-row transactions.
2. A plugin cannot ship or run migrations, cannot declare Worker bindings, and cannot declare a
   Cron Trigger or a Queue consumer. All four belong to the site's `wrangler.jsonc` and
   `src/worker.ts`.
3. Public HTML, CSS, JS, SVG and XML cannot be served from a plugin route. Pages are site Astro
   routes; plugin routes return JSON or inert bytes.

So phase 2 keeps our relational schema (renamed `postwren_*`) inside the site's D1 and talks to it
through the raw `DB` binding, keeps the Hono app but makes its response envelope injectable, and
keeps the Preact SPA but mounts it from a React admin page with hash routing.

**Recommended, if the goal is "any EmDash site, one install":** stay in phase 1 and publish the
standalone Worker as the product. Phase 2 duplicates the recipient table, the dispatch loop and the
sending path inside every customer's D1 — see R1–R4.

## 2. Plugin surface: what a native plugin can register

A native plugin is declared in `astro.config.mjs` as a `PluginDescriptor` and is instantiated by
generated code that does `import { createPlugin } from "<entrypoint>"; createPlugin(options)`.
The descriptor's `entrypoint` module must export `createPlugin`; `format: "native"` selects this
path (`virtual-modules-CU29aip9.mjs`, `generatePluginsModule`).

```ts
// astro.config.mjs (site side)
import { postwrenPlugin } from "@postwren/emdash";
emdash({ database: d1({ binding: "DB" }), plugins: [postwrenPlugin({ ... })] });
```

| Surface           | Descriptor / definition field                                                  | Runtime handle                                                                 | Verified detail                                                                                                                             |
| ----------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Admin API routes  | `routes: Record<string, PluginRoute>` (in `definePlugin`)                      | `RouteContext` with merged `PluginContext`                                     | Mounted at `/_emdash/api/plugins/<pluginId>/<routeName>`; route names may contain `/` (`"events/create"`)                                   |
| Admin pages       | descriptor `adminEntry` + `adminPages[]`; definition `admin: { entry, pages }` | `pages` record exported from the admin module                                  | URL `/_emdash/admin/plugins/<pluginId><path>`; component receives **no props**                                                              |
| Dashboard widgets | `adminWidgets[]` / `admin: { widgets }`                                        | `widgets` record                                                               | sizes `full`, `half`, `third`                                                                                                               |
| Field widgets     | `fieldWidgets[]`                                                               | `fields` record (native) or Block Kit elements                                 | selected by schema `widget: "pluginId:name"`                                                                                                |
| Settings          | `settingsSchema: Record<string, SettingField>`                                 | `ctx.settings.get/set/list/delete/getVersioned/compareAndSet/compareAndDelete` | types `string, number, boolean, select, secret, url, email`; `secret` is AES-GCM encrypted with `EMDASH_ENCRYPTION_KEY`                     |
| Storage           | `storage: Record<collection, { indexes, uniqueIndexes }>`                      | `ctx.storage.<collection>`                                                     | rows in `_plugin_storage` (JSON `data`), indexes on `json_extract(data, '$.field')`, query returns ≤100/page                                |
| KV                | none (always available)                                                        | `ctx.kv`                                                                       | same DB-backed options store; `getVersioned` / `compareAndSet` / `compareAndDelete`                                                         |
| Hooks             | `hooks`                                                                        | `(event, ctx)`                                                                 | lifecycle, content, media, comment, byline, `cron`, `email:{beforeSend,deliver,afterSend}`, `page:metadata`, `page:fragments`               |
| Content           | —                                                                              | `ctx.content`, `ctx.schema`                                                    | capability-gated, read/write/publish with opaque `_rev`                                                                                     |
| Media             | —                                                                              | `ctx.media`                                                                    | `get`, `list`, `readBytes` (≤16 MiB), `upload`, `delete`, `updateMetadata`; `MediaItem.url` is the public `/_emdash/api/media/file/...` URL |
| Block types       | `portableTextBlocks[]` (declarative Block Kit)                                 | `ctx` via admin route                                                          | slash-menu entry; native render components come from `componentsEntry` exporting `blockComponents`                                          |
| Public pages      | —                                                                              | —                                                                              | **not a plugin surface.** Use `page:fragments` (native only) to inject markup into existing pages, or ship site Astro routes                |
| MCP tools         | `mcp.tools` referencing a private JSON route                                   | —                                                                              | not useful for us                                                                                                                           |

Restrictions that shape the design:

- `format: "native"` plugins may only appear in `plugins: []`. They cannot live in `sandboxed: []`
  and cannot be installed from the registry (source: integration config validation, throws).
- `definePlugin({...})` cannot be passed inline to `astro.config.mjs`; the config requires a
  descriptor with a resolvable `entrypoint` (it throws with exactly that message).
- `format: "standard"` rejects `adminEntry` and `componentsEntry`.
- Route handlers take **one** argument (`RouteContext extends PluginContext`). The authored docs and
  `api-routes.md` show `(routeCtx, ctx)`; the type and the working `trip-plugin` code use one.
  Use one.
- `routeCtx.request` is a real `Request` for native plugins (`SandboxedRequest` only exists across
  the sandbox boundary).

## 3. Worker-level resources: exact split

| Resource                 | Owned by                                                       | Mechanism                                                                                                                                                                                                           |
| ------------------------ | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1 database + our tables | **Site** (binding), plugin (schema, by deploy step)            | `env.DB` from `import { env } from "cloudflare:workers"`, exactly as `@emdash-cms/cloudflare`'s `cloudflareEmail` reaches `env.EMAIL`. EmDash's own migration runner has no plugin extension point.                 |
| Queues producer          | **Site** (`queues.producers` + binding name)                   | `env.POSTWREN_QUEUE.sendBatch(...)`. There is no `ctx.queue`.                                                                                                                                                       |
| Queues consumer          | **Site** (`src/worker.ts` `queue` export + `queues.consumers`) | The package exports the handler; the site spreads it in (5 lines). Inside, do the work directly against `env.DB`, or `withEmDashRuntime(runtime => runtime.handlePluginApiRoute(...))` when plugin state is needed. |
| Cron Trigger             | **Site** (`triggers.crons` + `createScheduledHandler()`)       | The plugin declares the _task_: `ctx.cron.schedule("dispatch", { schedule: "* * * * *" })` in `plugin:activate`, handled by the `cron` hook. The site's cron must tick at least as often as the fastest task.       |
| `send_email`             | **Site** (`send_email: [{ name }]`)                            | Native plugin reads the binding from `cloudflare:workers` env. `ctx.email.send()` also exists (`email:send` capability) but see R5.                                                                                 |
| R2                       | **Site**                                                       | Prefer `ctx.media` / the host storage adapter. Do not add a second bucket.                                                                                                                                          |
| KV                       | n/a                                                            | `ctx.kv` only.                                                                                                                                                                                                      |

Consequence: **a plugin cannot make its own storage exist.** Install is always
`pnpm add` + `astro.config.mjs` + `wrangler.jsonc` + deploy. There is no one-click path for phase 2.

### Migration strategy for plugin-owned tables

EmDash's migration tooling is closed to plugins. `emdash migrate` resolves the project's
`emdash/migrations` (core identity/fingerprint) and a database-adapter executor; the plugin manifest
schema has no `migrations` field. So:

1. **Namespace by prefix.** Every table `postwren_*`, every index `idx_postwren_*`. Never touch EmDash's
   `_emdash_*` or `_plugin_*` tables.
2. **Numbered, additive, idempotent files** in the package: `sql/0001_init.sql`, `0002_...sql`.
   `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS` everywhere, so a re-run is a no-op and
   a partially applied file is safe. Never edit an applied file; add a new number.
3. **Version sentinel.** `postwren_schema_version(version INTEGER PRIMARY KEY, applied_at INTEGER)`.
   The package exports `POSTWREN_SCHEMA_VERSION = 2` (a number, bumped with each file). `plugin:activate`
   reads the sentinel and throws a readable error if it is missing or newer than the code. Fail closed:
   a half-migrated schema must not accept writes.
4. **Applied by the site**, either
   `pnpm exec wrangler d1 migrations apply DB --remote` with the files copied/generated into the
   site's `migrations_dir`, or
   `pnpm exec wrangler d1 execute DB --remote --file node_modules/@postwren/emdash/sql/0001_init.sql`.
   Document both; make `0001` a single self-contained file so the second command works.
5. **Runtime bootstrap is the fallback, not the default.** `plugin:activate` may run
   `env.DB.exec(sqlFileText)` guarded by the sentinel plus a `ctx.kv.compareAndSet("schema:lock", …)`
   lease. It works and keeps the install to one deploy, but it puts DDL in a 5 s hook and makes the
   audit trail worse. Offer it behind an option (`autoMigrate: true`) and default it off.
6. **Dialect guard.** All our SQL is SQLite (`json_extract`, `AUTOINCREMENT`, `UPDATE … WHERE status`).
   EmDash can run on Postgres over Hyperdrive. Require a real D1 binding; on `plugin:activate`, probe
   `SELECT sqlite_version()` and refuse to run on anything else.

### Storage: why not `ctx.storage`

`ctx.storage` is a JSON document store with declared expression indexes. Mapping our schema onto it
costs:

- `compileAudience()` emits joins over `subscribers`/`subscriber_tags`/`tags`. `_plugin_storage.query`
  has one `where` over indexed fields, no joins, 100 rows/page. The audience compiler's whole seam
  (`{ sql, params }`) would have to be replaced with an in-plugin filter, which breaks the documented
  test seam and the pagination model.
- `campaign_recipients` claim (`UPDATE … SET status='sending' WHERE status='queued'`) maps to
  `updateIf(id, { where: { status: "queued" }, set: { status: "sending" }, delta: { attempts: { inc: 1 } } })`
  — this one part does map, and cleanly.
- Bulk insert of 10k recipient documents is 10k `put` calls through the bridge, not one `batch`.

Decision: keep the relational schema, reach it through `env.DB`, and use `ctx.storage` only for
small side tables if at all. Rate limiting moves to a `postwren_rate_limits` table (atomic
`UPDATE … SET count = count + 1`), not `ctx.kv`, because CAS counters lose under concurrency.

## 4. Admin API route constraints

Path: `/_emdash/api/plugins/<pluginId>/<routeName>`, all methods handled by one Astro catch-all
(`src/astro/routes/api/plugins/[pluginId]/[...path].ts`) then `dispatchPluginApiRequest`.

**Auth, in order** (middleware first, then dispatch):

1. Non-`GET/HEAD/OPTIONS` under `/_emdash/api/plugins/` always passes `checkPublicCsrf`: either
   `X-EmDash-Request: 1` or an `Origin` that equals the request origin or `config.siteUrl`. No
   `Origin` header at all is allowed (non-browser clients).
2. Private route (the default): session **or** API token with `admin` scope, plus the declared
   `permission` (default `plugins:manage` = ADMIN). For cookie auth, `X-EmDash-Request: 1` is
   required on every method, including `GET`. Identity arrives as
   `routeCtx.user: { id, email, name, role, createdAt }`.
3. `public: true` skips 2 entirely. It is internet-facing; validate everything yourself.

Permissions available (`@emdash-cms/auth`): `plugins:read` (EDITOR=40), `plugins:manage` (ADMIN=50),
`content:read/write/publish_*`, `media:*`, `settings:*`. There is no way to add a custom permission.

**Methods.** Declare `methods: [...]` and the host returns `405` + `Allow` before the handler runs.
Undeclared routes accept any method.

**Request bodies.** `request: { body, maxBytes, headers }`. Modes `none | json | text | bytes |
form-data`. Default cap 1 MiB, maximum 8 MiB; multipart limits are 100 parts / 1 MiB per part /
255-byte safe filename. Unbounded parsing is legacy behaviour and not what we want.

**Responses.** Two shapes only:

- JSON: the returned value is wrapped by the host as `{ "success": true, "data": <value> }`. Errors
  come back as `{ "success": false, "error": { code, message, details? } }` from `PluginRouteError`
  or a throw.
- Raw: `response: "raw"` and the handler must return `pluginResponse({ status, headers, body })`
  with a text or `Uint8Array` body (8 MiB cap). Header allowlist:
  `Accept-Ranges, Content-Disposition, Content-Encoding, Content-Language, Content-Range,
Content-Type, ETag, Last-Modified, Location, Retry-After`. The host adds
  `X-Content-Type-Options: nosniff` and `Content-Security-Policy: sandbox; default-src 'none'`.
  Public raw routes may not redirect off-origin.

**Content types.** HTML, CSS, JS, SVG, XML, XHTML, WASM, `multipart/related`, `multipart/x-mixed-replace`
are rejected for raw routes — so:

- newsletter open pixel (`image/png`) is fine;
- the media passthrough (`image/*`) is fine;
- the SPA bundle, the unsubscribe page and the click redirect are **not** fine (see R6, R7);
- `cacheControl` is honoured only on public `GET`/`HEAD`; everything else is `private, no-store`.

### Mounting the existing Preact SPA

The admin page is a React component, imported statically from `adminEntry` into
`virtual:emdash/admin-registry`, rendered at `/_emdash/admin/plugins/postwren/<path>` with **no props**,
inside the EmDash admin's TanStack router (`basepath: "/_emdash/admin"`).

Plan:

1. `src/admin.tsx` — a React component with a `ref`div; `useEffect` calls
   `mount(hostAdapter)(node)` from the Preact package and unmounts on cleanup. Preact renders into
   its own subtree. No React/Preact component interop, no `preact/compat` aliasing in the site build.
2. **Hash routing.** `usePluginPage` resolves the page component by exact path (plus trailing slash);
   anything deeper than the declared page path does not resolve and falls through to the Block Kit
   renderer. `preact-iso`'s history-based router would desync the host router on refresh. Use hash
   routes (`#/campaigns/123`) inside one declared page, or accept "one page per top-level section,
   detail views are internal state" (what `trip-plugin` does).
3. **Transport adapter.** Replace the current `x-csrf-token` double-submit cookie with
   `X-EmDash-Request: 1`; keep the JSON body conventions; unwrap `{ success, data }` instead of
   `{ data, error }`. `apiFetch` from `emdash/plugin-utils` already sets the header.
4. **Identity.** `useCurrentUser()` from `@emdash-cms/admin` gives the admin user; `signOut` and the
   magic-link screen disappear.
5. **Styling.** Import the plugin's CSS from the admin entry and verify it lands in the site build
   (unverified, R9). Fallback: scope styles under a class and inject a `<style>` element from the
   component.

## 5. Packaging plan for this repo

### Package boundaries

```
packages/
  email/          unchanged; not yet publishable (see §7)
  shared/         unchanged
  editor/         unchanged
  ui/             unchanged
  worker-kit/     unchanged
  api/            unchanged in phase 1; phase 2 makes responses transport-injectable
  webapp/         unchanged in phase 1; phase 2 injects base path, auth, transport
  emdash-plugin/  @postwren/emdash — phase 1 ships index/plugin/signup/form + tests
```

`packages/emdash-plugin` is the only new package and it depends on nothing inside the monorepo: the
signup proxy touches no Worker code, so a site can install it without `@postwren/api` or `@postwren/email`.
Phase 2 changes that, and then the admin entry (`webapp` + `editor`) and the plugin entry
(`api` + `shared` + `email`) must stay in separate export conditions:

```jsonc
// packages/emdash-plugin/package.json — phase 1 in bold, phase 2 additions in comments
{
   "name": "@postwren/emdash",
   "private": true,
   "type": "module",
   "exports": {
      ".": "./src/index.ts", // postwrenPlugin(): PluginDescriptor   (astro.config)
      "./plugin": "./src/plugin.ts", // createPlugin(): ResolvedPlugin     (runtime)
      "./signup": "./src/signup.ts", // pure forward logic, testable without EmDash
      // "./admin": "./src/admin.tsx",          phase 2: pages/widgets    (browser)
      // "./components": "./src/components.ts", phase 2: blockComponents  (Astro SSR)
      // "./pages": "./src/pages/index.ts",     phase 2: click/unsubscribe bodies
      // "./worker": "./src/worker.ts",         phase 2: queue handler for src/worker.ts
      // "./sql/*": "./sql/*"                   phase 2: postwren_* migrations
   },
}
```

### Phase 1 — implemented

`packages/emdash-plugin` (`@postwren/emdash`) is a native plugin that forwards signups to the
standalone Worker. It registers no admin page and exports no React: EmDash renders the settings form
from `settingsSchema`, and two private routes answer status calls. That is a deliberate choice — an
admin entry would mean shipping the Preact SPA and its transport/identity adapter for a page that
would only show one status line.

```
packages/emdash-plugin/
  package.json          @postwren/emdash, private, emdash ^1.3.1 peer + 1.3.1 dev
  src/index.ts          postwrenPlugin(): PluginDescriptor, settings schema, settings reads
  src/plugin.ts         createPlugin(options): routes + page:fragments hook
  src/signup.ts         pure forward logic (validation, tag merge, error mapping)
  src/form.ts           accessible inline form + script for page:fragments
  test/*.test.ts        forward contract, error mapping, descriptor, form
```

```ts
// astro.config.mjs (site side)
import { postwrenPlugin } from '@postwren/emdash';
emdash({ plugins: [postwrenPlugin({ workerUrl: 'https://postwren.example.com' })] });
```

| Route                                          | Access                       | Behaviour                                                                                                                                               |
| ---------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/_emdash/api/plugins/postwren/signup`         | public, `POST`, JSON ≤ 8 KiB | validates the email, drops honeypot hits, forwards to `POST {workerUrl}/api/public/subscribe` with `Authorization: Bearer <pk_live_ key from settings>` |
| `/_emdash/api/plugins/postwren/overview`       | `plugins:read`, `GET`        | `{ workerUrl, configured, defaultTags }`, never the key                                                                                                 |
| `/_emdash/api/plugins/postwren/testConnection` | `plugins:manage`, `POST`     | calls `{workerUrl}/api/health`, returns `{ ok, status, message? }`                                                                                      |

Settings (all read through `ctx.settings`, with the descriptor defaults applied in code because
EmDash does not materialise them): `workerUrl` (url), `siteKey` (secret), `defaultTags`
(comma-separated), `signupFormEnabled` (boolean, default false), `signupFormHeading` (default
"Newsletter"). `page:fragments` injects the form only when enabled, with
`errorPolicy: "continue"` so a form can never take a public page down, and requires the template to
render `<EmDashBodyEnd />`.

Upstream mapping: `429 → RATE_LIMITED/429`, `401|403 → WORKER_NOT_CONFIGURED/502`,
`422 → INVALID_EMAIL/422`, everything else (including network and timeout) `→ SUBSCRIBE_FAILED/502`.
No error message contains the key or the upstream body. `created` is never read.

Constraints accepted for phase 1:

- `allowedHosts` is fixed at build time from `workerUrl`, so changing the Worker host means editing
  `astro.config.mjs` and redeploying. A mismatched settings URL fails closed as
  `WORKER_NOT_CONFIGURED` rather than reaching an arbitrary host.
- `settingsSchema` has no `required` flag, so "required" is enforced at runtime, not in the form.
- The Worker rate-limits per client IP. A server-to-server call from the site's Worker may present a
  single egress IP for every visitor, so a busy site can hit the 10/minute budget. The plugin maps
  that to a friendly 429; raising it is a Worker-side change.

Repo changes that phase 1 needed, all already merged on `master`:

| Change                             | Where                                                          | Note                                                                                                                                                                                             |
| ---------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Public subscribe endpoint          | `packages/api/src/routes/public.ts`                            | `POST /api/public/subscribe`, `Authorization: Bearer pk_live_…` or `X-Subscribe-Key`, per-key CORS allowlist, honeypot, rate limit, idempotent upsert. Documented in `docs/PUBLIC-SUBSCRIBE.md`. |
| Key storage                        | `migrations/0004_custom_metadata.sql`, `0005_agent_access.sql` | The subscribe-key table landed in `0005`. `0004` is taken by custom metadata — do not reuse that number.                                                                                         |
| Publish `@postwren/email` properly | `packages/email/package.json`                                  | Still open: subpath exports point at `./src/*.ts` while `files` is `["dist"]`, so consumers get TypeScript sources or nothing. Not needed by phase 1.                                            |
| No auth changes                    | —                                                              | The standalone Worker keeps its magic-link session; the plugin uses EmDash's identity for its private routes.                                                                                    |

Left out of phase 1: any admin UI, shared storage, EmDash email usage, subscriber import, and
click/unsubscribe handling (those URLs stay on the Worker).

### Phase 2 — full plugin

```
packages/emdash-plugin/
  src/index.ts          postwrenPlugin(): PluginDescriptor
  src/plugin.ts         createPlugin(options): ResolvedPlugin  (routes + hooks)
  src/routes/*.ts       our route handlers, delegating to @postwren/api
  src/worker.ts         export const queue: ExportedHandlerQueueHandler  (site spreads this in)
  src/pages/index.ts    createClickHandler / createUnsubscribeHandler for site Astro routes
  src/db.ts             PostwrenDb = minimal D1 surface; createPostwrenDb(env)
  src/settings.ts       typed reads over ctx.settings with defaults
  src/admin.tsx         React wrapper mounting the Preact SPA (hash routing)
  src/components.ts     blockComponents: newsletter signup block
  sql/0001_init.sql     postwren_* tables, IF NOT EXISTS
  sql/0002_*.sql
```

Config and identity changes:

| Concern  | Standalone today                              | Phase 2                                                                                           |
| -------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Session  | `sid` cookie + `sessions` table + magic links | `routeCtx.user`; delete `users`, `sessions`, `magic_links`                                        |
| CSRF     | `x-csrf-token` vs `csrf` cookie               | `X-EmDash-Request: 1`                                                                             |
| RBAC     | `role` column, owner only                     | `plugins:manage` for writes, `plugins:read` for reads                                             |
| Secrets  | `SESSION_SECRET`, `TOKEN_SECRET` env          | `settingsSchema` `secret` fields (`tokenSecret`, `siteKey`), encrypted by `EMDASH_ENCRYPTION_KEY` |
| Sender   | `EMAIL_FROM` env + `sender_addresses` table   | settings `fromEmail`, `fromName`, `replyTo`, verified against the site's Email Service domain     |
| URLs     | `APP_URL` env                                 | `ctx.url("/t/c/…")`; site-owned routes for click/unsubscribe                                      |
| Trigger  | `wrangler triggers.crons` + `scheduled()`     | `ctx.cron.schedule()` + `cron` hook; site keeps the cron trigger                                  |
| Queue    | `CAMPAIGN_QUEUE` producer + consumer          | site declares both; package exports the consumer                                                  |
| Media    | own R2 + `/media/*`                           | `ctx.media` + `/_emdash/api/media/file/*`                                                         |
| Envelope | `{ data, error }`                             | EmDash wraps as `{ success, data }`; make the transport injectable                                |

Transport seam (the main refactor): routes stop returning `Response` and return
`{ data: T } | { error: ApiError }`; `createApp(env, transport)` serialises. Two transports:
`honoEnvelope` (standalone, `{ data, error }`) and `emdashEnvelope` (plugin, bare payload so EmDash
does not double-wrap). The SPA's `parseEnvelope` gets the same seam.

What must not change: `renderEmail`, the IR, `applyMergeTags`, `compileAudience`, `signToken`/
`verifyToken`, CSV. They are the pieces worth publishing and they stay dependency-free.

## 6. Risks and blockers

| #   | Risk                                                                                                                 | Verdict / mitigation                                                                                                                                                                                                                                    |
| --- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | `ctx.storage` cannot host the audience compiler's joins or the recipient claim                                       | **Won't work as a port.** Keep `postwren_*` tables and `env.DB`. Do not rewrite `compileAudience`.                                                                                                                                                      |
| R2  | Plugin cannot own D1 tables or migrations                                                                            | Site-side D1 migration step (documented, two commands) or an opt-in `autoMigrate` in `plugin:activate`. Version sentinel + fail-closed activation.                                                                                                      |
| R3  | Plugin cannot declare bindings, Cron Triggers or Queue consumers                                                     | Ship the handlers, have the site paste 5 lines into `src/worker.ts` and 10 into `wrangler.jsonc`. Ship a `postwren doctor` check that reports what is missing instead of failing at send time.                                                          |
| R4  | Every site gets a copy of the recipient table in its own D1; 10k subscribers × N campaigns is rows in a CMS database | Cap campaign size in settings, batch recipient creation (dispatch already does), document D1 row-count limits, and offer "keep the standalone Worker for sending". This is the main reason phase 1 may be the right end state.                          |
| R5  | `ctx.email.send()` is one message at a time, has no `headers`, and `email:deliver` is exclusive                      | Use the site's `send_email` binding directly (`msg.headers` carries `List-Unsubscribe` + `List-Unsubscribe-Post`, which RFC 8058 requires and `EmailMessage` cannot express). Treat `ctx.email` as a fallback for sites with only a Resend transport.   |
| R6  | Click tracking needs an off-origin 302; public raw routes may not redirect off-origin                                | **Won't work as a plugin route.** Export `createClickHandler(env)` and have the site mount `src/pages/t/c/[token].ts`. Alternatively keep clicks on the standalone Worker.                                                                              |
| R7  | Unsubscribe and signup confirmation pages are HTML; raw routes reject `text/html`                                    | Same as R6: site Astro pages importing our exported page bodies. `page:fragments` cannot create a page, only decorate one.                                                                                                                              |
| R8  | The SPA cannot be served as static files from a plugin route (JS/CSS blocked)                                        | Bundle it through `adminEntry`; the admin entry must be a Vite-built React module. No iframe, no static hosting.                                                                                                                                        |
| R9  | Admin-entry CSS may not be collected by the site's Astro admin build                                                 | Unverified. Test on a real site in M5. Fallback: scoped class + injected `<style>`.                                                                                                                                                                     |
| R10 | Deep links inside a plugin admin page do not resolve                                                                 | `usePluginPage` is an exact map lookup. Hash routing, or internal state, or one page per section.                                                                                                                                                       |
| R11 | Our SQL is SQLite-only; EmDash also supports Postgres over Hyperdrive                                                | Probe at activation, refuse to run without a D1 binding, document it. No dialect abstraction.                                                                                                                                                           |
| R12 | Wire-format collision: our `{ data, error }` vs EmDash's `{ success, data }`                                         | Injectable transport (section 5). Do not ship two envelopes.                                                                                                                                                                                            |
| R13 | Native plugins are trusted code with the site's authority: a bug in our send loop can read the site's content tables | Accept, minimise: no `content:*` capability unless a feature needs it, no `network:request:unrestricted`, `allowedHosts` limited to the Worker origin in phase 1.                                                                                       |
| R14 | Someone will ask for registry install                                                                                | Won't work: native plugins are excluded from `sandboxed: []` and the registry. If that is a requirement, the product must become a standard/sandboxed plugin — which means Block Kit admin UI and no raw DB, i.e. a different product.                  |
| R15 | Our migration numbering (`0001`–`0005`) collides with EmDash core's migrations if both live in one `migrations_dir`  | Rename to `postwren_0001_…` when copied into a site, or keep them in `node_modules/@postwren/emdash/sql/` and use `wrangler d1 execute --file`.                                                                                                         |
| R16 | `allowedHosts` is fixed at build time from `workerUrl`, so the settings value cannot point anywhere else             | Phase 1 fails closed with `WORKER_NOT_CONFIGURED` when the hosts differ, and the setting's description says to redeploy after changing it. A per-tenant host would need `network:request:unrestricted`, which is too much authority for a signup proxy. |
| R17 | The Worker rate-limits per client IP; all traffic from one site's Worker may share an egress IP                      | Accepted for phase 1: the plugin maps 429 to a friendly message. Raising the budget is a Worker-side change (`RATE_LIMITS.publicSubscribe`).                                                                                                            |

The "No iframe" note in R8 is about serving the SPA from a plugin route. Framing the standalone
Worker is a separate option: it is gated by the exact-origin allowlist under **Settings → Iframe
embedding**, and it still needs a same-site session cookie. See
[IFRAME-EMBEDDING.md](IFRAME-EMBEDDING.md).

## 7. Milestones

Phase 1 as built:

1. **Doc** — this file. _(done)_
2. **Public subscribe endpoint** — shipped on `master` as `POST /api/public/subscribe` with
   `Authorization: Bearer pk_live_…`, per-key CORS, honeypot, rate limit, idempotent upsert;
   covered by `packages/api/test/public.test.ts` inside workerd. _(done)_
3. **Plugin package** — `packages/emdash-plugin`: descriptor, `createPlugin`, pure forward logic,
   inline form, 57 unit tests, `emdash@1.3.1` as peer + dev. _(done)_
4. **Prove it in a real site** — add the plugin to `alfatours-emdash`, submit the form, see the
   subscriber in the Worker. **Not done: needs a live site and a real `pk_live_` key.**
5. **Prove the injected form** — enable `signupFormEnabled` on a site whose template renders
   `<EmDashBodyEnd />`, submit, confirm the subscriber and that no other page output changed.
   **Not done, same reason.**

Phase 2, unchanged and not started:

6. **`@postwren/email` publishable** — subpath exports point at `dist`; `pnpm pack`, then typecheck and
   render a fixture from the tarball. Gate: `renderEmail` output byte-identical.
7. **Signup block** — `componentsEntry` exporting `blockComponents`, so signup can be placed as a
   Portable Text block instead of a footer injection.
8. **Admin page mounting** — React wrapper, hash routing, transport adapter, `useCurrentUser`.
9. **Storage port** — `PostwrenDb` seam in `@postwren/api`, `postwren_*` migrations, schema sentinel.
10.   **Dispatch and send inside the plugin** — `cron` hook, exported queue consumer, own `send_email`
      usage with `List-Unsubscribe`. Gate: a 3-recipient campaign sends; replaying the batch sends
      nothing.
11.   **Identity and settings cutover** — drop `users`/`sessions`/`magic_links`, move secrets to
      `settingsSchema`, delete `SESSION_SECRET`/`TOKEN_SECRET`/`APP_URL`/`EMAIL_FROM` reads.

## 8. Verified from source vs taken from docs

| Claim                                                                                                             | Source                                                                                                                                                   |
| ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createPlugin` entrypoint, `format: "native"`, native-only `plugins: []`                                          | `emdash/dist/virtual-modules-CU29aip9.mjs`, `emdash/dist/astro/index.mjs` (config validation)                                                            |
| Route handler arity, `ctx.input`, `ctx.settings.get`, `ctx.http.fetch`, `PluginRouteError(code, message, status)` | `emdash@1.3.1` `dist/types-*.d.mts`, `dist/config-*.d.mts`; the phase-1 tests run `definePlugin` for real                                                |
| Settings come from `admin.settingsSchema` at runtime, not the descriptor field                                    | `emdash/dist/api-C_LxFnOm.mjs` (`settingsSchemaForPlugin`), `dist/context-ErV7UdQY.mjs`                                                                  |
| Settings defaults are not materialised; unset reads return `null`                                                 | `emdash/dist/settings-yIqoN-Ok.mjs` (`getPluginSettingsWithDb`)                                                                                          |
| Route prefix, auth order, CSRF, `405`, body modes, raw allowlist and blocked types                                | `emdash/dist/astro/routes/api/plugins/[pluginId]/[...path]`, `dist/http-route-dispatch-*.mjs`, `dist/route-wire-*.mjs`, `dist/astro/middleware/auth.mjs` |
| Admin page URL, exact-path resolution, no props                                                                   | `@emdash-cms/admin/dist/index.js` (`PluginPage`, `resolvePluginPagePath`, nav builder)                                                                   |
| Admin entry bundled by Vite                                                                                       | `emdash/dist/virtual-modules-CU29aip9.mjs` (`generateAdminRegistryModule`)                                                                               |
| `_plugin_storage` + expression indexes; no plugin migrations                                                      | `emdash/dist/api-*.mjs`, `dist/context-*.mjs`, `manifest` schema, `emdash/dist/cli/index.mjs`                                                            |
| `send_email` reachable from a native plugin                                                                       | `@emdash-cms/cloudflare/dist/plugins/cloudflare-email{,-env}.mjs`                                                                                        |
| Cron + `withEmDashRuntime` for queue consumers                                                                    | `@emdash-cms/cloudflare/dist/worker.mjs`, `emdash/dist/astro/middleware.d.mts`                                                                           |
| Media file URL is public                                                                                          | `PUBLIC_API_PREFIXES` in `dist/astro/middleware/auth.mjs`                                                                                                |
| Permissions and role levels                                                                                       | `@emdash-cms/auth/dist/index.mjs`                                                                                                                        |
| Hook list, capability gates, `page:fragments` native-only, `errorPolicy`                                          | `emdash/dist/types-*.d.mts` (`PluginHooks`, `HookConfig`), `dist/plugin-types.d.mts`                                                                     |
| Worker contract (`/api/public/subscribe`, headers, honeypot, status codes)                                        | `packages/api/src/routes/public.ts`, `docs/PUBLIC-SUBSCRIBE.md`, `packages/api/test/public.test.ts`                                                      |
| Docs only: Block Kit forms, registry publishing, admin settings-form rendering                                    | `creating-plugins` skill references (`admin-ui.md`, `api-routes.md`, `storage.md`, `publishing.md`)                                                      |

Not verified, therefore untested: the plugin running inside a real site end to end (no deploy was
made); whether EmDash's settings form renders `url`/`secret` fields as expected; `page:fragments`
appearing under a real template's `<EmDashBodyEnd />`; whether the Worker sees the visitor IP or the
site Worker's egress IP for rate limiting; CSS collection from an admin entry; whether `send_email`
accepts every header we need beyond what `packages/api/src/adapters/email.ts` already sends; EmDash
1.x compatibility across minor versions.

## 9. Deliberately out of scope

- Sandboxed/standard plugin format and registry distribution (excluded by R14).
- Multi-tenant: one EmDash site = one Postwren configuration. No site switcher.
- Migrating existing standalone Worker data into a plugin install (would need a CSV/JSON export and a
  documented cutover; `parseSubscriberCsv` is a starting point).
- Automation, A/B testing, billing — unchanged from the standalone product scope.
