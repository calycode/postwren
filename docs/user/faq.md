# FAQ

## Why are opens approximate?

Many mail clients pre-fetch images. Apple Mail Privacy Protection, corporate
proxies and some security scanners request the tracking pixel without a human
reading the message. Postwren records the open anyway and labels it as a signal,
not a fact. Clicks are the reliable metric because they require a real request to
a tracked URL.

## Why can't I schedule a campaign?

The usual causes, in order:

1. `APP_URL` is empty on the Worker. The queue consumer has no request origin, so
   scheduling answers `app_url_missing`.
2. The from address is not in Settings → Sending, or is not marked verified.
3. The audience matches zero subscribed subscribers.
4. The campaign has no template revision pinned.

## What happens when the daily quota is exhausted?

The campaign pauses with `E_DAILY_LIMIT_EXCEEDED`. Recipients that have not
started stay queued; nobody is failed. Wait for Cloudflare's reset or raise the
domain limit, then resume. Do not open with a large blast on a new domain:
Cloudflare starts new domains on conservative quotas that grow with reputation.

## Can I send from my personal address?

Only if its domain is onboarded for Cloudflare Email Sending and the address is
listed under Settings → Sending. Cloudflare verifies domains, not individual
addresses. Use a dedicated subdomain for marketing so complaints do not damage
transactional reputation.

## Someone unsubscribed by mistake. Can I re-subscribe them?

Not by adding them again through a form or import. A public signup for an
existing address gains tags and metadata but keeps its status, so an
`unsubscribed`, `bounced` or `complained` row is never revived. That is the
suppression contract. Ask the person to use the same address and an operator
must decide outside the product whether a manual reset is appropriate.

## How do I change who can sign in?

Change `OWNER_EMAIL` on the Worker. That address is the owner slot; there is no
user table, no invitation and no second account. Changing it does not migrate
any data.

## Does deleting a template affect a sent campaign?

No. Campaigns freeze `ir_snapshot`, `metadata_snapshot` and `data_snapshot` at
schedule. A sent campaign and its `/p/<id>` web version keep rendering the
snapshot. Drafts that reference a deleted template must choose another one.

## Why did an automation not send?

Check, in this order:

- The automation is `active`, not draft, paused or archived.
- The subscriber is `subscribed`, not pending or suppressed.
- The trigger actually fired: tag, campaign click, new subscriber or event.
- A prior `exit` step or the end of the sequence was not already reached.
- The run log's next-step time has passed. Waits are evaluated by the cron sweep.

A replayed trigger cannot enrol the same subscriber twice for the same
automation version.

## Is Workers Paid required?

Yes for a real deployment. Queues and sending to arbitrary recipients are not on
the free plan. The SPA and docs site can be served on free Workers, but the
mailer needs the paid plan, D1, R2 and Queues.

## How do I test without sending email?

Locally there is no `send_email` binding. The adapter logs an `email_dev_sink`
event and returns a `dev-*` id, so dispatch, queue consumption, stats and
retries all work without a domain. Use the campaign **test** action on a real
deployment to check one address before scheduling.

## Can several teams share one install?

Not as separate tenants. Postwren is single-tenant by design: one owner, one
list, one set of credentials. Running it for two organisations means two
installs and two Workers.

## Where is the data, and how do I back it up?

Subscribers, campaigns, templates, runs and logs live in D1. Images live in R2.
Queues and KV hold in-flight work and OAuth grants, not the source of truth.
Back up D1 with `wrangler d1 export` and R2 with the normal bucket tooling.
