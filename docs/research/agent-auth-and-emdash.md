# Agent auth and EmDash plugin feasibility

Two questions for this repo: what does it take to expose an MCP server that ChatGPT and Claude can connect to, and what can an EmDash plugin actually own if this mailer is packaged for EmDash sites. Sources were fetched on 2026-10-30. Where EmDash docs were ambiguous, the local source in `C:\DEVELOPMENT\CALY\exploration\emdash-block-builder` was checked.

## 1. MCP authorization in 2026

### 1.1 The required shape

The current MCP authorization spec (revision `2026-07-28`) treats the MCP server as an OAuth 2.1 **resource server** and requires:

| Requirement                   | Spec                                                                                                                                                                                    | What it means here                                                                                                                    |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| OAuth 2.1 + PKCE S256         | [MCP authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization)                                                                                       | Authorization-code flow only; `code_challenge_methods_supported` must include `S256`                                                  |
| Protected Resource Metadata   | [RFC 9728](https://datatracker.ietf.org/doc/html/rfc9728), [MCP discovery](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/authorization-server-discovery) | Serve `/.well-known/oauth-protected-resource` and/or advertise `resource_metadata` in `WWW-Authenticate`                              |
| Authorization Server Metadata | [RFC 8414](https://datatracker.ietf.org/doc/html/rfc8414) or OIDC discovery                                                                                                             | Serve `/.well-known/oauth-authorization-server` with issuer, authorize, token, registration, scopes, PKCE methods                     |
| Resource indicators           | [RFC 8707](https://datatracker.ietf.org/doc/html/rfc8707)                                                                                                                               | Client sends `resource`; authorization server binds it into the token audience; MCP server rejects tokens minted for another resource |
| Issuer identification         | [RFC 9207](https://datatracker.ietf.org/doc/html/rfc9207)                                                                                                                               | Return `iss` on success and error; advertise `authorization_response_iss_parameter_supported: true`                                   |
| Client registration           | [MCP client registration](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/client-registration)                                                             | CIMD preferred; DCR (RFC 7591) is deprecated but still accepted; pre-registration for known clients                                   |
| Bearer token in header        | OAuth 2.1 §5                                                                                                                                                                            | `Authorization: Bearer …` on every MCP request; never in the query string                                                             |
| Audience validation           | RFC 8707 §2                                                                                                                                                                             | Verify signature, `iss`, `aud`/`resource`, `exp`/`nbf`, and scopes on every call                                                      |

CIMD (Client ID Metadata Documents) means the client's `client_id` is an HTTPS URL that the authorization server fetches. The document must contain `client_id` (exactly the URL), `client_name`, and `redirect_uris`; the server validates the redirect against that document ([MCP client registration](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/client-registration)). DCR is now a compatibility fallback.

### 1.2 What ChatGPT actually requires

OpenAI's current connector docs are explicit ([authentication](https://developers.openai.com/plugins/build/auth), [custom MCP server](https://developers.openai.com/api/docs/guides/custom-mcp-server), [help article](https://help.openai.com/en/articles/12584461-creating-custom-mcp-apps-in-chatgpt)):

- A public HTTPS MCP endpoint using Streamable HTTP or SSE. `localhost` does not work; use a tunnel or Secure MCP Tunnel for development.
- Either no authentication, OAuth, or "OAuth or no authentication" (mixed; initialize/list tools unauthenticated, tools authenticated). For user data, OAuth.
- Protected resource metadata with `resource` equal to the MCP server's canonical HTTPS URL and `authorization_servers` pointing at the issuer. ChatGPT sends that exact `resource` value in both authorization and token requests.
- Authorization server metadata with `authorization_endpoint`, `token_endpoint`, `code_challenge_methods_supported: ["S256"]`, and `token_endpoint_auth_methods_supported`. For CIMD, set `client_id_metadata_document_supported: true`; for DCR, set `registration_endpoint`.
- Client registration via CIMD (preferred by ChatGPT when available), DCR, or a predefined OAuth client. For CIMD, ChatGPT sends `client_id=https://chatgpt.com/oauth/client.json` when RFC 9207 is implemented, otherwise a callback-specific `https://chatgpt.com/oauth/{callback_id}/client.json`.
- Exact redirect URI. With RFC 9207 issuer identification: `https://chatgpt.com/connector_platform_oauth_redirect`. Without it: `https://chatgpt.com/connector/oauth/{callback_id}`. Redirects are matched exactly; no other `chatgpt.com` path, subdomain, or custom scheme.
- Refresh tokens. If the provider advertises OIDC scopes, ChatGPT requests them; `offline_access` must be advertised and enabled or the connection expires and the user must reauthenticate.

ChatGPT does **not** let the MCP server skip token validation. The server must verify the token itself: JWKS signature, `iss`, `aud`/`resource`, expiry, scopes. A failed check returns `401` with a `WWW-Authenticate: Bearer resource_metadata="…"` challenge so the client can re-authorize.

### 1.3 Minimum viable compliant flow for this repo

One Worker can be both resource server and authorization server. Minimum endpoints:

| Endpoint                                        | Purpose                                                                                                                                                                                                                                                                                                  |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /.well-known/oauth-protected-resource`     | `{ resource, authorization_servers: [issuer], scopes_supported, resource_documentation }`                                                                                                                                                                                                                |
| `GET /.well-known/oauth-protected-resource/mcp` | Path variant if `/mcp` is the endpoint; either this or the root document is enough                                                                                                                                                                                                                       |
| `GET /.well-known/oauth-authorization-server`   | `issuer`, `authorization_endpoint`, `token_endpoint`, `registration_endpoint` (if DCR), `scopes_supported`, `code_challenge_methods_supported: ["S256"]`, `token_endpoint_auth_methods_supported`, `authorization_response_iss_parameter_supported: true`, `client_id_metadata_document_supported: true` |
| `GET /oauth/authorize`                          | Validate `client_id`, `redirect_uri`, `scope`, `resource`, PKCE; render consent; redirect with `code` + `iss` + `state`                                                                                                                                                                                  |
| `POST /oauth/token`                             | Exchange code with `code_verifier`; accept `application/x-www-form-urlencoded`; return access + refresh tokens                                                                                                                                                                                           |
| `POST /oauth/register`                          | Optional DCR fallback; rate-limited; stores client metadata                                                                                                                                                                                                                                              |
| `POST /oauth/revoke`                            | Revoke refresh token/grant                                                                                                                                                                                                                                                                               |
| `POST /mcp`                                     | Streamable HTTP MCP; 401 challenge when unauthenticated                                                                                                                                                                                                                                                  |

State must live in D1, not memory: authorization codes (hashed, single-use, short TTL, bound to client + redirect + PKCE challenge + resource), clients, refresh tokens (hashed, rotated), and grants. Workers are stateless across isolates and requests; an in-memory `Map` will pass a local test and fail in production.

Recommended scopes for this repo: `mailer:read`, `mailer:write`, `mailer:send`. A single `mailer` scope is acceptable for the first PR if the tool surface is small, but `send` should be separable because it is the irreversible action. ChatGPT will request `scopes_supported` unless the 401 challenge narrows it.

Recommended token model: short-lived JWT access token (ES256 or HS256) with `iss`, `aud` = canonical MCP resource, `sub` = user id, `scope`, `exp`; opaque refresh token in D1. This avoids a token introspection round trip on every MCP call and matches the spec's resource-server model.

### 1.4 Traps

| Trap                             | Consequence                                                                   | Mitigation                                                                                                                                                |
| -------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HTTPS and public reachability    | ChatGPT cannot connect to `localhost` or plain HTTP                           | Deploy the Worker; use a tunnel only for development                                                                                                      |
| Redirect URI exact match         | `invalid_redirect_uri`; connector never completes                             | Copy the exact URI from the ChatGPT management page; support both stable and callback-specific forms                                                      |
| No RFC 9207 `iss`                | ChatGPT falls back to per-callback redirect and rejects mismatches            | Emit `iss` on success and error; advertise support; compare by exact string, no normalization                                                             |
| `resource` not bound to audience | Token minted for another resource is accepted, or ChatGPT's token is rejected | Echo `resource` into `aud`; validate `aud` on every request                                                                                               |
| Missing `S256` advertisement     | ChatGPT treats the server as unsupported                                      | Always advertise `code_challenge_methods_supported: ["S256"]`; reject `plain`                                                                             |
| In-memory OAuth state            | Codes/clients vanish between isolates; intermittent login loops               | D1 tables with hashed secrets and TTL cleanup                                                                                                             |
| Discovery behind auth            | Client cannot discover the AS                                                 | `.well-known` endpoints are public; no session, no CSRF                                                                                                   |
| CORS on discovery                | Browser-based MCP clients and inspectors fail before OAuth                    | `Access-Control-Allow-Origin: *` on discovery and token/register where credentials are not cookie-based; allow `authorization` and `content-type` headers |
| CIMD fetch rules                 | Authorization fails with `invalid_client`                                     | HTTPS URL with a path, no redirects, 5 KB max, 5 s timeout, cache 5 min–24 h (Resend's documented bounds are a good reference)                            |
| Open DCR                         | Anyone can register a client                                                  | Rate-limit registration; validate redirect URIs; log and revoke; CIMD avoids storing registrations for ChatGPT                                            |
| Refresh rotation races           | Grant revoked when two workers refresh the same token                         | Serialize refresh per grant; store the new token atomically                                                                                               |
| Cookie auth reused for MCP       | CSRF middleware rejects or, worse, accepts a browser session as an agent      | Separate bearer middleware; do not put MCP behind `requireCsrf`                                                                                           |
| Scope inflation                  | A connector can send campaigns when it only needs to read                     | Enforce scopes per route; return `403 insufficient_scope` with the required scope                                                                         |

The repo already has the right primitives for this: `signToken`/`verifyToken` with purpose separation ([tokens](../../packages/shared/src/tokens/index.ts)), D1, and a single Worker. What is missing is the OAuth state model and the discovery endpoints, not cryptography.

## 2. EmDash plugin feasibility

Read first: `.agents/skills/creating-plugins/SKILL.md` plus `references/{admin-ui,api-routes,storage,hooks,publishing,sandbox-boundaries}.md` in `C:\DEVELOPMENT\CALY\exploration\emdash-block-builder`, and the manifest/runtime types in `node_modules/emdash/src/plugins/{types,manifest-schema,cron}.ts`. The site's own `wrangler.jsonc` confirms the host model: D1 `DB`, R2 `MEDIA`, optional `LOADER`, one `* * * * *` cron trigger.

### 2.1 What a native plugin can register

A **native** plugin (`definePlugin`/`createPlugin`, installed as a trusted site dependency) can register:

| Surface                 | Details                                                                                                                                                                                                                                                                      |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Admin API routes        | `routes: { name: { permission, methods, public?, request?, response?, handler } }`; mounted at `/_emdash/api/plugins/<slug>/<name>`; private by default, RBAC permission + `X-EmDash-Request: 1` for cookie calls; public routes skip auth and need explicit install consent |
| Admin pages and widgets | React pages/widgets via `admin.entry`, or declarative Block Kit pages/widgets for sandboxed plugins; saved-entry panels and actions; field widgets                                                                                                                           |
| Hooks                   | Lifecycle (`install/activate/deactivate/uninstall`), content before/after save/delete/publish/schedule/unpublish/restore, media before/after upload, email before/deliver/after, comments, `cron`, `page:metadata`; native-only `page:fragments`                             |
| Storage                 | Declared collections in `emdash-plugin.jsonc`, plugin-scoped, host database, indexed query, CAS/`updateIf`, KV, settings (including encrypted secrets)                                                                                                                       |
| Content                 | Read/write/publish/restore with capabilities and opaque revisions; translations; revision reads; schema read-only                                                                                                                                                            |
| Media                   | Metadata/bytes read, upload/delete, metadata write; host media adapter                                                                                                                                                                                                       |
| Block types             | Custom Portable Text blocks (native-only; require an Astro renderer), Block Kit admin forms, field widgets                                                                                                                                                                   |
| MCP tools               | Private JSON routes exposed as `<pluginId>__tool` with a Zod input schema, permission, and `destructive` flag; admin must enable tools; caller needs `mcp:tools` scope                                                                                                       |
| Email                   | `email:send` gives `ctx.email.send()` through the host-configured transport; `hooks.email-transport:register` lets a plugin be the exclusive transport; `hooks.email-events:register` adds before/after hooks                                                                |

A **sandboxed** plugin gets the same route/hook/storage/model surfaces but not React admin code, Astro render components, custom Portable Text blocks, raw page fragments, host bindings, Node built-ins, or direct database access. It is registry-installable and requires Worker Loader (Paid). Native plugins are not registry-installable.

### 2.2 What a plugin cannot own

These are Worker-level and belong to the host site, not the plugin:

| Resource                 | Can a plugin own it?            | What the host must still do                                                                                                                                                                                                                   |
| ------------------------ | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1 migrations            | **No**                          | EmDash core owns its schema and migration runner. Plugin storage is a declared collection in the host DB; the plugin cannot `CREATE TABLE`, alter columns, or run a migration. Schema access is read-only.                                    |
| Queues                   | **No**                          | A plugin manifest has no queue producer/consumer declaration. The host `wrangler.jsonc` owns queues. Plugin work that needs async must use the host cron table, `ctx.http.fetch`, or the host's own queue.                                    |
| Cron triggers            | **Partially, through the host** | `ctx.cron.schedule(name, { schedule })` writes `_emdash_cron_tasks`; the host `scheduled()` handler runs `createScheduledHandler()`. The host must have a cron trigger and the scheduled export. A plugin cannot add a Cloudflare cron entry. |
| `send_email` binding     | **No**                          | The binding is in the host Worker config. A plugin can only call `ctx.email.send()` if the host configured an email transport, or register itself as the exclusive `email:deliver` provider and call an external API via `ctx.http.fetch`.    |
| R2 bucket / KV namespace | **No**                          | Plugin storage and media go through EmDash's adapters. A plugin cannot declare a new binding.                                                                                                                                                 |
| Outbound network         | **Capability-gated**            | `network:request` + `allowedHosts`, or `network:request:unrestricted`. All fetches are buffered and limited to 8 MiB.                                                                                                                         |

Consequence: an EmDash plugin cannot be the mailer. It can be a thin client and admin surface for a separately deployed mailer Worker. The mailer keeps its own D1, R2, queue, cron, and `send_email`.

### 2.3 How a newsletter form calls this mailer

There is **no public subscribe endpoint in this repo today**. `app.ts` mounts `/api/v1/subscribers` behind `requireAuth` + `requireCsrf`; `RATE_LIMITS.publicSubscribe` exists but is only used by magic-link. A form has nothing safe to call yet. That endpoint is a prerequisite (backlog #10 in the patterns doc).

Three viable shapes, in order of preference:

**A. EmDash public plugin route proxies server-to-server (recommended).**

The site form posts same-origin to `POST /_emdash/api/plugins/mailer/subscribe`. The plugin route is `public: true`, validates the body, and calls the mailer's public subscribe endpoint with `ctx.http.fetch`. The mailer URL and a shared secret/API key live in `ctx.settings` (declared `secret`, encrypted with `EMDASH_ENCRYPTION_KEY`). No CORS, no secret in the browser, and the plugin can attach `source=emdash`, a site id, and default tags.

Cost: the plugin needs `network:request` with `allowedHosts: ["mailer.example.com"]`; adding a public route requires install consent; the mailer still needs its own rate limit and abuse controls because the plugin is not the only caller.

**B. Browser fetch directly to the mailer.**

The form posts JSON to `https://mailer.example.com/api/public/subscribe`. The mailer must allow the EmDash origin in CORS (`Access-Control-Allow-Origin`, `content-type` preflight) and rate-limit by IP. No secret is possible in the browser, so the endpoint must be genuinely public. Simpler to ship, but it couples the mailer's CORS to every site and exposes the endpoint to direct abuse.

**C. Astro server endpoint in the site (no plugin).**

Same-origin `POST /api/newsletter` in the Astro app, proxying to the mailer with a server-side secret. This is the least packaging work and a good first step, but it is site code, not a reusable plugin.

Recommendation: ship C for the first site, then A once the plugin exists. Do not ship B unless the mailer adds a deliberate public CORS allowlist and a strong rate limit.

Required mailer-side contract for any of these: `POST /api/public/subscribe` accepting `{ email, firstName?, lastName?, tags?, source? }`, returning a generic `202` regardless of whether the address existed (no enumeration), rate-limited per IP and per email, with optional double opt-in. Keep the response envelope `{ data, error }`.

### 2.4 Packaging boundaries and migration path

The mailer repo would gain a separate package, e.g. `packages/emdash-plugin`, with these boundaries:

| Boundary          | Rule                                                                                                                                                                                                                                 |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| No Worker imports | The plugin must not import `@mailer/api`, `hono`, D1 types, or queue types. It is a client, not a second Worker.                                                                                                                     |
| Typed client      | Share request/response types from `@mailer/shared/contracts` if that package stays dependency-free; otherwise generate an OpenAPI client. Do not duplicate Zod schemas by hand.                                                      |
| Auth              | Plugin settings hold the mailer base URL + a scoped API token (or a public-subscribe secret). Secrets use `secret` settings fields.                                                                                                  |
| Admin UI          | Native plugin: React page (settings, connection test, recent campaigns, "create draft from this post"). Sandboxed plugin: Block Kit pages only. Full editor embedding is an iframe/auth problem; do not put it in the first version. |
| Content hook      | `content:afterPublish` can create a **draft** campaign or a "new post" notification, never send automatically. Sending is an explicit admin action in the mailer.                                                                    |
| Media             | Use EmDash media URLs in campaign content only if the mailer can fetch them publicly; otherwise upload to the mailer's R2. Do not couple the two media stores in v1.                                                                 |
| Distribution      | Native plugin: npm/GitHub dependency, trusted by the site. Sandboxed plugin: plugin CLI + registry, Worker Loader required, no React. Start native for speed; port to sandboxed only if registry distribution is a real requirement. |

Migration path:

1. **Mailer prerequisites (one PR each):** public subscribe endpoint, scoped API tokens, stable `/api/v1` client types, CORS or server-to-server secret. Without these the plugin has nothing to call.
2. **Thin native plugin (one PR):** `definePlugin` manifest, settings schema (mailer URL, token, default tags), a public subscribe route, and an admin page that tests the connection. No content hooks yet.
3. **Draft-from-post (one PR):** `content:afterPublish` (or an editor action) creates a template from the post title/URL and a draft campaign that pins it. This is the only way today because campaigns cannot own content; either add a campaign content override first or accept the generated template. Explicitly no auto-send.
4. **Harden (one PR):** retries/timeouts around `ctx.http.fetch`, idempotency key per post, capability review, tests through `createPluginTestHost()` and `createPluginRuntimeTestHost()`.
5. **Optional sandboxed port:** only if registry installability is required. Replace React with Block Kit, drop any Portable Text or fragment ambition, and declare every host and capability.

Decision: an EmDash plugin is feasible and useful, but only as a thin integration. It cannot replace the mailer Worker, cannot add migrations/queues/cron/send_email, and is blocked on a public subscribe endpoint that does not exist yet.
