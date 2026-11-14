# Self-hosting

Postwren deploys as one Worker with four Cloudflare resources. There is no
container, no database server and no second application to keep alive.

## What you need

- A Cloudflare account on the **Workers Paid** plan. Queues and sending to
  arbitrary recipients are not on the free plan.
- A domain onboarded in **Email Service → Email Sending**, and a sending
  address on it.
- Node 22 and pnpm 11.
- A `SESSION_SECRET` and `TOKEN_SECRET`: 32 or more random bytes each.

## Option A: Appflare

[Appflare](appflare.md) builds the repository in your own account, provisions
D1, KV, R2 and the queues, and keeps the install updatable and removable. The
install needs Workers Paid and **Build in your account** turned on.

Use this path if you do not want to click through resource creation. Continue
with [After the deploy](#after-the-deploy) either way.

## Option B: manual deploy

### 1. Create the resources

```sh
pnpm install

pnpm exec wrangler d1 create postwren
pnpm exec wrangler r2 bucket create postwren-media
pnpm exec wrangler queues create postwren-campaigns
pnpm exec wrangler queues create postwren-campaigns-dlq
pnpm exec wrangler queues create postwren-email-events
pnpm exec wrangler queues create postwren-email-events-dlq
pnpm exec wrangler kv namespace create OAUTH_KV
```

Put the returned ids into `wrangler.jsonc`: `database_id` on `DB`, and the real
KV id in place of the all-zero `OAUTH_KV` placeholder. Appflare and the Deploy
button create both themselves, so this step is only for a manual deploy.

Set `OWNER_EMAIL` and `EMAIL_FROM` in `wrangler.jsonc` to your own values. The
shipped defaults exist so an install is never left with an open owner slot.

### 2. Set the secrets

```sh
pnpm exec wrangler secret put SESSION_SECRET
pnpm exec wrangler secret put TOKEN_SECRET
# Optional: only needed when a subscribe key requires Turnstile.
pnpm exec wrangler secret put TURNSTILE_SECRET
```

`SESSION_SECRET` signs session cookies and magic-link tokens. `TOKEN_SECRET`
signs tracking pixels, unsubscribe links and service tokens. Rotating
`TOKEN_SECRET` invalidates links and credentials already in the wild.

### 3. Apply migrations, then deploy

```sh
pnpm db:migrate:remote
pnpm deploy              # build:all, then wrangler deploy
```

`pnpm deploy` builds the SPA and every package before deploying. The Worker
serves the built assets from the `ASSETS` binding.

### 4. Set the public origin

`APP_URL` ships empty on purpose. Magic links, media URLs and OAuth metadata
then follow the origin the request arrived on, so `workers.dev` and a custom
domain both work before anything is configured.

Campaign mail is rendered in the queue consumer, which has no request. Set
`APP_URL` to the public origin before scheduling or sending a campaign; the API
answers `app_url_missing` until you do. A bare host such as `mail.example.com`
is accepted and assumed to be HTTPS.

```sh
pnpm exec wrangler secret put APP_URL   # or set it under vars in wrangler.jsonc
```

## After the deploy

### Subscribe the event queue

In the Cloudflare dashboard, open Queues → `postwren-email-events` →
Subscriptions and subscribe it to Email Sending for the sending domain,
selecting:

- `message.bounced`
- `message.complained`
- `message.delivered`

Repeat per sending domain. Without this, Postwren still sends, but bounces and
complaints are visible only in Cloudflare, not in Postwren.

### Onboard the sending domain

In Cloudflare Email Service, onboard the domain you will send from and set
`EMAIL_FROM` to an address on it. Use a dedicated subdomain
(`marketing.example.com`) so marketing complaints cannot damage transactional
reputation. New domains start with conservative daily quotas that scale with
reputation; do not open with a large blast.

Then add the same address in **Settings → Sending domains**. Campaigns can only
send from a verified address in that list, which is what stops a typo from
burning the domain.

### Optional: domain checks

Set a scoped `CLOUDFLARE_API_TOKEN` (Zone Read, DNS Read and Email Sending Read,
plus `CLOUDFLARE_ACCOUNT_ID` when the token can see more than one account) to
let Settings → Sending domains list your zones, flag missing MX, SPF, DKIM and
DMARC records, and check whether a domain is onboarded for Email Sending.
Postwren only reads Cloudflare; it never edits DNS.

```sh
pnpm exec wrangler secret put CLOUDFLARE_API_TOKEN
```

### Optional: hard sender allowlist

`send_email` is deliberately unrestricted in `wrangler.jsonc`. If you want a
platform-level allowlist, set `allowed_sender_addresses` there as well. An empty
array blocks every send.

## Verify the install

1. Open the Worker URL and sign in with `OWNER_EMAIL`.
2. Add and verify a sending address under Settings → Sending.
3. Import one test subscriber with a tag.
4. Create a campaign, send a test to yourself, then schedule it.
5. Confirm `/p/<campaign id>` renders after the send.
6. Open Queues and confirm the campaign and event consumers are active.

## Updates and removal

Pull the new revision, run `pnpm install`, `pnpm db:migrate:remote`, then
`pnpm deploy`. Migrations are numbered and forward-only. To remove an Appflare
install, use its uninstall flow; for a manual install, delete the Worker, the D1
database, the R2 bucket, the four queues and the KV namespace.
