# beehiiv's backlog vs Postwren

> **Status (2026-11-09):** all four "worth taking" items are implemented: the public
> web version (`GET /p/:id`), optional double opt-in per subscribe key, disposable
> domain and MX hygiene, and signed outbound webhooks with a delivery log. The gap
> analysis below is unchanged.

> Beehiiv published a list of what a "weekend vibe-coded alternative" would have to
> match. Read as a compatibility checklist it is unwinnable. Read as a map of what
> beehiiv actually sells, it is mostly a description of four products plus an ops
> team. This document checks the list against the code as it stands, and separates
> "we should close this" from "this is someone else's business".

## The list is not one product

| Bucket                 | Examples from the tweet                                                                     | Who really owns it                                         |
| ---------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Sending operations     | delivery rate, IP warming, blocklists, feedback loops, bounce taxonomy, suppression, 3M/min | The ESP. For Postwren, Cloudflare Email Service.           |
| Authoring              | block editor, Outlook-safe HTML, merge tags, templates, previews                            | Postwren. This is the part worth owning.                   |
| Audience               | tags, segments, acquisition source, engagement history, imports                             | Postwren. Already the core model.                          |
| Growth machinery       | recommendations, ad network, referrals, boosts, paid recs                                   | beehiiv's marketplace. Not software you can copy.          |
| Commerce and community | paid tiers, products, webinars, podcast hosting, community, website builder                 | Separate products with separate vendors and support loads. |

The tweet's strongest point is the last paragraph: the operational half is not a
weekend. That is an argument for renting sending, not for building a monolith.

## What Postwren already does

Verified against the tree, not the README.

| Area                   | State                                                                                                                                                                                         |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Email rendering        | IR to table-only HTML with inline styles and MSO conditionals. Preview and send call the same `renderEmail`.                                                                                  |
| Editor                 | 17 block types, containers, nesting-aware drag and drop, saved blocks, five starters, media library, zoom, focus mode, searchable block library.                                              |
| Personalisation        | Merge tags with filters, sample subscriber preview, per-subscriber metadata, campaign and automation metadata.                                                                                |
| Templates              | Immutable revisions, restore, duplicate, render warnings, campaign pins a revision.                                                                                                           |
| Campaigns              | Draft, schedule, send now, pause, cancel, test send, audience preview, recipients, stats. Content freezes into `ir_snapshot` at send.                                                         |
| Delivery               | Idempotent per-recipient claim, queue retries, quota pauses the campaign instead of burning recipients, 30s retry and 3 attempts.                                                             |
| Compliance             | RFC 8058 one-click unsubscribe, signed single-purpose tokens, suppression at send time.                                                                                                       |
| Audience               | `tag:` and `meta:` query compiler, live count preview, CSV import/export, bulk tag/metadata/delete, per-subscriber activity.                                                                  |
| Automations            | Four triggers, six linear steps, draft/active/paused, frozen runs, run log, deliveries, idempotent enrolment.                                                                                 |
| Integrations           | Scoped REST keys, transactional email endpoint, `/api/v1/events`, public subscribe with origin allowlist and honeypot, MCP with 25 tools over OAuth.                                          |
| Deliverability tooling | Gmail clip byte warning, low-contrast and empty-document warnings, per-link click tracking, sender verification, read-only DNS/MX/SPF/DKIM/DMARC checks through an optional Cloudflare token. |
| Environments           | One Worker, one D1, one R2 bucket, two queues, cron, magic-link auth, no external services required.                                                                                          |

That is already more than "a form and a SendGrid key". The parts beehiiv's list
treats as table stakes for authoring and audience are present.

## Where we are deliberately thin

| Gap                                                                                                                    | Honest state                                                                                                                                                                            | Decision                                                                                                                 |
| ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Bounce and complaint ingestion                                                                                         | Errors are classified at send time into retry/rate/quota/account/permanent/content. There is no inbound bounce or complaint webhook, no hard/soft taxonomy, no 24-hour deferral window. | Rent it. Cloudflare owns the MTA and the feedback loops. Add ingestion only if Cloudflare exposes events we can consume. |
| Suppression layers                                                                                                     | One global layer via `subscribers.status`. No per-publication or transactional layer.                                                                                                   | Correct for a single-tenant product. A second layer is a multi-tenant feature.                                           |
| Bot protection                                                                                                         | Honeypot plus rate limits on public subscribe. No Turnstile, no click verification.                                                                                                     | Add optional Turnstile per subscribe key. Do not buy click verification.                                                 |
| Web version of a post                                                                                                  | Not present. The renderer produces HTML and text, not a public page.                                                                                                                    | Worth building. One route, same IR, real value.                                                                          |
| Double opt-in                                                                                                          | Not present. Public subscribe is idempotent and immediate.                                                                                                                              | Worth building as an option per subscribe key. Self-hosters need list hygiene more than beehiiv does.                    |
| Address hygiene                                                                                                        | No disposable/typo domain checks.                                                                                                                                                       | A small static list plus a DNS MX lookup covers most of it. Do not integrate ZeroBounce.                                 |
| Dynamic content and segments                                                                                           | One document per send. Metadata is rendered, not branched.                                                                                                                              | Later. Conditional blocks are a large editor feature.                                                                    |
| A/B testing                                                                                                            | Absent by design.                                                                                                                                                                       | Stays absent until the send path needs cohorts.                                                                          |
| Webhooks                                                                                                               | Inbound events only. No outbound subscription, signing or delivery log.                                                                                                                 | The best next integration feature, and cheaper than an automation canvas.                                                |
| Roles, teams, multi-publication                                                                                        | Single owner.                                                                                                                                                                           | Out of scope. That is the paid tier of a hosted product, not a self-hosted mailer.                                       |
| AI writer, audio, comments, attachments, custom HTML, site builder, commerce, community, podcast, ads, recommendations | Absent.                                                                                                                                                                                 | Not our problem. Each is a product with its own support load.                                                            |

## The part of the tweet that is wrong for us

The closing software bill lists twelve categories. Postwren collapses most of them
into the Cloudflare account it already deploys to:

| Tweet line item                               | Postwren                                                       |
| --------------------------------------------- | -------------------------------------------------------------- |
| Email sending (SendGrid, SES, Postmark)       | Cloudflare Email Service, through the `send_email` binding     |
| Web hosting (Vercel, AWS, Render)             | Workers, static assets served by the same Worker               |
| Database + queue (Supabase, Neon, RDS)        | D1 plus Queues                                                 |
| Media storage + CDN (S3, R2, Vercel Blob)     | R2, served from `/media/*`                                     |
| Bot protection (Cloudflare)                   | Same account, optional Turnstile                               |
| Auth (Clerk, Auth0, Supabase Auth)            | Built in: magic link and 6-digit code                          |
| Workflow engine (Inngest, Temporal, QStash)   | Cron sweep plus D1 rows. A wait is a row, not a timer          |
| Monitoring (Sentry, Datadog, PagerDuty)       | Workers logs and analytics. Sentry is optional, not required   |
| Email validation (ZeroBounce, Kickbox)        | Not replaced yet. The cheap 80% is a domain list and MX lookup |
| Email rendering tests (Litmus, Email on Acid) | Not replaced. Golden tests cover structure, not every client   |
| Payments, product analytics                   | Not part of the product                                        |

So the honest cost comparison is one Workers Paid plan plus metered sending against
$59/month plus add-ons, not "the same stack, cheaper". The saving is real but it is
not the point. The point is that a self-hoster can read the whole system, export the
data, and run it for the price of the mail they send.

## The four things worth taking from the list

1. **A public web version of every sent campaign.** Render the frozen `ir_snapshot`
   at a public URL, no editor involved. It turns every send into a shareable page and
   closes the "separate email and web versions" line with one route.
2. **Optional double opt-in on subscribe keys.** A `pending` status, a signed
   confirmation token, and a template. Off by default, on for public forms.
3. **Cheap address hygiene before insert.** Disposable-domain list plus an MX lookup
   at public subscribe. Reject obvious typos, do not pretend to be a validation
   vendor.
4. **Signed outbound webhooks.** `subscriber.created`, `campaign.sent`, bounce and
   unsubscribe events, with a delivery log and retries. This is the integration
   surface beehiiv has and we do not, and it fits the existing queue.

Everything else on the list is either already done, rented from Cloudflare, or a
different company.

## Positioning, in one paragraph

beehiiv is a media business with software attached: an ad network, a recommendation
network, payments, a website builder, a community and a support team. Postwren is the
smallest thing that owns the loop that matters: write an email that renders in
Outlook, pick an audience from your own data, send it through infrastructure you rent,
and see what happened. No seat pricing, no marketplace, no growth hacks, no lock-in.
The backlog to defend is not beehiiv's. It is: keep the renderer honest, keep the send
path idempotent, keep the data exportable, and stay deployable by one person.
