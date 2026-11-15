# Configuration

Configuration lives in `wrangler.jsonc` (deployed) and `wrangler.dev.jsonc`
(local). Secrets are Worker secrets, never committed.

## Vars

| Var           | Purpose                                                                                                                  |
| ------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `APP_URL`     | Public origin for links generated without a request. Empty by default.                                                   |
| `ENVIRONMENT` | `production` or `development`. Development returns sign-in codes in the response and skips the production-only MX check. |
| `EMAIL_FROM`  | Default from address when a caller does not supply one                                                                   |
| `OWNER_EMAIL` | The single address allowed to create the owner session                                                                   |

### `APP_URL`

Because the queue consumer has no request, every link it generates needs a
known origin. With `APP_URL` empty:

- Requests that do have an origin use it for magic links, media and OAuth
  metadata, so `workers.dev` and a custom domain both work.
- Scheduling or sending a campaign fails with `app_url_missing`, because the
  consumer cannot guess.

Set it to the public origin, or to a bare host (`mail.example.com`) and HTTPS is
assumed. Do not include a path.

## Secrets

| Secret                    | Required | Purpose                                                         |
| ------------------------- | -------- | --------------------------------------------------------------- |
| `SESSION_SECRET`          | yes      | Signs session cookies and magic-link tokens                     |
| `TOKEN_SECRET`            | yes      | Signs tracking, unsubscribe and service tokens                  |
| `TURNSTILE_SECRET`        | no       | Verifies Turnstile tokens for subscribe keys that require them  |
| `CLOUDFLARE_API_TOKEN`    | no       | Read-only zone, DNS and Email Sending checks                    |
| `CLOUDFLARE_ACCOUNT_ID`   | no       | Needed when the token can see more than one account             |
| `SETTINGS_ENCRYPTION_KEY` | no       | Base64 32 bytes; encrypts provider API keys and webhook secrets |

Use at least 32 random bytes for both signing secrets. Rotating `TOKEN_SECRET`
invalidates links and credentials already in the wild; rotating
`SESSION_SECRET` signs everyone out. A subscribe key with a Turnstile site key
fails closed when `TURNSTILE_SECRET` is missing.

`SETTINGS_ENCRYPTION_KEY` is optional. When it is unset, the AES key for
provider credentials is derived from `TOKEN_SECRET` with HKDF. Set it before
storing a provider key: changing the source afterwards makes every stored
provider credential undecryptable, and they must be entered again. Generate one
with `openssl rand -base64 32`.

## Bindings

| Binding          | Type   | Name                          |
| ---------------- | ------ | ----------------------------- |
| `DB`             | D1     | `postwren`                    |
| `MEDIA`          | R2     | `postwren-media`              |
| `ASSETS`         | Assets | `packages/webapp/dist/client` |
| `OAUTH_KV`       | KV     | one namespace                 |
| `CAMPAIGN_QUEUE` | Queue  | `postwren-campaigns`          |
| `EMAIL`          | Email  | `send_email` binding          |

Queues also have consumers and dead-letter queues:

- `postwren-campaigns` → `postwren-campaigns-dlq`
- `postwren-email-events` → `postwren-email-events-dlq`

The Worker runs a cron every minute for dispatch, automation steps, webhook
retries and token purges.

`send_email` is unrestricted by default. To enforce a platform-level sender
allowlist, set `allowed_sender_addresses` in `wrangler.jsonc`. An empty array
blocks every send.

## Local development

```sh
pnpm install
pnpm db:migrate:local
pnpm dev
```

- Vite runs on `:5173`; the Worker runs on `:8787`.
- Vite proxies `/api`, `/media`, `/t` and `/u`. `/mcp`, `/oauth` and
  `/.well-known` must be requested from the Worker directly.
- `API_TARGET` in `packages/webapp/vite.config.ts` defaults to
  `http://127.0.0.1:8787`; override it with `VITE_API_TARGET` or change the
  constant.
- If the Worker port changes, keep `APP_URL` in `wrangler.dev.jsonc` in step so
  generated links match.
- `wrangler dev` does not fire cron. Trigger it with:

```sh
curl http://127.0.0.1:8787/cdn-cgi/local/scheduled
```

- There is no `send_email` binding locally. The adapter logs an
  `email_dev_sink` event and returns a `dev-*` id, so dispatch, the queue
  consumer, stats and retries remain exercisable.
- Email Sending events come from Cloudflare and do not appear in local Queues.
  Test ingestion through the event handler, not by waiting for a real complaint.

For a production-like local Worker, copy `.dev.vars.example` to `.dev.vars`.
`wrangler dev` reads it and overrides vars from `wrangler.dev.jsonc`. Appflare
also reads it: each `NAME=` line becomes a field in the install form, with the
comment above it as help.

## Static assets and the Worker

`assets.run_worker_first` is `true` so every request reaches the Worker. The
frame-policy middleware needs that to set `frame-ancestors` on HTML responses.
Non-API not-found requests are proxied to `ASSETS`, which serves the SPA shell.

`pnpm build` builds only the SPA. `pnpm deploy` runs `build:all` first, which is
required after changing any package the SPA or Worker imports.

## Related

- [Self-hosting](self-hosting.md) for the deploy sequence.
- [Appflare](appflare.md) for the managed install.
- [Iframe embedding](iframe-embedding.md) for the embed allowlist.
