# Bounces and complaints

Cloudflare Email Sending publishes lifecycle events to a Cloudflare Queue. Postwren consumes that queue and folds terminal events into the same suppression state the rest of the app already uses.

## Setup

Wrangler creates the queues from `wrangler.jsonc`/`wrangler.dev.jsonc`. Subscribe the production queue to Email Sending events:

1. Cloudflare dashboard → **Queues** → `postwren-email-events`.
2. **Subscriptions** → **Subscribe to events**.
3. Source **Email Sending**, choose the sending domain, and select at least `message.bounced`, `message.complained` and `message.delivered`.
4. Leave the queue consumer to Postwren.

One subscription is scoped to one sending domain, so repeat this for every domain you send from. The Worker routes events by queue name; no extra binding is needed.

## What each event does

| Event                  | Effect                                                                                                                                   |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `message.complained`   | Subscriber becomes `complained`, active automation runs exit, recipient row becomes `complained`, `subscriber.complained` webhook fires. |
| `message.bounced` hard | Subscriber becomes `bounced`, active runs exit, recipient row becomes `bounced`, `subscriber.bounced` webhook fires.                     |
| `message.bounced` soft | Recorded in `email_events` only. Cloudflare retries these; a soft bounce is not a permanent suppression.                                 |
| `message.delivered`    | A recipient row moves from `sent` to `delivered`. Subscriber status is unchanged.                                                        |
| Other events           | Recorded in `email_events` for audit.                                                                                                    |

`message.bounced` with an exhausted soft retry is still soft; only `bounce.type === "hard"` changes the subscriber. This is the "try again vs never again" distinction without inventing a second classifier.

## Idempotency

Every event is written to `email_events` first. The Cloudflare `eventId` has a unique index, so a redelivered event changes nothing the second time: no duplicate subscriber transition and no duplicate webhook delivery. A failure retries the queue message; the successful write commits the event id first, so a partial side effect can be retried safely.

## Why this is not an ARF parser

Mailbox-provider feedback loops are handled by Cloudflare: it registers for the programs, validates the reports, and publishes `message.complained`. Postwren consumes the validated event. Building a second ARF mailbox parser would duplicate the vendor's job and add another moving part to operate.

## Relationship to Cloudflare suppression

Cloudflare keeps its own suppression list per sending domain or account and may reject a send with `E_RECIPIENT_SUPPRESSED` before Postwren reaches the queue. Postwren's `subscribers.status` is the application-level layer: it decides who enters a campaign audience or an automation, and it is the state shown in the UI and exported in CSVs. The two layers are complementary:

- Cloudflare protects the sending domain and stops mail even if Postwren asks for it.
- Postwren stops building audiences that include a suppressed person and records why.

A complaint creates a Cloudflare suppression and a Postwren `complained` status. A manual removal in Cloudflare does not automatically revive the Postwren row; that requires an explicit opt-in in the app, which is the safer direction.
