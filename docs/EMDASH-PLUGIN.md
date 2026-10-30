# EmDash plugin packaging

Decision document for making this repo installable inside an EmDash site. Two phases: ship the
email layer as a dependency (phase 1), then absorb the Worker into a native plugin (phase 2).

Evidence base: EmDash 1.3.1 as bundled in `alfatours-emdash` (`package.json`, `astro.config.mjs`,
`wrangler.jsonc`, `node_modules/emdash/dist`, `node_modules/@emdash-cms/{cloudflare,admin,auth}`)
and the working native plugins in `alfatours-emdash/src/plugins/*`. Every claim about EmDash below
was read from that source, not from prose docs, unless marked _documented_. Section 7 lists the
open questions.

## 1. Verdict

**Phase 1 — yes, and cheap.** A native plugin is a trusted site dependency: a descriptor factory
plus a module that exports `createPlugin(options)`. It can register admin API routes, an admin page,
public routes, hooks and settings. Our Worker stays standalone; the plugin is a thin adapter that
proxies signup and links out to the existing admin.

**Phase 2 — possible, but it is a port, not a repackage.** Three EmDash properties decide the
architecture:

1. Plugin data is JSON documents in the host's `_plugin_storage` table with expression indexes.
   There are no joins, no per-collection SQL, no multi-row transactions.
2. A plugin cannot ship or run migrations, cannot declare Worker bindings, and cannot declare a
   Cron Trigger or a Queue consumer. All four belong to the site's `wrangler.jsonc` and
   `src/worker.ts`.
3. Public HTML, CSS, JS, SVG and XML cannot be served from a plugin route. Pages are site Astro
   routes; plugin routes return JSON or inert bytes.

So phase 2 keeps our relational schema (renamed `mailer_*`) inside the site's D1 and talks to it
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
import { mailerPlugin } from "@mailer/emdash";
emdash({ database: d1({ binding: "DB" }), plugins: [mailerPlugin({ ... })] });
```

| Surface | Descriptor / definition field | Runtime handle | Verified detail |
| --- | --- | --- | --- |
| Admin API routes | `routes: Record<string, PluginRoute>` (in `definePlugin`) | `RouteContext` with merged `PluginContext` | Mounted at `/_emdash/api/plugins/<pluginId>/<routeName>`; route names may contain `/` (`"events/create"`) |
| Admin pages | descriptor `adminEntry` + `adminPages[]`; definition `admin: { entry, pages }` | `pages` record exported from the admin module | URL `/_emdash/admin/plugins/<pluginId><path>`; component receives **no props** |
| Dashboard widgets | `adminWidgets[]` / `admin: { widgets }` | `widgets` record | sizes `full`, `half`, `third` |
| Field widgets | `fieldWidgets[]` | `fields` record (native) or Block Kit elements | selected by schema `widget: "pluginId:name"` |
| Settings | `settingsSchema: Record<string, SettingField>` | `ctx.settings.get/set/list/delete/getVersioned/compareAndSet/compareAndDelete` | types `string, number, boolean, select, secret, url, email`; `secret` is AES-GCM encrypted with `EMDASH_ENCRYPTION_KEY` |
| Storage | `storage: Record<collection, { indexes, uniqueIndexes }>` | `ctx.storage.<collection>` | rows in `_plugin_storage` (JSON `data`), indexes on `json_extract(data, '$.field')`, query returns ≤100/page |
| KV | none (always available) | `ctx.kv` | same DB-backed options store; `getVersioned` / `compareAndSet` / `compareAndDelete` |
| Hooks | `hooks` | `(event, ctx)` | lifecycle, content, media, comment, byline, `cron`, `email:{beforeSend,deliver,afterSend}`, `page:metadata`, `page:fragments` |
| Content | — | `ctx.content`, `ctx.schema` | capability-gated, read/write/publish with opaque `_rev` |
| Media | — | `ctx.media` | `get`, `list`, `readBytes` (≤16 MiB), `upload`, `delete`, `updateMetadata`; `MediaItem.url` is the public `/_emdash/api/media/file/...` URL |
| Block types | `portableTextBlocks[]` (declarative Block Kit) | `ctx` via admin route | slash-menu entry; native render components come from `componentsEntry` exporting `blockComponents` |
| Public pages | — | — | **not a plugin surface.** Use `page:fragments` (native only) to inject markup into existing pages, or ship site Astro routes |
| MCP tools | `mcp.tools` referencing a private JSON route | — | not useful for us |

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

| Resource | Owned by | Mechanism |
| --- | --- | --- |
| D1 database + our tables | **Site** (binding), plugin (schema, by deploy step) | `env.DB` from `import { env } from "cloudflare:workers"`, exactly as `@emdash-cms/cloudflare`'s `cloudflareEmail` reaches `env.EMAIL`. EmDash's own migration runner has no plugin extension point. |
| Queues producer | **Site** (`queues.producers` + binding name) | `env.MAILER_QUEUE.sendBatch(...)`. There is no `ctx.queue`. |
| Queues consumer | **Site** (`src/worker.ts` `queue` export + `queues.consumers`) | The package exports the handler; the site spreads it in (5 lines). Inside, do the work directly against `env.DB`, or `withEmDashRuntime(runtime => runtime.handlePluginApiRoute(...))` when plugin state is needed. |
| Cron Trigger | **Site** (`triggers.crons` + `createScheduledHandler()`) | The plugin declares the *task*: `ctx.cron.schedule("dispatch", { schedule: "* * * * *" })` in `plugin:activate`, handled by the `cron` hook. The site's cron must tick at least as often as the fastest task. |
| `send_email` | **Site** (`send_email: [{ name }]`) | Native plugin reads the binding from `cloudflare:workers` env. `ctx.email.send()` also exists (`email:send` capability) but see R5. |
| R2 | **Site** | Prefer `ctx.media` / the host storage adapter. Do not add a second bucket. |
| KV | n/a | `ctx.kv` only. |

Consequence: **a plugin cannot make its own storage exist.** Install is always
`pnpm add` + `astro.config.mjs` + `wrangler.jsonc` + deploy. There is no one-click path for phase 2.

### Migration strategy for plugin-owned tables

EmDash's migration tooling is closed to plugins. `emdash migrate` resolves the project's
`emdash/migrations` (core identity/fingerprint) and a database-adapter executor; the plugin manifest
schema has no `migrations` field. So:

1. **Namespace by prefix.** Every table `mailer_*`, every index `idx_mailer_*`. Never touch EmDash's
   `_emdash_*` or `_plugin_*` tables.
2. **Numbered, additive, idempotent files** in the package: `sql/0001_init.sql`, `0002_...sql`.
   `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS` everywhere, so a re-run is a no-op and
   a partially applied file is safe. Never edit an applied file; add a new number.
3. **Version sentinel.** `mailer_schema_version(version INTEGER PRIMARY KEY, applied_at INTEGER)`.
   The package exports `MAILER_SCHEMA_VERSION = 2` (a number, bumped with each file). `plugin:activate`
   reads the sentinel and throws a readable error if it is missing or newer than the code. Fail closed:
   a half-migrated schema must not accept writes.
4. **Applied by the site**, either
   `pnpm exec wrangler d1 migrations apply DB --remote` with the files copied/generated into the
   site's `migrations_dir`, or
   `pnpm exec wrangler d1 execute DB --remote --file node_modules/@mailer/emdash/sql/0001_init.sql`.
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
small side tables if at all. Rate limiting moves to a `mailer_rate_limits` table (atomic
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
`virtual:emdash/admin-registry`, rendered at `/_emdash/admin/plugins/mailer/<path>` with **no props**,
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
  email/          unchanged, published (phase 1 prerequisite)
  shared/         unchanged
  editor/         unchanged
  ui/             unchanged
  worker-kit/     unchanged
  api/            routes return `{ data, error }` values instead of Responses (phase 2)
  webapp/         base path + auth + transport injected via a host adapter (phase 2)
  emdash-plugin/  NEW — descriptor, plugin definition, migrations, worker exports  (phase 1+2)
```

`packages/emdash-plugin` is the only new package. It never imports `@mailer/api` at module scope in a
way that pulls worker-only code into the admin bundle: the admin entry imports `webapp` + `editor`;
the plugin entry imports `api` + `shared` + `email`. Keep them in separate export conditions:

```jsonc
// packages/emdash-plugin/package.json
{
  "name": "@mailer/emdash",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",            // mailerPlugin(): PluginDescriptor   (astro.config)
    "./plugin": "./src/plugin.ts",     // createPlugin(): ResolvedPlugin     (runtime)
    "./admin": "./src/admin.tsx",      // pages/widgets                      (browser)
    "./components": "./src/components.ts", // blockComponents                (Astro SSR)
    "./pages": "./src/pages/index.ts", // click redirect, unsubscribe, signup page bodies
    "./worker": "./src/worker.ts",     // queue handler for src/worker.ts
    "./sql/*": "./sql/*"
  }
}
```

### Phase 1 — standalone Worker stays, plugin adapts

```ts
// packages/emdash-plugin/src/index.ts
import type { PluginDescriptor } from "emdash";

export interface MailerPluginOptions {
  /** Base URL of the standalone Worker, e.g. "https://mailer.example.com". */
  workerUrl: string;
  /** Shown in the admin page; the site admin pastes it from the Worker's settings. */
  siteKey?: string;
}

export function mailerPlugin(options: MailerPluginOptions): PluginDescriptor<MailerPluginOptions> {
  return {
    id: "mailer",
    version: "0.1.0",
    format: "native",
    entrypoint: "@mailer/emdash/plugin",
    adminEntry: "@mailer/emdash/admin",
    componentsEntry: "@mailer/emdash/components",
    options,
    capabilities: ["network:request", "hooks.page-fragments:register"],
    allowedHosts: [new URL(options.workerUrl).host],
    adminPages: [{ path: "/overview", label: "Mailer", icon: "mail" }],
    settingsSchema: {
      workerUrl: { type: "url", label: "Mailer URL", default: options.workerUrl },
      siteKey: { type: "secret", label: "Site key" },
      formId: { type: "string", label: "Signup form id", default: "newsletter" },
    },
  };
}
```

```ts
// packages/emdash-plugin/src/plugin.ts
import { definePlugin, PluginRouteError } from "emdash";
import type { MailerPluginOptions } from "./index";

export function createPlugin(options: MailerPluginOptions) {
  return definePlugin({
    id: "mailer",
    version: "0.1.0",
    capabilities: ["network:request", "hooks.page-fragments:register"],
    allowedHosts: [new URL(options.workerUrl).host],
    admin: {
      entry: "@mailer/emdash/admin",
      pages: [{ path: "/overview", label: "Mailer", icon: "mail" }],
    },
    routes: {
      // Public signup, forwarded to the Worker with the site key. Rate limiting and
      // honeypot live on the Worker so a compromised site cannot bypass the quota.
      signup: {
        public: true,
        methods: ["POST"],
        request: { body: "json", maxBytes: 8 * 1024 },
        handler: async (ctx) => {
          const body = ctx.input as { email?: unknown; formId?: unknown };
          if (typeof body.email !== "string" || !body.email.includes("@")) {
            throw new PluginRouteError("INVALID_EMAIL", "A valid email is required", 422);
          }
          const res = await ctx.http!.fetch(`${options.workerUrl}/api/v1/public/subscribe`, {
            method: "POST",
            headers: { "content-type": "application/json", "x-site-key": options.siteKey ?? "" },
            body: JSON.stringify({ email: body.email, formId: body.formId }),
          });
          if (!res.ok) throw new PluginRouteError("SUBSCRIBE_FAILED", "Signup failed", 502);
          return { subscribed: true };
        },
      },
      overview: {
        permission: "plugins:read",
        methods: ["GET"],
        handler: async (ctx) => ({ workerUrl: options.workerUrl, configured: Boolean(options.siteKey) }),
      },
    },
    hooks: {
      // Optional: inject the form into every public page without site template edits.
      // Native only (capability "hooks.page-fragments:register"). The script is inline
      // because a plugin route cannot serve .js (see R8).
      "page:fragments": async () => [
        {
          kind: "html",
          placement: "body:end",
          html: '<form id="mailer-signup"><input name="email" type="email" required></form>',
        },
        {
          kind: "inline-script",
          placement: "body:end",
          code: `document.getElementById("mailer-signup").addEventListener("submit", async (event) => {
            event.preventDefault();
            const email = new FormData(event.target).get("email");
            await fetch("/_emdash/api/plugins/mailer/signup", {
              method: "POST",
              headers: { "content-type": "application/json", "X-EmDash-Request": "1" },
              body: JSON.stringify({ email }),
            });
            event.target.reset();
          });`,
        },
      ],
    },
  });
}
```

Repo changes required for phase 1:

| Change | File | Why |
| --- | --- | --- |
| Publish a public subscribe endpoint | `packages/api/src/routes/subscribers.ts` + `app.ts` | None exists: every `/api/v1/*` route is behind `requireAuth`. Needs `POST /api/v1/public/subscribe`, `x-site-key` check, honeypot, rate limit. Test through `createApp`. |
| Publish `@mailer/email` properly | `packages/email/package.json` | Subpath exports point at `./src/*.ts` while `files` is `["dist"]` — consumers get TS or nothing. Point at `dist`, add `publishConfig`, run `pnpm pack` + a typecheck against the packed artifact. |
| Site key storage | `migrations/0004_site_keys.sql` | One row per site, hashed key, created_at. Additive. |
| New package | `packages/emdash-plugin/*` | Above. |
| No auth changes | — | The standalone Worker keeps its own magic-link session. |

Leave out of phase 1: any admin UI beyond a status card, any shared storage, any EmDash email usage.

### Phase 2 — full plugin

```
packages/emdash-plugin/
  src/index.ts          mailerPlugin(): PluginDescriptor
  src/plugin.ts         createPlugin(options): ResolvedPlugin  (routes + hooks)
  src/routes/*.ts       our route handlers, delegating to @mailer/api
  src/worker.ts         export const queue: ExportedHandlerQueueHandler  (site spreads this in)
  src/pages/index.ts    createClickHandler / createUnsubscribeHandler for site Astro routes
  src/db.ts             MailerDb = minimal D1 surface; createMailerDb(env)
  src/settings.ts       typed reads over ctx.settings with defaults
  src/admin.tsx         React wrapper mounting the Preact SPA (hash routing)
  src/components.ts     blockComponents: newsletter signup block
  sql/0001_init.sql     mailer_* tables, IF NOT EXISTS
  sql/0002_*.sql
```

Config and identity changes:

| Concern | Standalone today | Phase 2 |
| --- | --- | --- |
| Session | `sid` cookie + `sessions` table + magic links | `routeCtx.user`; delete `users`, `sessions`, `magic_links` |
| CSRF | `x-csrf-token` vs `csrf` cookie | `X-EmDash-Request: 1` |
| RBAC | `role` column, owner only | `plugins:manage` for writes, `plugins:read` for reads |
| Secrets | `SESSION_SECRET`, `TOKEN_SECRET` env | `settingsSchema` `secret` fields (`tokenSecret`, `siteKey`), encrypted by `EMDASH_ENCRYPTION_KEY` |
| Sender | `EMAIL_FROM` env + `sender_addresses` table | settings `fromEmail`, `fromName`, `replyTo`, verified against the site's Email Service domain |
| URLs | `APP_URL` env | `ctx.url("/t/c/…")`; site-owned routes for click/unsubscribe |
| Trigger | `wrangler triggers.crons` + `scheduled()` | `ctx.cron.schedule()` + `cron` hook; site keeps the cron trigger |
| Queue | `CAMPAIGN_QUEUE` producer + consumer | site declares both; package exports the consumer |
| Media | own R2 + `/media/*` | `ctx.media` + `/_emdash/api/media/file/*` |
| Envelope | `{ data, error }` | EmDash wraps as `{ success, data }`; make the transport injectable |

Transport seam (the main refactor): routes stop returning `Response` and return
`{ data: T } | { error: ApiError }`; `createApp(env, transport)` serialises. Two transports:
`honoEnvelope` (standalone, `{ data, error }`) and `emdashEnvelope` (plugin, bare payload so EmDash
does not double-wrap). The SPA's `parseEnvelope` gets the same seam.

What must not change: `renderEmail`, the IR, `applyMergeTags`, `compileAudience`, `signToken`/
`verifyToken`, CSV. They are the pieces worth publishing and they stay dependency-free.

## 6. Risks and blockers

| # | Risk | Verdict / mitigation |
| --- | --- | --- |
| R1 | `ctx.storage` cannot host the audience compiler's joins or the recipient claim | **Won't work as a port.** Keep `mailer_*` tables and `env.DB`. Do not rewrite `compileAudience`. |
| R2 | Plugin cannot own D1 tables or migrations | Site-side D1 migration step (documented, two commands) or an opt-in `autoMigrate` in `plugin:activate`. Version sentinel + fail-closed activation. |
| R3 | Plugin cannot declare bindings, Cron Triggers or Queue consumers | Ship the handlers, have the site paste 5 lines into `src/worker.ts` and 10 into `wrangler.jsonc`. Ship a `mailer doctor` check that reports what is missing instead of failing at send time. |
| R4 | Every site gets a copy of the recipient table in its own D1; 10k subscribers × N campaigns is rows in a CMS database | Cap campaign size in settings, batch recipient creation (dispatch already does), document D1 row-count limits, and offer "keep the standalone Worker for sending". This is the main reason phase 1 may be the right end state. |
| R5 | `ctx.email.send()` is one message at a time, has no `headers`, and `email:deliver` is exclusive | Use the site's `send_email` binding directly (`msg.headers` carries `List-Unsubscribe` + `List-Unsubscribe-Post`, which RFC 8058 requires and `EmailMessage` cannot express). Treat `ctx.email` as a fallback for sites with only a Resend transport. |
| R6 | Click tracking needs an off-origin 302; public raw routes may not redirect off-origin | **Won't work as a plugin route.** Export `createClickHandler(env)` and have the site mount `src/pages/t/c/[token].ts`. Alternatively keep clicks on the standalone Worker. |
| R7 | Unsubscribe and signup confirmation pages are HTML; raw routes reject `text/html` | Same as R6: site Astro pages importing our exported page bodies. `page:fragments` cannot create a page, only decorate one. |
| R8 | The SPA cannot be served as static files from a plugin route (JS/CSS blocked) | Bundle it through `adminEntry`; the admin entry must be a Vite-built React module. No iframe, no static hosting. |
| R9 | Admin-entry CSS may not be collected by the site's Astro admin build | Unverified. Test on a real site in M5. Fallback: scoped class + injected `<style>`. |
| R10 | Deep links inside a plugin admin page do not resolve | `usePluginPage` is an exact map lookup. Hash routing, or internal state, or one page per section. |
| R11 | Our SQL is SQLite-only; EmDash also supports Postgres over Hyperdrive | Probe at activation, refuse to run without a D1 binding, document it. No dialect abstraction. |
| R12 | Wire-format collision: our `{ data, error }` vs EmDash's `{ success, data }` | Injectable transport (section 5). Do not ship two envelopes. |
| R13 | Native plugins are trusted code with the site's authority: a bug in our send loop can read the site's content tables | Accept, minimise: no `content:*` capability unless a feature needs it, no `network:request:unrestricted`, `allowedHosts` limited to the Worker origin in phase 1. |
| R14 | Someone will ask for registry install | Won't work: native plugins are excluded from `sandboxed: []` and the registry. If that is a requirement, the product must become a standard/sandboxed plugin — which means Block Kit admin UI and no raw DB, i.e. a different product. |
| R15 | Our migration numbering (`0001`–`0003`) collides with EmDash core's migrations if both live in one `migrations_dir` | Rename to `mailer_0001_…` when copied into a site, or keep them in `node_modules/@mailer/emdash/sql/` and use `wrangler d1 execute --file`. |

## 7. First milestones

Each is verifiable on its own and leaves the repo green.

1. **Doc** — this file. *(done)*
2. **`@mailer/email` publishable** — subpath exports point at `dist`; `pnpm pack` then typecheck and
   render a fixture from the tarball in a scratch dir. Gate: `renderEmail` output byte-identical to
   the in-repo build.
3. **Public subscribe endpoint** — `POST /api/v1/public/subscribe` with `x-site-key`, honeypot and
   rate limit; test through `createApp` (401 without key, 429 on burst, 200 idempotent on repeat).
4. **Adapter skeleton** — `packages/emdash-plugin` with descriptor + `createPlugin` + the `signup`
   route proxying to the Worker. Gate: `pnpm check-types` and `pnpm lint` pass with `emdash` added as
   a dev dependency only.
5. **Prove it in a real site** — add the plugin to `alfatours-emdash`, submit the signup form from a
   page, see the subscriber in the standalone Worker. Gate: one real subscriber row, one log line.
6. **Signup block** — `componentsEntry` exporting `blockComponents` for a newsletter block, plus the
   `page:fragments` script. Gate: block renders on a published page.
7. **Admin page mounting** — React wrapper, hash routing, transport adapter, `useCurrentUser`.
   Gate: the SPA loads, lists templates, saves one, in the real admin; no double envelope; no
   history desync on refresh.
8. **Storage port** — `MailerDb` seam in `@mailer/api`, `mailer_*` migrations, schema sentinel.
   Gate: subscribers/templates/campaigns CRUD against a real D1 inside EmDash, existing API tests
   still green in workerd.
9. **Dispatch and send inside the plugin** — `cron` hook for dispatch, exported queue consumer, own
   `send_email` usage with `List-Unsubscribe`. Gate: a 3-recipient campaign sends through the site's
   binding, replaying the batch sends nothing.
10. **Identity and settings cutover** — drop `users`/`sessions`/`magic_links`, move secrets to
    `settingsSchema`, delete `SESSION_SECRET`/`TOKEN_SECRET`/`APP_URL`/`EMAIL_FROM` reads.
    Gate: activation fails closed without `tokenSecret`; admin operations authorised by
    `plugins:manage`.

## 8. Verified from source vs taken from docs

| Claim | Source |
| --- | --- |
| `createPlugin` entrypoint, `format: "native"`, native-only `plugins: []` | `emdash/dist/virtual-modules-CU29aip9.mjs`, `emdash/dist/astro/index.mjs` (config validation) |
| Route prefix, auth order, CSRF, `405`, body modes, raw allowlist and blocked types | `emdash/dist/astro/routes/api/plugins/[pluginId]/[...path]`, `dist/http-route-dispatch-*.mjs`, `dist/route-wire-*.mjs`, `dist/astro/middleware/auth.mjs` |
| Admin page URL, exact-path resolution, no props | `@emdash-cms/admin/dist/index.js` (`PluginPage`, `resolvePluginPagePath`, nav builder) |
| Admin entry bundled by Vite | `emdash/dist/virtual-modules-CU29aip9.mjs` (`generateAdminRegistryModule`) |
| `_plugin_storage` + expression indexes; no plugin migrations | `emdash/dist/api-*.mjs`, `dist/context-*.mjs`, `manifest` schema, `emdash/dist/cli/index.mjs` |
| `send_email` reachable from a native plugin | `@emdash-cms/cloudflare/dist/plugins/cloudflare-email{,-env}.mjs` |
| Cron + `withEmDashRuntime` for queue consumers | `@emdash-cms/cloudflare/dist/worker.mjs`, `emdash/dist/astro/middleware.d.mts` |
| Media file URL is public | `PUBLIC_API_PREFIXES` in `dist/astro/middleware/auth.mjs` |
| Permissions and role levels | `@emdash-cms/auth/dist/index.mjs` |
| Hook list, capability gates, `page:fragments` native-only | `emdash/dist/types-*.d.mts` (`PluginHooks`), `dist/plugin-types.d.mts` |
| Docs only: Block Kit forms, registry publishing, `settingsSchema` rendering details | `creating-plugins` skill references (`admin-ui.md`, `api-routes.md`, `storage.md`, `publishing.md`) |

Not verified, therefore untested: the whole plugin running inside a real site end to end; CSS
collection from an admin entry; whether `send_email` accepts every header we need beyond what
`packages/api/src/adapters/email.ts` already sends; EmDash 1.x compatibility guarantees across minor
versions.

## 9. Deliberately out of scope

- Sandboxed/standard plugin format and registry distribution (excluded by R14).
- Multi-tenant: one EmDash site = one mailer configuration. No site switcher.
- Migrating existing standalone Worker data into a plugin install (would need a CSV/JSON export and a
  documented cutover; `parseSubscriberCsv` is a starting point).
- Automation, A/B testing, billing — unchanged from the standalone product scope.
