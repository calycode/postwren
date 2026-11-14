# Getting started

## Sign in

Postwren has one owner account, fixed by the `OWNER_EMAIL` variable on the
Worker. Enter that address on the sign-in screen. You receive a magic link and a
six-digit code in the same email; either one signs you in, and both consume the
same single-use row.

The first sign-in must use the configured address. There is no self-service
sign-up and no invitation flow.

### Local development

On a local Worker, no email is sent. After requesting a sign-in, the response
and the **Development mode** panel show the six-digit code and the magic-link
token. Use the address from `OWNER_EMAIL`; the default is `dev@example.com`.

## Before your first campaign

Three things must be true before a campaign can send:

1. **A sending domain is configured.** Open Settings → Sending, add the address
   you will send from, and mark it verified once Cloudflare has onboarded the
   domain. Campaigns can only use verified addresses.
2. **`APP_URL` is set.** The queue consumer has no request, so it cannot infer
   the public origin. Without `APP_URL` a campaign answers `app_url_missing`
   when scheduled. A bare host such as `mail.example.com` is accepted and
   assumed to be HTTPS.
3. **The list has at least one subscribed recipient.** Pending, unsubscribed,
   bounced, complained and deleted rows are excluded from every audience.

## A first send, step by step

1. **Create a template.** Templates → New. Pick a starter or start from an empty
   document. Add blocks, write a subject, and save.
2. **Add subscribers.** Subscribers → Add subscriber for one, or Import for a
   CSV. Add a tag such as `newsletter` so the audience has something to target.
3. **Preview the audience.** Campaigns → New, then type the audience query:
   `tag:newsletter`. The dialog previews how many subscribers match.
4. **Fill the campaign.** Name, subject, from name, from address, reply-to, UTM
   values. Content comes from the pinned template revision.
5. **Send a test.** The campaign page has a test action that delivers one copy
   to an address you choose.
6. **Schedule or send now.** Scheduling freezes the content and metadata
   snapshot. Sending now starts the dispatch immediately.
7. **Watch the campaign.** The campaign page reports queued, sent, failed,
   opens and clicks. Opens are approximate; clicks are the reliable signal.

## What happens after the send

- Every sent campaign gets a public web version at `/p/<campaign id>`, rendered
  from the frozen snapshot.
- The unsubscribe link is a signed, single-purpose token that supports RFC 8058
  one-click unsubscribe.
- If Cloudflare reports a hard bounce or a spam complaint, the subscriber is
  suppressed everywhere and exits active automations.
- A daily quota failure pauses the campaign instead of failing recipients. Raise
  the limit, then resume.

## Where to go next

- [Subscribers and tags](subscribers.md) for list hygiene and audience grammar.
- [Templates and the editor](templates.md) for blocks, revisions and repeat
  collections.
- [Campaigns](campaigns.md) for scheduling, statuses and stats.
- [Settings](settings.md) for sending domains and keys.
