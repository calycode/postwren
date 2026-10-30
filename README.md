# Mailer Cloudflare

Self-hosted email marketing on a single Cloudflare Worker: visual block editor, tag-based audiences, scheduled campaigns, per-recipient rendering, open/click tracking, and one-click unsubscribe.

Deliberately narrow: no automation builder, no A/B testing, no multi-tenant billing.

## Why the email layer is its own package

`@mailer/email` is a versioned IR plus a renderer that emits **only** `table`/`tr`/`td` layout with inline styles and MSO conditional comments, because Outlook on Windows renders with Microsoft Word's engine. There is no `div`, no flex, no `max-width` outside the root table. The same pure function renders the editor preview and the sent message, so what you see is what goes out. It has no React, no DOM, and no Node APIs, and it is the piece worth publishing on its own.

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

## Local development

```sh
pnpm install
pnpm db:migrate:local
pnpm --filter @mailer/webapp build   # the Worker serves the built SPA
pnpm exec wrangler dev --config wrangler.dev.jsonc --port 8787
```

Open `/login`, enter the address in `OWNER_EMAIL` (`dev@example.com` by default), and use the **Development mode** button that appears after "Send link" — outside production the magic-link token is returned in the response instead of emailed.

For hot reload, run Vite on `:5173` alongside the Worker; it proxies `/api`, `/media`, `/t`, and `/u`. If the Worker is not on 8787, update `API_TARGET` in `packages/webapp/vite.config.ts` or pass `VITE_API_TARGET`.

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
2. Create the resources, then deploy:

```sh
pnpm exec wrangler d1 create mailer-cloudflare
pnpm exec wrangler r2 bucket create mailer-cloudflare-media
pnpm exec wrangler queues create mailer-campaigns
pnpm exec wrangler queues create mailer-campaigns-dlq
pnpm exec wrangler kv namespace create OAUTH_KV
```

3. Put the returned ids into `wrangler.jsonc` (they are intentionally omitted so the Deploy button can provision them), then:

```sh
pnpm exec wrangler secret put SESSION_SECRET
pnpm exec wrangler secret put TOKEN_SECRET
pnpm db:migrate:remote
pnpm deploy
```

4. **Onboard the sending domain** in the Cloudflare dashboard under Email Service, and set `EMAIL_FROM` to an address on it. Use a dedicated subdomain (`marketing.example.com`) so marketing complaints cannot damage transactional reputation. New domains start with conservative daily quotas that scale with reputation — do not open with a large blast.
5. Add the same address in **Settings → Sending domains**. Campaigns can only send from a verified address in that list, which is what stops a typo from burning the domain.

`send_email` is deliberately unrestricted in `wrangler.jsonc`. If you want a hard platform-level allowlist, set `allowed_sender_addresses` there as well — an empty array blocks every send.

## Behaviour worth knowing

- **Campaigns freeze content.** `ir_snapshot` is written at schedule/send-now; editing the template afterwards does not change an in-flight send.
- **Sends are idempotent.** A recipient is claimed with a conditional `UPDATE ... WHERE status = 'queued'`; replaying a queue batch sends nothing.
- **Daily quota is a wall, not a failure.** `E_DAILY_LIMIT_EXCEEDED` pauses the campaign rather than failing recipients.
- **Opens are approximate.** Apple Mail Privacy Protection and corporate proxies pre-fetch pixels. Clicks are the real metric.
- **Unsubscribe is RFC 8058.** Both `List-Unsubscribe` headers are set; the link is a signed, single-purpose token.

## Testing strategy

Test at the seams: `renderEmail` output and invariants, IR parse/migrate round-trips, `compileAudience` SQL, token sign/verify, CSV parsing, HTTP through `createApp`, and the campaign lifecycle through the real queue handler. Editor tests cover document operations, not DOM internals.
