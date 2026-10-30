# Agent access

Machine clients can drive this mailer in three ways:

1. **Scoped API keys** — a secret you paste into another project. Best for scripts, CI and server-to-server integrations.
2. **OAuth 2.1** — a browser consent flow that lets MCP hosts such as ChatGPT connectors or Claude-style clients obtain their own short-lived tokens.
3. **MCP endpoint** — a stateless JSON-RPC server at `/mcp` that exposes lists, subscribers, campaigns and templates.

All three share **one authorization model**: the same scope names, the same `/api/v1` routes, and the same `{ data, error }` envelopes. The MCP layer never re-implements SQL; it calls the REST routes in-process with the caller's credential.

---

## Scopes

Read scopes never imply write scopes. A credential only gets exactly what was granted.

| Scope               | Allows                                                                     |
| ------------------- | -------------------------------------------------------------------------- |
| `subscribers:read`  | List/read subscribers, export CSV, read tags attached to a subscriber      |
| `subscribers:write` | Create/update/delete subscribers, assign/remove tags, bulk tag, import CSV |
| `campaigns:read`    | List/read campaigns, preview audience counts, campaign preview and stats   |
| `campaigns:write`   | Create/edit campaigns and their audience/sender/UTM fields                 |
| `templates:read`    | List/read templates, render previews and render warnings                   |
| `templates:write`   | Create/edit/delete/duplicate templates                                     |
| `tags:read`         | List tags and tag autocomplete                                             |
| `tags:write`        | Create/rename/delete tags                                                  |
| `media:write`       | Upload images through `POST /api/v1/media`                                 |
| `send:write`        | Schedule, send now, pause, resume and cancel campaigns; send a test email  |

`send:write` is deliberately separate from `campaigns:write`. An agent that drafts campaigns cannot send mail until it is also granted `send:write`.

Session users are unrestricted. Bearer credentials are always limited to the scopes above.

---

## Scoped API keys

### Create a key

Keys are managed from a signed-in session only. The secret is shown **once**; the database stores only its SHA-256 hash.

```sh
curl -X POST http://localhost:8787/api/v1/settings/api-keys \
  -H "cookie: sid=$SID" \
  -H "x-csrf-token: $CSRF" \
  -H "content-type: application/json" \
  -d '{
    "name": "Reporting job",
    "scopes": ["subscribers:read", "campaigns:read", "tags:read"]
  }'
```

```json
{
   "data": {
      "id": "key_...",
      "name": "Reporting job",
      "prefix": "01j9xk2m4p",
      "scopes": ["subscribers:read", "campaigns:read", "tags:read"],
      "created_at": 1790000000,
      "last_used_at": null,
      "expires_at": null,
      "revoked_at": null,
      "key": "mlr_01j9xk2m4p_..."
   },
   "error": null
}
```

Optional `expiresAt` is a Unix timestamp in seconds and must be in the future.

List keys (never returns the hash or the secret):

```sh
curl http://localhost:8787/api/v1/settings/api-keys -H "cookie: sid=$SID"
```

Revoke a key:

```sh
curl -X DELETE http://localhost:8787/api/v1/settings/api-keys/key_... \
  -H "cookie: sid=$SID" -H "x-csrf-token: $CSRF"
```

Revocation is immediate. `last_used_at` updates on every authenticated request.

### Use a key

Send the secret as a bearer token. Bearer requests do **not** need a CSRF token.

```sh
export MAILER_KEY=mlr_01j9xk2m4p_...
export MAILER_URL=http://localhost:8787
```

#### Subscribers

```sh
# list, newest first
curl "$MAILER_URL/api/v1/subscribers?limit=25" \
  -H "authorization: Bearer $MAILER_KEY"

# search and filter by tag
curl "$MAILER_URL/api/v1/subscribers?q=ada&tag=news" \
  -H "authorization: Bearer $MAILER_KEY"

# read one subscriber (and their tags)
curl "$MAILER_URL/api/v1/subscribers/sub_..." \
  -H "authorization: Bearer $MAILER_KEY"

# create
curl -X POST "$MAILER_URL/api/v1/subscribers" \
  -H "authorization: Bearer $MAILER_KEY" \
  -H "content-type: application/json" \
  -d '{"email":"ada@example.com","firstName":"Ada","lastName":"Lovelace"}'

# update
curl -X PATCH "$MAILER_URL/api/v1/subscribers/sub_..." \
  -H "authorization: Bearer $MAILER_KEY" \
  -H "content-type: application/json" \
  -d '{"lastName":"King"}'

# bulk tag
curl -X POST "$MAILER_URL/api/v1/subscribers/bulk-tags" \
  -H "authorization: Bearer $MAILER_KEY" \
  -H "content-type: application/json" \
  -d '{"subscriberIds":["sub_a","sub_b"],"add":["customers"],"remove":["trial"]}'

# delete (soft delete + suppression)
curl -X DELETE "$MAILER_URL/api/v1/subscribers/sub_..." \
  -H "authorization: Bearer $MAILER_KEY"
```

#### Tags

```sh
curl "$MAILER_URL/api/v1/tags" -H "authorization: Bearer $MAILER_KEY"

curl -X POST "$MAILER_URL/api/v1/tags" \
  -H "authorization: Bearer $MAILER_KEY" \
  -H "content-type: application/json" \
  -d '{"name":"newsletter"}'
```

#### Campaigns

```sh
curl "$MAILER_URL/api/v1/campaigns" -H "authorization: Bearer $MAILER_KEY"

# count an audience before sending
curl "$MAILER_URL/api/v1/audience/preview?q=tag:newsletter%20-tag:internal" \
  -H "authorization: Bearer $MAILER_KEY"

# create a draft (requires campaigns:write)
curl -X POST "$MAILER_URL/api/v1/campaigns" \
  -H "authorization: Bearer $MAILER_KEY" \
  -H "content-type: application/json" \
  -d '{
    "name": "October newsletter",
    "templateId": "tpl_...",
    "subject": "October news",
    "fromName": "Example",
    "fromEmail": "news@example.com",
    "audienceQuery": "tag:newsletter -tag:internal"
  }'

# arm and send (requires send:write)
curl -X POST "$MAILER_URL/api/v1/campaigns/cmp_.../send-now" \
  -H "authorization: Bearer $MAILER_KEY"

curl -X POST "$MAILER_URL/api/v1/campaigns/cmp_.../pause" \
  -H "authorization: Bearer $MAILER_KEY"

curl -X POST "$MAILER_URL/api/v1/campaigns/cmp_.../resume" \
  -H "authorization: Bearer $MAILER_KEY"

curl "$MAILER_URL/api/v1/campaigns/cmp_.../stats" \
  -H "authorization: Bearer $MAILER_KEY"
```

#### Templates

```sh
curl "$MAILER_URL/api/v1/templates" -H "authorization: Bearer $MAILER_KEY"

curl "$MAILER_URL/api/v1/templates/tpl_..." -H "authorization: Bearer $MAILER_KEY"

# render a preview (templates:read is enough)
curl -X POST "$MAILER_URL/api/v1/templates/tpl_.../preview" \
  -H "authorization: Bearer $MAILER_KEY" \
  -H "content-type: application/json" \
  -d '{"context":true}'
```

#### Media

`media:write` only. Uploads are multipart form data with a `file` field (PNG, JPEG, GIF or WebP, 5 MB max).

```sh
curl -X POST "$MAILER_URL/api/v1/media" \
  -H "authorization: Bearer $MAILER_KEY" \
  -F "file=@./hero.png"
```

### Failure envelopes

```json
{ "data": null, "error": { "code": "unauthorized", "message": "Invalid or expired credential" } }
```

```json
{
   "data": null,
   "error": {
      "code": "forbidden",
      "message": "Missing required scope: campaigns:write",
      "details": { "requiredScope": "campaigns:write" }
   }
}
```

`401` means the credential is missing, malformed, expired or revoked. `403` means it is valid but lacks the scope, or the endpoint is session-only (API key administration and sender settings).

---

## OAuth 2.1 for MCP

The authorization server is this Worker. The issuer is `APP_URL`. Discovery, registration, authorization and token endpoints are standard OAuth responses rather than the `{ data, error }` API envelope.

### Discovery

| Endpoint                                      | Purpose                                         |
| --------------------------------------------- | ----------------------------------------------- |
| `GET /.well-known/oauth-protected-resource`   | RFC 9728 resource metadata for `${APP_URL}/mcp` |
| `GET /.well-known/oauth-authorization-server` | RFC 8414 authorization server metadata          |

```json
{
   "resource": "https://mailer.example.com/mcp",
   "authorization_servers": ["https://mailer.example.com"],
   "scopes_supported": ["subscribers:read", "..."],
   "bearer_methods_supported": ["header"]
}
```

```json
{
   "issuer": "https://mailer.example.com",
   "authorization_endpoint": "https://mailer.example.com/oauth/authorize",
   "token_endpoint": "https://mailer.example.com/oauth/token",
   "registration_endpoint": "https://mailer.example.com/oauth/register",
   "response_types_supported": ["code"],
   "grant_types_supported": ["authorization_code", "refresh_token"],
   "code_challenge_methods_supported": ["S256"],
   "token_endpoint_auth_methods_supported": ["none"],
   "scopes_supported": ["subscribers:read", "..."]
}
```

Metadata is cacheable for five minutes.

### Flow

```
MCP client                     Browser                        Worker
    |                             |                              |
    |-- GET /mcp (no token) ------------------------------------->|
    |<-- 401 + WWW-Authenticate: Bearer resource_metadata=... ----|
    |-- GET /.well-known/oauth-protected-resource --------------->|
    |<-- resource + authorization_servers ------------------------|
    |-- GET /.well-known/oauth-authorization-server ------------->|
    |<-- endpoints, PKCE S256, scopes ----------------------------|
    |-- POST /oauth/register (DCR: client_name, redirect_uris) -->|
    |<-- client_id (public client, no secret) --------------------|
    |                             |                              |
    |-- open /oauth/authorize?response_type=code&client_id=... -->|
    |                             |-- no session? -------------->|
    |                             |<-- 302 /login?next=/oauth/...|
    |                             |-- sign in, return to consent->|
    |                             |<-- consent page (scopes) -----|
    |                             |-- POST decision=approve ----->|
    |<-- 302 redirect_uri?code=...&state=... ---------------------|
    |-- POST /oauth/token (code + code_verifier + resource) ----->|
    |<-- access_token, refresh_token, expires_in, scope ----------|
    |-- POST /mcp (Authorization: Bearer access_token) ---------->|
    |<-- MCP response --------------------------------------------|
```

Key properties:

- **PKCE S256 is mandatory.** `plain` and missing challenges are rejected.
- **Public clients only.** DCR rejects `token_endpoint_auth_method` other than `none`; there is no client secret to leak.
- **Redirect URIs must be https**, except `http://localhost`, `http://127.0.0.1` and `http://[::1]` for local development. Fragments and embedded credentials are rejected.
- **Authorization codes are single-use** and expire after 10 minutes. Reuse revokes the whole grant.
- **Refresh tokens rotate.** The old refresh token is marked used. Presenting it again revokes the grant and all of its tokens.
- **Audience is enforced.** Tokens are minted for `resource` (default `${APP_URL}/mcp`); the MCP endpoint rejects tokens for another resource.

### Token lifetimes

| Item               | Lifetime |
| ------------------ | -------- |
| Authorization code | 10 min   |
| Access token       | 1 hour   |
| Refresh token      | 30 days  |

### Connecting ChatGPT

1. Make sure `APP_URL` in `wrangler.jsonc` is the public HTTPS origin of the Worker. Discovery URLs and the token issuer are derived from it.
2. In ChatGPT, create a custom connector / MCP server with the server URL `${APP_URL}/mcp`.
3. ChatGPT probes the URL, receives `401` with `WWW-Authenticate`, then reads `/.well-known/oauth-protected-resource` and `/.well-known/oauth-authorization-server`.
4. It registers itself through `POST /oauth/register` (DCR) and opens the authorization URL.
5. Sign in with the owner account if prompted, review the requested scopes, and choose **Allow access**.
6. The connector exchanges the code at `/oauth/token` and starts calling tools.

No client id, secret or redirect URI has to be configured by hand.

### Connecting a Claude-style client

Clients that accept a remote MCP URL work the same way: point them at `${APP_URL}/mcp`. If the client asks for OAuth details manually, use:

- **Authorization URL** — `${APP_URL}/oauth/authorize`
- **Token URL** — `${APP_URL}/oauth/token`
- **Registration URL** — `${APP_URL}/oauth/register`
- **Scopes** — the subset of the table above the client actually needs, space separated
- **PKCE** — S256, mandatory

Clients that only support static headers can use an API key instead:

```
Authorization: Bearer mlr_<prefix>_<secret>
```

---

## MCP endpoint

`POST /mcp` speaks stateless Streamable HTTP JSON-RPC 2.0. It supports `initialize`, `notifications/initialized`, `ping`, `tools/list` and `tools/call`, including JSON-RPC batches.

- Protocol version: `2025-06-18` (also accepts `2025-03-26`).
- Server info: `mailer-cloudflare` `0.1.0`.
- No `Mcp-Session-Id` is issued. There is no server-side session state, so there is nothing to resume; every request is authenticated on its own.
- No SSE stream. `GET /mcp` returns `405` with `Allow: POST, OPTIONS`.
- Unauthenticated requests return `401` with:

```
WWW-Authenticate: Bearer resource_metadata="https://mailer.example.com/.well-known/oauth-protected-resource"
```

Every `tools/call` result contains a text content block whose JSON is the same `{ data, error }` envelope as REST. On failure the result also carries `isError: true`. Secrets, hashes and tokens are never included in tool output.

### Tools

| Tool                   | Scope               | What it does                                  |
| ---------------------- | ------------------- | --------------------------------------------- |
| `list_tags`            | `tags:read`         | Tags with subscriber counts                   |
| `create_tag`           | `tags:write`        | Create a tag                                  |
| `list_subscribers`     | `subscribers:read`  | Search/filter/paginate subscribers            |
| `get_subscriber`       | `subscribers:read`  | One subscriber with tags                      |
| `create_subscriber`    | `subscribers:write` | Create a subscriber                           |
| `update_subscriber`    | `subscribers:write` | Update email/name                             |
| `delete_subscriber`    | `subscribers:write` | Soft delete and suppress                      |
| `assign_tag`           | `subscribers:write` | Attach one tag to one subscriber              |
| `remove_tag`           | `subscribers:write` | Detach one tag from one subscriber            |
| `bulk_tag_subscribers` | `subscribers:write` | Add/remove tags across many subscribers       |
| `list_campaigns`       | `campaigns:read`    | Campaigns with status and audience size       |
| `get_campaign`         | `campaigns:read`    | One campaign                                  |
| `create_campaign`      | `campaigns:write`   | Create a draft pinned to a template revision  |
| `update_campaign`      | `campaigns:write`   | Edit a draft                                  |
| `preview_audience`     | `campaigns:read`    | Compile an audience query and count matches   |
| `schedule_campaign`    | `send:write`        | Pin content and schedule                      |
| `send_campaign_now`    | `send:write`        | Pin content and dispatch immediately          |
| `pause_campaign`       | `send:write`        | Pause a sending campaign                      |
| `resume_campaign`      | `send:write`        | Resume a paused campaign                      |
| `get_campaign_stats`   | `campaigns:read`    | Read-only recipient counts and engagement     |
| `list_templates`       | `templates:read`    | Templates by most recently updated            |
| `get_template`         | `templates:read`    | Template IR and revision                      |
| `create_template`      | `templates:write`   | Create from an IR document                    |
| `update_template`      | `templates:write`   | Edit, optionally without bumping the revision |
| `preview_template`     | `templates:read`    | Render HTML/text, optionally with merge data  |

`tools/list` is not filtered by scope, so a client can discover everything the server offers; each call is still checked against the credential.

### Manual probes

```sh
# challenge
curl -i -X POST "$MAILER_URL/mcp" \
  -H "content-type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize"}'

# with an API key
curl -X POST "$MAILER_URL/mcp" \
  -H "authorization: Bearer $MAILER_KEY" \
  -H "content-type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

# call a tool
curl -X POST "$MAILER_URL/mcp" \
  -H "authorization: Bearer $MAILER_KEY" \
  -H "content-type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"preview_audience","arguments":{"query":"tag:newsletter -tag:internal"}}}'
```

---

## Security notes

- **Hashes only.** API keys, authorization codes, access tokens and refresh tokens are stored as SHA-256 hashes. Plaintext exists only in the response that creates it.
- **Show once.** The API key secret is returned only from `POST /api/v1/settings/api-keys`. There is no "reveal" endpoint.
- **Expiry and revocation.** API keys can expire and can be revoked at any time. OAuth tokens expire on the schedule above; OAuth grants are revoked automatically on authorization-code or refresh-token reuse.
- **CSRF.** Bearer requests skip CSRF because they do not ride on an ambient cookie. Session requests still require the double-submit token.
- **Consent is CSRF-protected.** The consent form carries the session CSRF token and is rejected without it.
- **Least privilege.** Grant only the scopes a client needs. In particular do not grant `send:write` to a reporting or drafting agent.
- **Rate limits.** OAuth registration is limited per IP (10/min), token exchange (60/min) and consent submissions (30/min). Existing public endpoints keep their own limits. Authenticated `/api/v1` traffic shares the application's normal behaviour; there is no separate bearer-only limit.
- **No secrets in MCP output.** Tool results only contain resource envelopes. API key administration and sender settings are not exposed as tools.
- **PKCE and redirect validation** prevent code interception and open redirects. The authorization endpoint only redirects to URIs registered for that client.

---

## Known limitations

- **Stateless MCP.** No `Mcp-Session-Id`, no resumability and no server-initiated notifications/SSE. Batch requests work, but long-running calls are synchronous.
- **Public OAuth clients only.** No client secrets, no `private_key_jwt`, no device authorization grant and no dynamic scope upgrades. To change scopes, re-run authorization.
- **No grant management UI.** OAuth grants cannot be listed or revoked from the admin yet; revoke by deleting the client/grant rows in D1 or by letting tokens expire. API keys can be revoked from the API.
- **No API-key UI yet.** Keys are created and revoked through `/api/v1/settings/api-keys`. A small Settings screen can be added on top without changing the API.
- **Login return path.** If the browser is signed out, `/oauth/authorize` redirects to `/login?next=...`. The admin SPA hands server-rendered paths back to the browser, so the consent page loads after sign-in.
- **Default OAuth scopes are read-only.** When a client omits `scope`, authorization defaults to `subscribers:read`, `campaigns:read`, `templates:read` and `tags:read`. Request write or send scopes explicitly.
- **No media or import tools over MCP.** Media upload (`media:write`) and CSV import stay on REST; MCP covers structured resources.
- **No custom metadata.** Subscriber metadata is out of scope for this feature, as is the public `POST /api/public/subscribe` endpoint (owned by another change).
- **CORS** still only allows the local Vite origins. MCP clients are expected to be server-side; a browser-based MCP client on another origin needs the allowed-origin list extended.
