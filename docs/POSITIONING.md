# Positioning

## One line

**Postwren is the newsletter stack you can own: a real email editor, your audience,
and Cloudflare's sending infrastructure in one deployable Worker.**

## The category

Postwren is not a beehiiv clone and not a SendGrid wrapper. The category is
**owned newsletter infrastructure**: the authoring and audience layer belongs to
you, the deliverability layer is rented from a specialist, and the whole thing is
small enough for one person to read, deploy and maintain.

That distinction decides every roadmap question. If a feature makes the loop
better and one operator can keep it running, it is in scope. If it is a
marketplace, a media business, or an ops team in software form, it is not.

## The problem

Newsletter SaaS grew into media companies. beehiiv bundles an ad network, a
recommendation network, payments, a website builder, a community, podcast
hosting, webinars and a support organisation. That is rational for a business
selling to publishers, but it means the editor, the audience and the data are a
tenant inside someone else's platform.

The self-hosted alternative is usually fragments: an editor library, a sending
API, a queue, a database, a bounce handler and a suppression list, stitched
together and left for the operator to keep alive. The parts that make email
hard — rendering, consent, suppression, retries, idempotency — are exactly the
parts the fragments leave out.

Postwren is the middle: one product that owns the loop that matters, with the
unavoidably operational parts delegated to infrastructure that already does them
well.

## The bet

**Rent deliverability. Own the loop.**

Cloudflare Email Service owns the MTA, IP reputation, domain authentication,
feedback loops, blocklists and throughput. Postwren owns the document, the
editor, the audience, the campaign, the consent state and the integration
surface. When Cloudflare publishes a bounce or a complaint, Postwren consumes it
and keeps the application's suppression state honest.

The bet is that a small team should not rebuild an email operations department,
and should not rent the authoring and audience layer from a company whose
business is advertising and growth. Each side does what it is good at.

## Who it is for

- A technical founder, operator or small team running **one newsletter**.
- Someone who already has a Cloudflare account, or is comfortable creating one.
- Teams that want the subscriber list, the template IR and the analytics in their
  own database, exportable at any time.
- Products that need email as an API and an agent surface, not only a dashboard.
- People who prefer a block editor that renders real email HTML over a page
  builder that pretends email is a browser.
- Budget-conscious operators who would rather pay for mail than for seats.

## Who it is not for

- A publisher whose revenue depends on beehiiv's ad network or recommendation
  marketplace.
- A team that needs a no-code website, paid subscriptions, products, community,
  podcast hosting and webinars in one bill.
- A non-technical operator who wants a support team on call for deliverability.
- A multi-publication media group with roles, contributors and transfers.
- Anyone who needs enterprise-scale list management beyond D1's comfort zone.

Saying this clearly is part of the product. A small product that pretends to be a
suite becomes a bad suite.

## The five promises

1. **The email you see is the email that sends.** One pure renderer produces the
   editor preview and the sent message. Table-only HTML, inline styles, MSO
   conditionals. No separate "export" path that drifts.
2. **Your audience is yours.** Subscribers, tags, metadata, campaigns, templates
   and versions live in D1. CSV export and scoped APIs are first-class, not a
   retention tactic.
3. **One deployable unit.** Worker, D1, R2, Queues, Cron, static assets. No
   container fleet, no second control plane, no separate auth vendor.
4. **The operational parts are honest.** Idempotent sends, resumable dispatch,
   per-recipient claims, queue retries, one-click unsubscribe, complaint and hard
   bounce ingestion, optional double opt-in and Turnstile.
5. **Integrations are not an afterthought.** Scoped REST keys, transactional
   email, webhooks with signatures and retries, and an OAuth-protected MCP server
   for agent clients.

## What we deliberately do not build

- An ad network, sponsor marketplace or paid recommendation network.
- Paid subscriptions, products, coupons, payouts or a storefront.
- A website builder, landing-page builder or link-in-bio product.
- Community channels, DMs, moderation or social features.
- Podcast hosting, distribution, transcripts or private feeds.
- Webinars, ticketing or coaching bookings.
- Real-time multi-user editing, roles, contributors or multi-publication
  workspaces.
- AI copywriting, AI images or an in-product chat agent.
- A Litmus-style client lab or a third-party click-verification bill.

Each of these is a product with its own support load. None of them makes the core
loop better for the operator we are building for.

## How it compares

### Against beehiiv

beehiiv is a media business with software attached. Postwren is software you
deploy. The overlap is the core loop: write, choose an audience, send, measure.
The difference is what surrounds it: marketplace, commerce, community and a
support organisation versus one Worker, your data and a bill you can predict.

Choose beehiiv for the business suite. Choose Postwren when the newsletter is a
product surface you want to own.

### Against Resend or Loops

They are excellent sending APIs with a dashboard and, increasingly, a broadcast
editor. Postwren differs in ownership and shape: self-hosted, one Cloudflare
account, an IR renderer you can publish and test independently, audience queries
you can inspect, and an MCP server over the same REST model. It is narrower in
polish and wider in control.

### Against the DIY stack

A DIY stack is an editor library, a sender, a database, a queue, an auth vendor,
a bounce handler, a suppression list and a cron job. Postwren is that stack with
the seams already joined: the renderer and preview agree, the send path is
idempotent, the suppression state is shared, and the API and MCP server speak the
same model.

## The cost story

One Cloudflare Workers Paid plan plus metered email sending. No per-seat pricing,
no separate database bill, no separate queue bill, no auth vendor, no media CDN
bill, no workflow engine. Optional costs stay optional: a custom domain, a
Turnstile widget, Sentry if you want it.

Do not sell this as "free". Selling mail has a cost, and Cloudflare charges for
it. The promise is **one predictable platform bill and no seat tax**, not zero
marginal cost.

## Voice and messaging

The voice is plain, technical and calm. Small bird, loud voice. No growth-hack
language, no "supercharge", no fake urgency. Explain the trade-off and let the
reader decide.

### Short lines

- The newsletter stack you can own.
- Write it, send it, keep the list.
- One Worker. Your audience. Cloudflare's mail.
- A real email editor, not a page builder.
- Rent deliverability. Own the loop.

### Boilerplate

> Postwren is a self-hosted newsletter platform for one publication. It pairs a
> block editor that renders Outlook-safe email with tag- and metadata-based
> audiences, scheduled campaigns, linear automations, signed webhooks and an
> MCP/API surface. It runs on a single Cloudflare Worker with D1, R2 and Queues;
> sending is delegated to Cloudflare Email Service. MIT licensed.

### Objection handling

**"Is it a beehiiv replacement?"**
No. It replaces the part of beehiiv a technical operator can own: authoring,
audience, sending workflow and data. It does not replace the ad network,
commerce, community or support organisation.

**"Is deliverability safe without a deliverability team?"**
Cloudflare owns the MTA, authentication, feedback loops, blocklists and
suppression. Postwren consumes the resulting bounce and complaint events and
keeps the application-level suppression state correct. You still have to send
to people who asked for it; no vendor can fix that.

**"Can I migrate?"**
Subscribers import from CSV with tags and metadata. Templates are a portable IR
and a JSON API. Campaign history and analytics are in D1 and exportable. The
renderer is a separate package, so the email layer does not depend on the app.

**"What happens when I outgrow it?"**
The honest answer is that D1 and a single Worker have a ceiling. The data is
exportable and the sending layer is already a vendor, so moving the audience or
the send path is possible. If you need a media marketplace, you are no longer the
target user.

**"Why Cloudflare?"**
Because one account already provides compute, storage, queues, cron, media and
sending. The alternative is five vendors and five bills for the same loop.

## Roadmap filter

A feature earns a place only if it passes all four:

1. **Does it deepen the core loop?** Write → audience → send → understand.
2. **Can one person operate it?** No new control plane, no on-call rotation.
3. **Can the data leave?** No feature whose value depends on holding data hostage.
4. **Does it rent rather than rebuild?** Use the vendor for commodity operations;
   own the parts that make the product distinct.

Things that pass: A/B subject tests, saved segments, per-provider deliverability
stats, automation MCP tools, a public archive index, better editor accessibility.
Things that fail: an ad network, a page builder, a payments stack, a community, a
podcast host, a roles matrix.

## Proof points

- One Worker, one D1 database, one R2 bucket, two primary queues (campaigns and
  Email Sending events), one cron.
- 17 block types, table-only renderer, preview/send parity.
- Immutable template revisions, restore, autosave, block notes.
- Tag and metadata audience queries compiled to parameterised SQL.
- Idempotent per-recipient sends, resumable dispatch, queue retries.
- RFC 8058 unsubscribe, optional double opt-in, Turnstile.
- Cloudflare Email Sending bounce/complaint ingestion.
- Signed webhooks with retry backoff and a delivery log.
- Scoped REST keys, transactional email, and 25 MCP tools over OAuth.
- MIT licence; self-hosted; no seat pricing.

## Positioning statement

For technical operators running one newsletter, Postwren is the self-hosted email
platform that owns the authoring and audience loop while renting deliverability
from Cloudflare. Unlike beehiiv, it does not sell a media business, a marketplace
or a support organisation. Unlike a DIY stack, the renderer, send path,
suppression state and API already agree with each other. One Worker, your data,
and a bill you can explain.
