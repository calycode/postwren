# Deploy Postwren with Appflare

[Appflare](https://appflare.dev) is a self-hosted app manager for Cloudflare. It runs as
one Worker in your own account and installs, updates and removes Cloudflare-native apps
there. This page is the deployment path for Postwren; the manual wrangler path stays in
the [README](../README.md#shipping).

Postwren is **not in the Appflare catalog** yet (the catalog needs 50 GitHub stars, and
this repository is new). Until then Appflare installs it **from the repository**: the
sandbox Worker builds the pinned commit in your own account, you review what it
declares, and the install provisions the resources. Such an install is marked _not from
the catalog, not checked_ and Appflare never updates it on its own.

## What you need

- **Workers Paid.** Postwren needs Queues, cron triggers and sending to arbitrary
  recipients, which the free plan does not offer.
- **R2** on the account (the media bucket).
- Appflare installed in that account. Follow
  [Install Appflare](https://appflare.dev/start/install.md) if it is not there yet.
- **Sandbox builds** on: _Settings › Building apps › Build in your account_. If the card
  offers **Update sandbox**, update before building; older sandbox Workers cannot build
  from a repository.

## Install

1. On Appflare's **Catalog** page, choose **From a repository**.
2. Enter `https://github.com/calycode/postwren` (or `calycode/postwren`) and branch
   `main`.
3. Build command: **Work it out** runs `pnpm build`; **None** works too, because
   `wrangler.jsonc` carries `build.command: "pnpm build"`. Either way the admin SPA is
   built before the Worker is bundled.
4. Confirm the cost and choose **Build for review**. Nothing is deployed yet.

The review list should show:

| Resource                                              | What it is                                                                    |
| ----------------------------------------------------- | ----------------------------------------------------------------------------- |
| D1 `DB`                                               | Campaigns, subscribers, templates, API keys; `migrations/` applied at install |
| KV `OAUTH_KV`                                         | OAuth state for the MCP server                                                |
| R2 `MEDIA`                                            | Images and attachments used by the block editor                               |
| Queues `postwren-campaigns`, `postwren-campaigns-dlq` | Campaign dispatch and its dead-letter queue                                   |
| Cron `* * * * *`                                      | Scheduled campaign ticks                                                      |
| `send_email` as `EMAIL`                               | Outbound mail through Cloudflare Email Service                                |
| Static assets `ASSETS`                                | The built admin SPA                                                           |

Secrets come from `.dev.vars.example`: `SESSION_SECRET` and `TOKEN_SECRET`. The four
vars from `wrangler.jsonc` become settings you can change: `APP_URL`, `ENVIRONMENT`,
`EMAIL_FROM`, `OWNER_EMAIL`.

## Fill in the install form

- **`SESSION_SECRET`** — signs session cookies and magic-link tokens. 32+ random bytes,
  for example `openssl rand -hex 32`.
- **`TOKEN_SECRET`** — signs open/click pixels, unsubscribe links and API service
  tokens. 32+ random bytes, generated separately. Rotating it invalidates links and keys
  already sent.
- **`ENVIRONMENT`** — `production`.
- **`EMAIL_FROM`** — the address campaigns send from, on a domain you have onboarded with
  Cloudflare Email Service, e.g. `postwren@mail.example.com`. Use a dedicated
  subdomain so marketing complaints cannot damage transactional reputation.
- **`OWNER_EMAIL`** — the only address allowed to sign in. Lowercase; must match the
  address you type on the login page.
- **`APP_URL`** — the public origin, no trailing slash. If you do not know it before the
  install, leave the default, install, then set it under the app's settings once
  Appflare shows the address. Magic links, tracking links, OAuth discovery and the MCP
  resource audience all derive from it, so it must be right before you sign in.

## After the install

1. **Onboard the sending domain** in the Cloudflare dashboard under Email Service, and
   verify the address in `EMAIL_FROM`. Magic-link sign-in sends through the same
   `EMAIL` binding, so without a verified sender nobody can log in.
2. Open the app's address, go to `/login`, enter `OWNER_EMAIL` and send the link.
3. In the app, check **Settings → Sending domains**; the address is seeded from
   `EMAIL_FROM`, but campaigns only send from an address listed there.
4. Optional: attach a custom domain in Appflare, then update `APP_URL` in the app's
   settings. Appflare redeploys the settings when the address changes.
5. Optional: put Cloudflare Access in front of the app. The public integrations would
   need to stay reachable, so bypass them if you use them: `/api/public/*` (subscribe
   forms), `/api/v1/*` (bearer keys), `/mcp`, `/oauth/*`, `/.well-known/*`, and the
   tracking and media paths `/t/*`, `/u/*`, `/media/*`.

## Updates and removal

- **Updates:** the app's Overview has a **Source** card. **Check for changes** reads the
  newest commit on `main`; **Rebuild and update** builds it for review and then runs the
  ordinary update with a D1 snapshot and rollback. Appflare never checks by itself.
- **Rollback:** the app's page keeps the previous build; a rollback does not revert D1
  migrations.
- **Uninstall:** removes the Worker, D1 database, KV namespace, R2 bucket and queues.
  Export anything you need to keep first, or use the uninstall options that keep data.

The cron fires every minute, so an idle install still runs one invocation a minute and
health checks run on Appflare's schedule. Queues and sending to arbitrary recipients
are what make this app Workers Paid; the cron trigger is free.

## Later: a catalog entry

Once `calycode/postwren` reaches 50 stars it can be submitted to
[appflare/catalog](https://github.com/appflare/catalog) with one manifest,
`apps/postwren/appflare.jsonc`. The catalog entry differs from a repository install in
three useful ways: the build is checked and signed, `APP_URL` uses the `{{appUrl}}`
placeholder, and the two secrets can be generated by the install form.

Draft manifest (pin `source.sha` to the release commit and set `maintainers` to your
GitHub username; no `install.buildCommand` is needed while `wrangler.jsonc` keeps its
`build.command`):

```jsonc
{
   "$schema": "https://appflare.github.io/catalog/schema/v1.json",
   "slug": "postwren",
   "name": "Postwren",
   "summary": "Self-hosted email marketing on a single Cloudflare Worker: block editor, tag-based audiences, scheduled campaigns, and open/click tracking.",
   "tagline": "Email marketing on a Worker you own",
   "features": [
      "Build campaign emails with a visual block editor that renders the real output",
      "Group subscribers by tags and filter them by custom metadata",
      "Schedule campaigns and send to each recipient with their own links",
      "Track opens and clicks without a third-party analytics service",
      "Expose subscribe forms, scoped API keys and an MCP server for agents",
   ],
   "repo": "calycode/postwren",
   "license": "MIT",
   "categories": ["email", "marketing"],
   "maintainers": ["your-github-username"],
   "source": { "ref": "main", "sha": "0000000000000000000000000000000000000000" },
   "install": {
      "packageManager": "pnpm",
      "wranglerConfig": "wrangler.jsonc",
   },
   "plan": "paid",
   "requires": ["r2"],
   "secrets": [
      {
         "name": "SESSION_SECRET",
         "label": "Session signing secret",
         "help": "Signs session cookies and magic-link tokens. 32 or more random bytes.",
         "generate": "password",
      },
      {
         "name": "TOKEN_SECRET",
         "label": "Token signing secret",
         "help": "Signs tracking, unsubscribe and API service tokens. 32 or more random bytes.",
         "generate": "password",
      },
   ],
   "vars": [
      {
         "name": "APP_URL",
         "label": "Public URL",
         "help": "The address people open the app at, without a trailing slash.",
         "default": "{{appUrl}}",
      },
      {
         "name": "ENVIRONMENT",
         "label": "Environment",
         "default": "production",
      },
      {
         "name": "EMAIL_FROM",
         "label": "From address",
         "help": "Sender on a domain onboarded with Cloudflare Email Service.",
         "default": "postwren@mail.example.com",
      },
      {
         "name": "OWNER_EMAIL",
         "label": "Owner email",
         "help": "The only address allowed to sign in.",
      },
   ],
   "postInstall": [
      {
         "type": "markdown",
         "content": "Onboard your sending domain under Email Service, then sign in at {{appUrl}}/login with the owner email and add the sender under Settings → Sending domains.",
      },
   ],
}
```

The catalog has no `{{appUrl}}` equivalent outside a manifest, which is why the
repository install asks you to confirm `APP_URL` by hand.
