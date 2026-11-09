# Postwren

> Small bird. Loud voice. One Worker.

[![Install with Appflare](https://appflare.dev/badge.svg)](https://appflare.dev/install/?repo=calycode/postwren)

Appflare builds this repository in your own Cloudflare account, provisions D1, KV, R2 and the queues, and keeps the app updatable and removable. The install is not catalog-checked, and it needs Workers Paid and **Build in your account** turned on; see [docs/APPFLARE.md](docs/APPFLARE.md).

Self-hosted email marketing on a single Cloudflare Worker: visual block editor, tag-based audiences, scheduled campaigns, linear automations, per-recipient rendering, open/click tracking, one-click unsubscribe, a public web version of every sent campaign, optional double opt-in, and signed outbound webhooks.

Deliberately narrow: no workflow canvas, no A/B testing, no multi-tenant billing.

Beyond the admin UI, the Worker exposes five integration surfaces: a public subscribe endpoint for marketing sites, signed outbound webhooks, scoped API keys for scripts (including transactional email), an OAuth-protected MCP server for agent clients such as ChatGPT or Claude, and media uploads for the editor.

## Why the email layer is its own package

`@postwren/email` is a versioned IR plus a renderer that emits **only** `table`/`tr`/`td` layout with inline styles and MSO conditional comments, because Outlook on Windows renders with Microsoft Word's engine. There is no `div`, no flex, no `max-width` outside the root table. The same pure function renders the editor preview and the sent message, so what you see is what goes out. It has no React, no DOM, and no Node APIs, and it is the piece worth publishing on its own.

## Stack

- **Worker** — Hono, D1, R2, Queues, Cron, Cloudflare Email Service
- **Admin** — Preact 10 with `preact/compat`, Vite 7, Tailwind v4, shadcn primitives on Base UI
- **Editor** — first-party block editor rendering the real email in an iframe
- **Tests** — Vitest; API tests run inside workerd against real D1

## Layout

```
packages/
  email/       IR, schema, migrations, table-safe renderer, merge tags   (publishable)
  editor/      block editor, property panel, live canvas
  ui/          vendored shadcn primitives, theme tokens
  webapp/      admin SPA
  api/         Hono routes, jobs, adapters, tracking
  shared/      audience compiler, signed tokens, CSV, contracts
  worker-kit/  envelope, errors, ids, request context
migrations/    numbered SQL
```

## Integrations

- **Newsletter forms** — `POST /api/public/subscribe` with a publishable `pk_live_` key. Per-key origin allowlist, honeypot, rate limit, idempotent upsert, optional double opt-in and address hygiene. See [docs/PUBLIC-SUBSCRIBE.md](docs/PUBLIC-SUBSCRIBE.md).
- **Webhooks** — signed, retried POSTs for subscriber and campaign events, with a delivery log. See [docs/WEBHOOKS.md](docs/WEBHOOKS.md).
- **Bounces and complaints** — Cloudflare Email Sending events are consumed from a queue, so hard bounces and spam complaints suppress the subscriber everywhere. See [docs/EMAIL-EVENTS.md](docs/EMAIL-EVENTS.md).
- **Scripts and external apps** — scoped `pwr_` bearer keys on `/api/v1/*`. Create them under Settings or through `/api/v1/settings/api-keys`. See [docs/AGENT-ACCESS.md](docs/AGENT-ACCESS.md).
- **Admin embedding** — exact-origin allowlist for framing the admin SPA in an EmDash page or another host. Same-origin only by default. See [docs/IFRAME-EMBEDDING.md](docs/IFRAME-EMBEDDING.md).
- **AI agents** — MCP over Streamable HTTP at `/mcp`, with OAuth 2.1 + PKCE and dynamic client registration for connectors that cannot send a static key.
- **EmDash sites** — a native plugin that proxies signups to the Worker and renders its settings in the EmDash admin. See [packages/emdash-plugin](packages/emdash-plugin) once installed.

Subscribers and campaigns both carry custom key/value metadata, rendered as `{{ subscriber.meta.key }}` and `{{ campaign.meta.key }}`, and subscriber metadata is filterable with `meta:key=value` in audience queries.

## Local development

```sh
pnpm install
pnpm db:migrate:local
pnpm dev                  # Vite on :5173, Worker on :8787
```

Open `http://localhost:5173/login`, enter the address in `OWNER_EMAIL` (`dev@example.com` by default), and use the 6-digit code shown in the **Development mode** panel — outside production the code and magic-link token are returned in the response instead of emailed.

For the Worker to serve the built SPA on `:8787`, run `pnpm build` once and open `http://localhost:8787`. Vite proxies `/api`, `/media`, `/t`, and `/u`; `/mcp`, `/oauth`, and `/.well-known` must be called on `:8787` directly. If the Worker is not on 8787, update `API_TARGET` in `packages/webapp/vite.config.ts` or pass `VITE_API_TARGET`.

No `send_email` binding exists locally. The adapter logs to `email_dev_sink` and returns a `dev-*` id, so dispatch, the queue consumer, stats, and resend paths are all exercisable. Cron does not fire on its own: `curl http://127.0.0.1:8787/cdn-cgi/local/scheduled`.

## Commands

```sh
pnpm dev              # Vite + Worker
pnpm test             # all packages
pnpm check-types
pnpm lint
pnpm format
pnpm build:all
pnpm db:migrate:local
pnpm db:migrate:remote
pnpm deploy
```

## Shipping

1. **Workers Paid** is required: Queues and sending to arbitrary recipients are not on the free plan.
2. Deploy it with [Appflare](docs/APPFLARE.md), or create the resources yourself and deploy with wrangler. Manual setup:

```sh
pnpm exec wrangler d1 create postwren
pnpm exec wrangler r2 bucket create postwren-media
pnpm exec wrangler queues create postwren-campaigns
pnpm exec wrangler queues create postwren-campaigns-dlq
pnpm exec wrangler queues create postwren-email-events
pnpm exec wrangler queues create postwren-email-events-dlq
pnpm exec wrangler kv namespace create OAUTH_KV
```

3. Put the returned ids into `wrangler.jsonc`: `database_id` on `DB`, and the real KV id in place of the all-zero `OAUTH_KV` placeholder. Appflare and the Deploy button create both themselves, so this step is only for a manual deploy. Set `OWNER_EMAIL` and `EMAIL_FROM` to your own values; the shipped `hello@...` defaults exist so an install is not left with an open owner slot. Then:

```sh
pnpm exec wrangler secret put SESSION_SECRET
pnpm exec wrangler secret put TOKEN_SECRET
# Optional: only needed when a subscribe key requires Turnstile.
pnpm exec wrangler secret put TURNSTILE_SECRET
pnpm db:migrate:remote
pnpm deploy
```

`APP_URL` ships empty on purpose: magic links, media URLs and OAuth metadata then follow the origin the request arrived on, so `workers.dev` and a custom domain both work before anything is configured. Campaign mail is rendered in the queue consumer, which has no request, so set `APP_URL` to the public origin before scheduling or sending one; the API answers `app_url_missing` until you do. A bare host such as `mail.example.com` is accepted and assumed to be https.

4. **Subscribe the event queue.** In the Cloudflare dashboard, open Queues → `postwren-email-events` → Subscriptions and subscribe it to Email Sending for the sending domain, selecting `message.bounced`, `message.complained` and `message.delivered`. Repeat per sending domain. Without this the app still sends, but bounces and complaints are only visible in Cloudflare, not in Postwren.

5. **Onboard the sending domain** in the Cloudflare dashboard under Email Service, and set `EMAIL_FROM` to an address on it. Use a dedicated subdomain (`marketing.example.com`) so marketing complaints cannot damage transactional reputation. New domains start with conservative daily quotas that scale with reputation — do not open with a large blast.
6. Add the same address in **Settings → Sending domains**. Campaigns can only send from a verified address in that list, which is what stops a typo from burning the domain.

Optional: set a scoped `CLOUDFLARE_API_TOKEN` (Zone Read, DNS Read and Email Sending Read, plus `CLOUDFLARE_ACCOUNT_ID` if the token can see more than one account) to let **Settings → Sending domains** list your zones, flag missing MX, SPF, DKIM and DMARC records, and check whether a domain is onboarded for Email Sending. Postwren only reads Cloudflare; it never edits DNS. Cloudflare verifies sending **domains**, not individual addresses — once a domain is onboarded under Email Service → Email Sending, every address on it may send.

```sh
pnpm exec wrangler secret put CLOUDFLARE_API_TOKEN
```

`send_email` is deliberately unrestricted in `wrangler.jsonc`. If you want a hard platform-level allowlist, set `allowed_sender_addresses` there as well — an empty array blocks every send.

## Behaviour worth knowing

- **Campaigns freeze content.** `ir_snapshot` and `metadata_snapshot` are written at schedule/send-now; editing the template or campaign metadata afterwards does not change an in-flight send.
- **Sends are idempotent.** A recipient is claimed with a conditional `UPDATE ... WHERE status = 'queued'`; replaying a queue batch sends nothing.
- **Daily quota is a wall, not a failure.** `E_DAILY_LIMIT_EXCEEDED` pauses the campaign rather than failing recipients.
- **Opens are approximate.** Apple Mail Privacy Protection and corporate proxies pre-fetch pixels. Clicks are the real metric.
- **Unsubscribe is RFC 8058.** Both `List-Unsubscribe` headers are set; the link is a signed, single-purpose token.
- **Every sent campaign has a web version** at `/p/<campaign id>`, rendered from the frozen snapshot. `{{ links.web }}` in a template becomes a signed, per-recipient URL at send time, so the reader sees their own merge tags and a working unsubscribe link. Without a token the same page is the anonymous, shareable version. Drafts are not exposed.
- **Editor drafting is safe.** Template edits autosave after two seconds and flush on page hide; an explicit save advances the revision. The toolbar reports the live byte size and warns above the 102,400-byte Gmail clip.
- **Block notes are per template.** Add a TODO to any block from its property panel; open notes show a count on the block outline. Notes are independent of revisions and survive saves.
- **Pending is not subscribed.** A double opt-in signup stays out of every audience query and automation until the confirmation POST.
- **Complaints and hard bounces suppress globally.** Cloudflare's event queue sets the subscriber to `complained`/`bounced`, exits active automations and fires the matching webhook. Soft bounces are logged but do not suppress.
- **Turnstile is optional per subscribe key.** A non-empty site key requires `turnstileToken` in the signup body and `TURNSTILE_SECRET` on the Worker. The honeypot stays as the cheap first line.

## Testing strategy

Test at the seams: `renderEmail` output and invariants, IR parse/migrate round-trips, `compileAudience` SQL, token sign/verify, CSV parsing, HTTP through `createApp`, and the campaign lifecycle through the real queue handler. Editor tests cover document operations, not DOM internals.

## Project

- [UI and UX review](docs/UI-REVIEW.md)
- [Automation module proposal](docs/AUTOMATIONS.md)
- [Brand and naming](docs/BRANDING.md)
- [Appflare deployment](docs/APPFLARE.md)
- [Turborepo remote cache](docs/REMOTE-CACHE.md)
- [Release and remote checklist](docs/RELEASING.md)
- [Public subscribe contract](docs/PUBLIC-SUBSCRIBE.md)
- [Webhooks](docs/WEBHOOKS.md)
- [Bounces and complaints](docs/EMAIL-EVENTS.md)
- [Agent access, API keys and MCP](docs/AGENT-ACCESS.md)
- [EmDash plugin packaging](docs/EMDASH-PLUGIN.md)
- [Iframe embedding](docs/IFRAME-EMBEDDING.md)
