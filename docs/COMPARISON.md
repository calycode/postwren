# Postwren vs beehiiv's backlog

> Source: beehiiv's public thread listing what a "weekend vibe-coded alternative"
> would have to include, read on 9 November 2026. This is a product comparison,
> not a feature race. It records what the code does today and what we rent,
> narrow, or refuse to build.

Legend:

| Status   | Meaning                                                                       |
| -------- | ----------------------------------------------------------------------------- |
| **Ship** | Implemented in this repository.                                               |
| **Rent** | Deliberately delegated to Cloudflare; not our code and not our ops headcount. |
| **Thin** | Present, but narrower than the beehiiv line item.                             |
| **Skip** | Not this product. A separate company or a different roadmap.                  |

The canonical positioning narrative is [POSITIONING.md](POSITIONING.md). The raw
decision log is [research/beehiiv-backlog.md](research/beehiiv-backlog.md).

## 1. Deliverability and sending

| beehiiv's line item                                                                    | Postwren                                                                                                                                                                                                                                                                     |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 99.3% delivery rate, a team of deliverability experts, 3M+ emails/minute               | **Rent.** Cloudflare Email Service owns the MTA, IP reputation, domain authentication, feedback loops, blocklists and throughput. We do not claim a rate or a team. Our job is to avoid damaging the reputation we rent.                                                     |
| Validate every submission, block disposable/invalid/typo addresses                     | **Ship.** Syntax validation, disposable-domain list, provider-typo suggestions, and a production-only MX/A check that fails open.                                                                                                                                            |
| Automated bot detection, rate-limit every signup endpoint                              | **Ship.** Per-key origin allowlist, honeypot, per-IP rate limit, optional Turnstile with server-side siteverify.                                                                                                                                                             |
| Register for feedback programs, ingest feedback loops, build suppression lists         | **Rent + Ship.** Cloudflare registers and validates the feedback loops, then publishes `message.complained` and `message.bounced`. We consume those events and update the subscriber.                                                                                        |
| Classify bounces into hard/soft/mailbox full/DNS and know "try again" vs "never again" | **Thin.** Cloudflare classifies and retries. We apply the terminal result: hard bounce → `bounced`, complaint → `complained`, soft bounce → audit log only.                                                                                                                  |
| Three suppression layers: global, per-publication, transactional                       | **Thin by design.** One application-level state, `subscribers.status`, gates every campaign, automation and transactional send. Cloudflare adds its own account/domain suppression list underneath. Per-publication layers matter only when there are multiple publications. |
| Temporary suppressions that expire, permanent ones that never do                       | **Rent.** Cloudflare handles temporary soft-bounce suppressions and expiry. We keep the permanent application state.                                                                                                                                                         |
| One-click unsubscribe, List-Unsubscribe                                                | **Ship.** RFC 8058 headers, signed single-purpose token, POST endpoint.                                                                                                                                                                                                      |
| Warming new IPs and domains                                                            | **Rent.** Cloudflare.                                                                                                                                                                                                                                                        |
| Watching blocklists and pulling IPs from rotation                                      | **Rent.** Cloudflare.                                                                                                                                                                                                                                                        |
| Retrying deferred mail for 24+ hours                                                   | **Rent.** Cloudflare retries with backoff; the result reaches us as a delivered/bounced event.                                                                                                                                                                               |
| Multiple sender addresses                                                              | **Ship.** Sender registry, verified/default address, per-campaign from/reply-to.                                                                                                                                                                                             |
| Custom domain aligned with DKIM, SPF and DMARC                                         | **Rent + Ship.** Cloudflare verifies and sends. Settings can read zones and flag missing records with an optional read-only token; it never edits DNS.                                                                                                                       |
| Filtering bot clicks from reports                                                      | **Thin.** Clicks are signed per recipient and per link, which removes the easy forged clicks. We do not buy a third-party click-verification service.                                                                                                                        |

## 2. Authoring and the editor

| beehiiv's line item                                                             | Postwren                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A true WYSIWYG editor                                                           | **Ship, with a boundary.** A block editor, not a freeform canvas. The preview and the sent message come from the same `renderEmail` call, so what you see is what goes out.                                                |
| Table-based, inline-styled email HTML that survives Outlook                     | **Ship.** Table-only markup, inline styles, MSO conditionals. No flex, no div layout, no `max-width` outside the root table.                                                                                               |
| Real-time collaborative editing                                                 | **Skip.** Single-owner product.                                                                                                                                                                                            |
| Comment threads in the draft                                                    | **Thin.** Per-block notes with open/done state and outline counts. Not multi-user threads.                                                                                                                                 |
| Dynamic content, different sections per reader                                  | **Skip.** One frozen document per send.                                                                                                                                                                                    |
| Separate email and web versions from one draft                                  | **Ship.** Every sent campaign has `/p/<id>`; `{{ links.web }}` produces a signed per-recipient URL with that reader's merge tags and unsubscribe link. Without the token the same page is the anonymous shareable version. |
| Free and premium versions split by a paywall                                    | **Skip.** No billing or paywall.                                                                                                                                                                                           |
| Merge tags and a simulated subscriber preview                                   | **Ship.** Merge tags, filters, sample context, campaign preview, per-recipient delivery context.                                                                                                                           |
| Templates with saved colors, fonts, spacing and a default style                 | **Ship.** Starters, document settings, immutable revisions, restore, duplicate.                                                                                                                                            |
| Columns, tables, buttons, blockquotes, sections, attachments, table of contents | **Ship:** columns, tables, buttons, quotes, sections, dividers, images, galleries, avatars, lists, code, links, markdown. **Skip:** attachments and table-of-contents anchors.                                             |
| Native embeds for X, YouTube, TikTok, Instagram, Bluesky, Stocktwits, podcasts  | **Skip.** Social blocks link out. No third-party embed runtime in email.                                                                                                                                                   |
| Polls, referral blocks, recommendations, ad slots                               | **Skip.** Marketplace and growth products.                                                                                                                                                                                 |
| AI writer, AI images, AI agent                                                  | **Skip.**                                                                                                                                                                                                                  |
| Images resized and optimized automatically                                      | **Thin.** Upload to R2, choose a display width; no image-resizing pipeline.                                                                                                                                                |
| Live email-size gauge that warns before Gmail clips                             | **Ship.** The renderer emits `message_too_large` above 102,400 bytes; the editor toolbar shows the live byte count and the warning.                                                                                        |
| Custom HTML blocks, cleaned                                                     | **Skip.** The IR is the safety boundary.                                                                                                                                                                                   |
| Hiding video/iframes/audio in email while keeping them on the web               | **Skip.**                                                                                                                                                                                                                  |
| Clickable Outlook links, vertical alignment in columns                          | **Ship / Thin.** The renderer avoids links wrapped around tables. Column vertical alignment is not a first-class control.                                                                                                  |
| Audio versions, inline audio                                                    | **Skip.**                                                                                                                                                                                                                  |
| Random cohort sends                                                             | **Skip.**                                                                                                                                                                                                                  |
| Slash commands, markdown, keyboard shortcuts                                    | **Thin.** Markdown block, undo/redo, keyboard reorder, searchable block library. No slash command palette.                                                                                                                 |
| Paste from Google Docs, search and replace                                      | **Skip.**                                                                                                                                                                                                                  |
| Footnotes and citations                                                         | **Skip.**                                                                                                                                                                                                                  |
| Code blocks                                                                     | **Ship.**                                                                                                                                                                                                                  |
| AI rewrite, translate, spelling                                                 | **Skip.**                                                                                                                                                                                                                  |
| Autosave                                                                        | **Ship.** Two-second debounce, serialized saves, flush on page hide and unmount, explicit save bumps the revision.                                                                                                         |
| Subject-line A/B testing                                                        | **Skip.**                                                                                                                                                                                                                  |
| Drag-and-drop images from computer, library or URL                              | **Ship.** Upload, media library and URL field.                                                                                                                                                                             |
| Rich-text captions, image titles and alt text                                   | **Thin.** Alt text and avatar captions; image captions/titles are not a block field.                                                                                                                                       |
| File attachments, inline audio                                                  | **Skip.**                                                                                                                                                                                                                  |
| Sections with backgrounds, borders and spacing                                  | **Ship.**                                                                                                                                                                                                                  |
| Blockquotes with custom borders/colors                                          | **Ship.** Border colour and type styling are exposed.                                                                                                                                                                      |
| Dividers that render everywhere                                                 | **Ship.**                                                                                                                                                                                                                  |
| Autosave, closed tab safety                                                     | **Ship.**                                                                                                                                                                                                                  |

## 3. Audience, segments and personalization

| beehiiv's line item                                                | Postwren                                                                                                                                                                                         |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Acquisition source on every subscriber                             | **Ship.** `source`, `source_url`, subscribe key, public form provenance.                                                                                                                         |
| Engagement history for every reader across every post              | **Ship.** Per-subscriber activity: sends, opens, clicks, timeline.                                                                                                                               |
| Tagging subscribers from your own app                              | **Ship.** Scoped API, public subscribe tags, bulk tag.                                                                                                                                           |
| Custom fields on any subscriber                                    | **Ship.** `subscriber_metadata`, reserved-key rules, `meta:key=value` audience filters.                                                                                                          |
| Segments built on behavior, attributes and engagement              | **Thin.** Audience queries support tags and metadata, not opens/clicks or saved segment objects.                                                                                                 |
| Dynamic and static segments                                        | **Skip.** The query is stored on the campaign or automation; there is no segment resource to reuse.                                                                                              |
| Recalculating a segment, excluding one, adding a whole segment     | **Thin.** Live audience count and tag/meta exclusions; no segment objects.                                                                                                                       |
| Multiple newsletter lists in one publication                       | **Skip.** One audience per workspace.                                                                                                                                                            |
| Exporting any segment                                              | **Ship.** CSV export of the current subscriber set.                                                                                                                                              |
| Webhooks for new/confirmed/deleted subscribers and campaign events | **Ship.** `subscriber.created`, `confirmed`, `updated`, `unsubscribed`, `bounced`, `complained`, `deleted`, `campaign.scheduled`, `campaign.sent`, `webhook.test`. Not every beehiiv event type. |

## 4. API, MCP and integrations

| beehiiv's line item                                                       | Postwren                                                                                                                                                                                          |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| REST API for subscribers, posts, segments, automations                    | **Ship for our model.** Subscribers, campaigns, templates, tags, media, transactional email, events, webhooks, audience preview. No segment resource; automations are REST but not MCP tools yet. |
| Send API to create and send newsletters                                   | **Ship.** Draft, schedule, send now, pause, cancel, test send.                                                                                                                                    |
| Create, update, delete subscribers and custom fields in real time         | **Ship.**                                                                                                                                                                                         |
| Read opens, clicks and engagement for every post                          | **Ship.** Campaign stats, top links, recent clicks, subscriber activity.                                                                                                                          |
| Post HTML for free/premium, email/web                                     | **Thin.** Email and web HTML exist; no premium split.                                                                                                                                             |
| Create a post from a template, append/prepend content                     | **Thin.** Create/update a template or campaign; no append/prepend operation.                                                                                                                      |
| Fetch segments and every subscriber in them                               | **Thin.** Audience preview; no persisted segments.                                                                                                                                                |
| Manage tiers, premium subscriptions, referrals, polls, surveys            | **Skip.**                                                                                                                                                                                         |
| Pagination across millions, rate limits, revocable API keys               | **Ship / Thin.** Cursor pagination, per-scope rate limits, revocable keys, D1 scale rather than a warehouse.                                                                                      |
| MCP server so Claude, ChatGPT and other tools can work inside the product | **Ship.** OAuth 2.1 + PKCE, DCR/CIMD, 25 tools over `/mcp`: tags, subscribers, campaigns, templates, previews, stats. No automation or webhook tools yet.                                         |
| AI drafting/editing/segment building                                      | **Skip.**                                                                                                                                                                                         |
| Native integrations with Linktree, HubSpot, ManyChat, Meta                | **Thin.** Generic REST, webhooks and MCP instead of a connector catalogue.                                                                                                                        |

## 5. Automations

| beehiiv's line item                                                   | Postwren                                                                                                                                |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Visual no-code automation builder                                     | **Thin.** A linear builder with drag reorder and a frozen graph per run. No branching canvas.                                           |
| Triggers: signup source, behavior, purchases, engagement              | **Thin.** `subscriber.created`, `tag.added`, `campaign.clicked`, `api.event`; entry query filters the subscriber. No purchase triggers. |
| Welcome sequences, delays, wait steps                                 | **Ship.**                                                                                                                               |
| Branching, reusable condition sets                                    | **Skip / Thin.** Entry queries and tag steps, but no branch steps or shared condition library.                                          |
| Email steps in the same editor                                        | **Ship.**                                                                                                                               |
| Webhook steps with retries                                            | **Thin.** Global signed event webhooks with retries, not a step inside an automation.                                                   |
| Per-subscriber journey tracking, opens/clicks per flow, draft vs live | **Ship.** Run history, deliveries, frozen versions.                                                                                     |
| Purchase delivery and follow-ups                                      | **Skip.**                                                                                                                               |

## 6. Website, growth, commerce, community and podcast

These are complete products inside beehiiv. They are **Skip** for Postwren, not gaps
to close one by one:

- no-code/AI website builder, custom pages, redirects, robots.txt, SEO, pop-ups
- ad network, sponsor marketplace, paid recommendations, referral network
- paid subscriptions, tiers, gifts, group subscriptions, products, coupons, payouts
- webinars, ticketing, live streaming, coaching bookings
- community channels, DMs, moderation, roles
- podcast hosting, distribution, transcripts, private feeds

The reason is in the positioning document: each one has its own support load,
vendor relationships and product surface. Building them would turn a mailer into
the thing it is trying to avoid.

## 7. Team, roles and multi-publication

| beehiiv's line item                                             | Postwren                                                                              |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Admin/member/contributor roles, workspace and publication roles | **Skip.** One owner account.                                                          |
| Multiple publications under one workspace, workspace grouping   | **Skip.** One publication per deployment.                                             |
| Multiple authors, bylines, guest authors, author profiles       | **Skip.**                                                                             |
| Real-time collaboration, comment threads, access removal        | **Thin.** Block notes are single-user; no roles.                                      |
| Publication transfers, magic-link login                         | **Ship (login) / Skip (transfer).** Magic link plus six-digit code; no transfer flow. |

## 8. What the tweet gets right

1. **Deliverability is operations, not a library.** Feedback loops, blocklists,
   IP warming and bounce classification are years of vendor work. Renting them is
   the only honest option for a small team.
2. **Suppression is the product.** A send path that ignores complaints is not a
   newsletter tool.
3. **The editor edge cases are endless.** Outlook, Gmail clipping, dark mode,
   image sizing and link wrapping are not a weekend.
4. **The software bill is real.** Stitching together five vendors is a second
   product to operate.

## 9. What the tweet gets wrong for this project

1. **It describes four products and an ops team, then calls it a backlog.** A
   comparison that treats an ad network and a table block as peer items cannot
   guide a small product.
2. **It assumes replacement is the goal.** Postwren is not trying to be the same
   company for the same customer. It is trying to be the part a technical
   operator can own.
3. **It counts rented infrastructure as missing.** Email Service, Workers, D1,
   R2, Queues and Turnstile are one account. That is the design, not a gap.
4. **The $59 framing is half right.** It ignores the cost of running the stack,
   but it also ignores that we rent sending. The honest claim is one platform bill
   plus metered email, not "the same thing for free".

## 10. The stack economy

| beehiiv's line item                           | Postwren                                      |
| --------------------------------------------- | --------------------------------------------- |
| Email sending (SendGrid, SES, Postmark)       | Cloudflare Email Service through `send_email` |
| Web hosting (Vercel, AWS, Render)             | Workers plus static assets                    |
| Database and queue (Supabase, Neon, RDS)      | D1 plus Queues                                |
| Auth (Clerk, Auth0, Supabase Auth)            | Built-in magic link and six-digit code        |
| Workflow engine (Inngest, Temporal, QStash)   | Cron sweep plus D1 rows                       |
| Media storage and CDN (S3, R2, Vercel Blob)   | R2, served from `/media/*`                    |
| Bot protection (Cloudflare)                   | Same account, optional Turnstile              |
| Monitoring (Sentry, Datadog, PagerDuty)       | Workers logs and analytics; Sentry optional   |
| Email validation (ZeroBounce, Kickbox)        | Static list plus DoH MX/A check               |
| Email rendering tests (Litmus, Email on Acid) | Golden renderer tests; not every client       |
| Payments, product analytics                   | Not part of the product                       |

## 11. Gaps worth closing, in order

1. **Subject-line A/B testing.** Small and confined to the send path; it does not
   change the model.
2. **Saved segments as first-class resources.** The query compiler already exists;
   this is persistence and reuse, not new semantics.
3. **Per-mailbox-provider deliverability stats.** Cloudflare events can be
   aggregated by recipient domain; the data is already arriving.
4. **Automation MCP tools.** The REST routes exist; the MCP surface stops short.
5. **Attachments and audio.** Only if the audience actually needs them.
6. **Conditional/dynamic blocks.** A large editor change; do it only when a real
   user has a repeated use case.
7. **Multi-publication and roles.** A hosting feature. Not a self-hosted feature.
8. **Native embeds.** Nice, but every embed is a client-compatibility liability.

## 12. When to choose beehiiv instead

Choose beehiiv when the newsletter is a media business: ads, paid recommendations,
paid subscriptions, commerce, community, podcast, webinars, a non-technical team,
and someone else on call for deliverability.

Choose Postwren when the newsletter is a product surface: one publication, a
technical operator, data ownership, API/MCP access, and a preference for one
deployable unit over a suite.
