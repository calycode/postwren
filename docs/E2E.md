# E2E testing

Playwright suite that runs the real app — built webapp, real Worker, local D1/R2/Queues — so a
pull request is verified through the browser before it reaches `main`.

Status: primary user journeys are covered. Twenty-six tests plus the auth setup pass locally in
about 70 seconds against a fresh database.

## Running it

```
pnpm e2e          # headless, fresh database, rebuilds the webapp
pnpm e2e:headed   # same, with a visible Chromium window
pnpm e2e:ui       # Playwright UI mode: time travel, watch mode, locator picker
pnpm e2e:debug    # Playwright Inspector: step through each action
pnpm e2e:report   # open the last HTML report
```

`pnpm e2e` deletes `.wrangler/e2e`, builds the webapp, applies migrations, starts
`wrangler dev` on `http://localhost:8791`, runs the suite and tears the server down. Nothing is
reused, so two runs never share rows, sessions or rate-limit buckets. Every command first clears a
Worker left on `:8791` by an interrupted run.

Use `E2E_SLOW_MO` to pace a headed run so it is watchable:

```
# PowerShell
$env:E2E_SLOW_MO=250; pnpm e2e:headed
# bash
E2E_SLOW_MO=250 pnpm e2e:headed
```

The first local run needs `pnpm exec playwright install chromium` once. Headed mode uses the same
browser install; no extra download.

## Flags

The npm scripts are thin wrappers around `playwright test --config e2e/playwright.config.ts`.
Anything you append is forwarded, and CLI flags override the config file:

```
pnpm e2e specs/auth.spec.ts                 # filter by file path
pnpm e2e auth                                # filter by path regex
pnpm e2e --grep "signs out"                  # filter by test title
pnpm e2e --headed --grep-invert "campaign"
pnpm e2e --project=chromium
pnpm e2e --workers=2                         # not recommended against one local D1
pnpm e2e --repeat-each=5                     # hunt for flake
pnpm e2e --last-failed
pnpm e2e --max-failures=1 --forbid-only
pnpm e2e --list                              # collect tests, run nothing
pnpm e2e --shard=1/2
pnpm e2e --trace=on                          # always record a trace
pnpm e2e --reporter=line,json                # add a reporter for this run
pnpm e2e --output=test-results/manual-run
```

Full reference: `pnpm exec playwright test --help`, plus
[playwright.dev/docs/test-cli](https://playwright.dev/docs/test-cli),
[test-reporters](https://playwright.dev/docs/test-reporters) and
[trace-viewer](https://playwright.dev/docs/trace-viewer).

## Outputs

- **Terminal** — `list` locally, `github` annotations in CI. WebServer logs are prefixed
  `[WebServer]` and show every request with status and duration.
- **HTML report** — `playwright-report/index.html`, written on every run. Open it with
  `pnpm e2e:report`; it embeds failures, traces, screenshots and videos.
- **`test-results/`** — one folder per failed test: `test-failed-1.png`, `video.webm`,
  `error-context.md` (an accessibility snapshot of the page at failure), and `trace.zip` when a
  retry happened. A passing test leaves nothing behind.
- **Trace viewer** — `pnpm exec playwright show-trace test-results/<test>/trace.zip` steps through
  actions, DOM snapshots, network and console. `--trace=on` records one for every test.
- **CI artifacts** — the `e2e` job uploads `playwright-report/` and `test-results/` when it fails,
  kept for seven days.

Current capture policy is in `e2e/playwright.config.ts`: trace on first retry, screenshot on
failure, video retained on failure. Override per run with `--trace`, and set reporters with
`--reporter` or `--add-reporter`.

## Goal

The suite answers "does the product still work end to end?", not "is this function correct?".
Unit and API tests already cover logic; e2e covers wiring that only breaks when browser, SPA,
Worker, D1, R2 and Queues meet.

## What e2e owns

- Session flow: signed-out redirect, magic-link code sign-in, sign-out.
- CRUD through the UI: subscribers, tags, templates, campaigns, automations, senders, API keys.
- The edit loop: open a template, edit, save, reload, restore a version.
- The send loop: audience preview, test send, schedule, queue consumption, campaign status.
- Cross-boundary flows: public subscribe form, double opt-in, unsubscribe.
- Settings that gate other features: sender addresses, subscribe keys, webhooks, embed origins.
- Upload and serve: media goes to R2 and back into an email.

## What e2e does not own

- Real email delivery, bounces, complaints, Email Sending events. They need Cloudflare; the API
  suite replays those payloads through `processEmailEvent`.
- OAuth provider and MCP protocol. Third-party clients are involved; API tests cover the contract.
- Turnstile, Cloudflare zone discovery, any request that leaves localhost.
- Visual regression and cross-browser matrix. Chromium only until the core suite is stable.
- Load, performance, mobile viewport sweeps.

## Runtime model

One Worker serving the built SPA and the API from the same origin, exactly as it ships.

Why not the Vite dev server on `:5173`:

- Production runs `run_worker_first` with `frame-ancestors` on every response. The proxy path skips
  some of that, and `/oauth`, `/mcp` and the scheduled endpoint only exist on the Worker origin.
- Cookies and generated links must share one origin. `APP_URL` is `http://localhost:8791`; using
  `127.0.0.1` in `baseURL` would silently break unsubscribe and confirmation links.
- A built SPA catches build-time breakage that `vite dev` hides.

The port is deliberately not 8787, so a running `pnpm dev` never collides with a test run and the
suite can always start from a clean database.

### Isolation

`e2e/scripts/serve.mjs` does four things, in order:

1. delete `.wrangler/e2e`
2. `wrangler d1 migrations apply DB --local --persist-to .wrangler/e2e` (after `pnpm build`)
3. `wrangler dev --port 8791 --persist-to .wrangler/e2e --test-scheduled`
4. stop the Worker when Playwright exits

`e2e/wrangler.jsonc` mirrors `wrangler.dev.jsonc` but lives in `e2e/`, so a developer's
`.dev.vars` (custom `OWNER_EMAIL`, real `CLOUDFLARE_API_TOKEN`) cannot leak into a test run. It
keeps `ENVIRONMENT=development` so login returns `devCode`/`devToken` and the email adapter stays a
log-only sink. Queue consumers use `max_batch_timeout: 1` to keep local sends fast.

Per-test cleanup is not needed because every fixture gets a run-scoped, per-call suffix
(`e2e-<runId><suffix>@example.test`, `E2E campaign <runId><suffix>`). Tests never assert on global
counts, only on rows they created. A flow that genuinely needs a clean table gets a serial spec,
not a reset endpoint in production code.

### One worker

`workers` defaults to 1 everywhere. With more, wrangler dev serialises requests against one local
D1 and every response takes 5–18 seconds, which makes the suite flaky rather than faster. Set
`E2E_WORKERS` only when splitting the suite across separate servers or shards.

## Layout

```
e2e/
  wrangler.jsonc          isolated Worker config for tests
  playwright.config.ts
  tsconfig.json           typechecked by pnpm check-types:e2e in CI
  scripts/serve.mjs       reset + migrate + serve, plain Node
  scripts/clean.mjs       clears a Worker left by an interrupted run
  scripts/cleanup.mjs     kills a PID or whatever holds :8791
  setup/auth.setup.ts     signs in once, writes .auth/owner.json
  support/
    paths.ts              root, auth file, port, owner email
    auth.ts               login through the UI, including the dev code panel
    api.ts                request client (session cookie + x-csrf-token) for seeding
    fixtures.ts           test.extend: api client on the browser context
    ids.ts                per-call unique names and emails
    seed.ts               templates, subscribers, tags, campaigns, verified sender
    server.ts             scheduled-task trigger for local cron flows
    ui.ts                 tour, subscriber panel, tag picker, settings tabs
  specs/
    auth.spec.ts          redirect, bad code, sign-out
    dashboard.spec.ts     widgets, page errors
    subscribers.spec.ts   add, search, CSV import, edit, bulk tag, export, delete
    tags.spec.ts          create, assign, filter, rename
    templates.spec.ts     starter, body edit, preview, duplicate, image upload
    campaigns.spec.ts     draft, audience, test send, send now, schedule, cancel
    automations.spec.ts   create, activate, enrol, scheduled delivery, run log
    public-subscribe.spec.ts  double opt-in signup through a subscribe key
    settings.spec.ts      sender, API key, webhook, embed origin
```

Root `package.json` has `e2e`, `e2e:ui`, `e2e:serve` and `check-types:e2e`, with
`@playwright/test` as a root devDependency. The suite is not a workspace package and not part of
`turbo run test`; it has its own lifecycle and stays out of the unit-test loop.

## Auth strategy

Login through the UI once, in a setup project:

1. `page.goto('/login')`
2. fill the owner email (`dev@example.com`, from `e2e/wrangler.jsonc`)
3. read the 6-digit code from the **Development mode** panel
4. sign in, wait for the dashboard
5. skip the product tour, then save `storageState` to `.auth/owner.json`

Every spec starts with that state through `use: { storageState }`. This proves the real login path
once instead of mocking it, and keeps the magic-link rate limit (5 per 15 minutes per email) out of
the per-test path. `.auth/` is gitignored.

The product tour is dismissed in setup because it is a full-screen overlay that blocks clicks. Its
dismissal lives in `localStorage`, which `storageState` captures along with cookies.

The sign-out spec signs in on its own fresh context: logging out deletes the session server-side
and would otherwise invalidate the session every other spec reuses.

The login specs themselves run with an empty `storageState` to cover the redirect, a wrong code,
and protected routes after sign-out.

## API seeding

Setup data goes through `/api/v1` with a `request` client bound to the browser context, so it
carries the session cookie, and sends the readable `csrf` cookie as `x-csrf-token`. Creating a
template or a subscriber through the API takes milliseconds; driving the same through modals adds
flake without adding coverage.

Rule: seed what the spec is not testing, drive the UI for what it is. The campaign spec seeds its
template and verifies the default sender, then creates the campaign through the dialog.

## Determinism

- Queues: `wrangler dev` consumes local queues. Assert with `expect.poll` on campaign status or
  recipient counts; never `waitForTimeout`.
- Cron: `--test-scheduled` exposes `/cdn-cgi/local/scheduled`. `runScheduledTasks` in
  `e2e/support/server.ts` triggers it explicitly after enrolling an automation or scheduling a
  campaign instead of waiting for a wall-clock tick.
- Rate limits: public subscribe and magic link are rate limited per IP and email. The fresh
  database resets them; keep those specs few.
- Network: no external requests. Media fixtures are small local PNGs.
- Wait style: web-first assertions (`toBeVisible`, `toHaveValue`) and `expect.poll` for API state.
  Banned in review: `waitForTimeout`, CSS-selector chains, assertions on generated ids.
- Selectors: accessible role and name first (`getByRole`, `getByLabel`, `getByPlaceholder`). The
  app labels most controls. Add `data-testid` only to unlabelled internals such as the editor
  canvas, and keep those locators together.
- Timeouts: 45 seconds per test, 15 seconds per assertion. A single smoke test is under 2 seconds
  locally; the margin is for a cold Worker and slow CI disk.
- Flake budget: `retries: 1` in CI, `0` locally, `trace: 'on-first-retry'`, screenshots and video
  only on failure. A spec that needs a retry twice a week is fixed or deleted, not retried.

## Spec catalogue

Every test lives in a named `describe` block and uses `test.step` for the readable parts of the
journey. The HTML report therefore reads as a walkthrough, not a list of selectors.

| Journey              | What the specs prove                                                                                                                                                                                                                            |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Signing in and out   | A signed-out visit to `/subscribers` lands on `/login?next=…` and returns there after sign-in; a wrong code is rejected and the sent code accepted; sign-out closes the session and protected routes.                                           |
| Dashboard            | Home renders list health and growth without uncaught page errors.                                                                                                                                                                               |
| Managing subscribers | Add through the dialog, find with search, open the panel; import a CSV and surface the bad row; edit names and custom fields across a reload; bulk-tag two subscribers; export a CSV download that contains the row; delete after confirmation. |
| Organising tags      | Create a tag, assign it in the subscriber panel, filter the list by it; rename from the tag panel and see the table update.                                                                                                                     |
| Building a template  | Starter to editor, edit a body block in the canvas, save and reload; preview the rendered email; duplicate a card; upload a PNG through the image block, resolve it from `/media/...`, and keep it after reload.                                |
| Campaign lifecycle   | Draft from the dialog and list; audience preview count and a test send to the owner; send now to a tagged audience, wait for the queue, see both recipients as Sent and open the public web version; schedule and cancel before it sends.       |
| Welcome automation   | Create from the dialog, remove the wait, activate, add a subscriber, run the scheduled sweep, and see the run log plus delivered email.                                                                                                         |
| Public signup        | Create a double opt-in subscribe key, submit a public signup, use the dev confirmation link, and see the subscriber `Subscribed` with the key's default tag.                                                                                    |
| Workspace settings   | Add a sending address; create an API key and read the one-time secret; create a webhook and read its signing secret; allow an embed origin and see it in `frame-ancestors`.                                                                     |

Not covered yet, deliberately:

- Unsubscribe links, tracking pixels and click events. The tokens are generated per recipient in the
  dev email sink; asserting them needs a sink reader or token helper, not more UI steps.
- Automations with multiple steps, wait units and tag conditions. The first golden path is covered;
  branch coverage belongs in the API suite.
- Campaign data and repeat blocks through the editor.
- Mobile viewport and WebKit.
- `--shard` across CI runners once the suite passes ~5 minutes.

## CI

The `e2e` job in `.github/workflows/ci.yml` runs in parallel with `verify`:

- installs dependencies and Chromium (`--with-deps`, browser cache keyed on the lockfile)
- runs `pnpm check-types:e2e`
- runs `pnpm e2e`
- uploads `playwright-report` and `test-results` on failure, kept for seven days

`TURBO_TOKEN` stays wired so `pnpm build` inside the job is a cache hit. The check is advisory
until Phase 1 has been green for about a week, then it becomes required on `main`.

## Work plan

| Phase | Work                                                                                  | Estimate  | State  |
| ----- | ------------------------------------------------------------------------------------- | --------- | ------ |
| 0     | Playwright dependency, `e2e/wrangler.jsonc`, serve script, config, auth setup, CI job | 0.5–1 day | done   |
| 1     | Smoke specs, fixtures, selector conventions, first green run                          | 1–2 days  | done   |
| 2     | Subscribers, templates, campaigns, public subscribe, settings, media                  | 3–4 days  | done   |
| 3     | Automations, data/repeat blocks, sharding, extra browsers                             | 2–3 days  | partly |

## Testing notes for the app

Quirks the suite encodes, so future specs do not rediscover them:

- **Bulk selection resets on every list reload.** Typing in subscriber search reloads the list and
  clears ticked rows. A bulk spec must wait for the debounced result (`2 subscribers loaded`) before
  ticking rows, and must not change the search afterwards.
- **Custom checkboxes are visually hidden.** Click the `label[data-slot="checkbox"]`, not the input.
  `selectSubscriberRow` does this.
- **`getByLabel` includes the required marker.** A required field's label text is `Name*`, so use
  `getByRole('textbox', { name: 'Name', exact: true })` when the name must be exact.
- **The tag filter loads once on mount.** After creating a tag inside a dialog, reload before
  filtering by it.
- **Campaigns require a verified sender.** `verifyDefaultSender` marks the seeded address verified;
  a plain draft can be created without it, but sending cannot.
- **The dev email sink has no mailbox.** Tests use the API's `devCode`/`devConfirmUrl` instead of
  scraping email.
- **CSV import reports invalid rows as errors, not skips.** Assert the user-facing text
  (`Imported 1`, `1 row could not be imported`) rather than the skip count.

## Risks and findings

- **Queue and cron timing** — the only genuinely asynchronous surface. Mitigated by driving cron
  explicitly and polling API state, not the DOM.
- **Shared local state** — one Worker, one database. Unique fixtures are mandatory; any spec that
  counts global rows will flake.
- **Editor DOM** — the visual editor is the least accessible part of the UI. It will need scoped
  test ids; budget for it in Phase 2.
- **Cold CI** — a cold run is ~3–4 minutes before the first test. Cache Chromium and the turbo
  build.
- **Rate limits** — a developer re-running e2e against an existing persist dir can hit the
  magic-link limit. The fresh-directory script is the fix; do not point e2e at `.wrangler/state`.
- **Test-only code in production** — avoided entirely: no reset routes, no test flags in the
  Worker. The only seam is `ENVIRONMENT !== 'production'`, which already exists.

First defect found by the suite, now fixed: a subscriber panel save sent `firstName`/`lastName` as an
empty string when either was blank, and the API's `min(1)` validation rejected the whole PATCH with 422. Saving a tag from the panel therefore failed for any subscriber with no last name.
`subscriberPatch` now accepts an empty name and the API stores `null`, so clearing a name works and
the suite covers that journey.

## Decided

- **Target surface** — built Worker SPA on `:8791`, not the Vite dev server.
- **Gate** — advisory for the first week, then required on `main`.
- **Scope** — every primary user journey, not only smoke coverage.
