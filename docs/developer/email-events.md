# Bounces and complaints

Postwren folds terminal delivery events into one application-level suppression state, whichever provider sent the message. Every source normalises into the same `NormalizedEmailEvent` and calls `processEmailEvent`, so the policy below is shared.

## Sources

| Provider   | Transport        | Authentication                                                  | Events used                                                                                |
| ---------- | ---------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Cloudflare | Cloudflare Queue | Queue subscription                                              | `message.delivered`, `message.bounced`, `message.complained`                               |
| Resend     | HTTP webhook     | Signed (`webhook-id`, `webhook-timestamp`, `webhook-signature`) | `email.delivered`, `email.bounced`, `email.complained`, `email.failed`, `email.suppressed` |
| Postmark   | HTTP webhook     | Token in the URL                                                | `Delivery`, `Bounce`, `SpamComplaint`                                                      |
| SendGrid   | HTTP webhook     | Token in the URL                                                | `delivered`, `bounce`, `dropped`, `deferred`, `spamreport`                                 |
| Mailgun    | HTTP webhook     | Signed (`timestamp` + `token` HMAC)                             | `delivered`, `failed`, `complained`                                                        |

The active provider is selected in **Settings → Sending provider**. Each provider row owns an unguessable `webhook_token`, and its URL is `{APP_URL}/api/email-events/{provider}/{token}`. The token is shown in settings after the provider is saved. Token-only providers (Postmark, SendGrid) use it as the only authenticator, which is why it is long, random and never reused.

## Cloudflare setup

Wrangler creates the queues from `wrangler.jsonc`/`wrangler.dev.jsonc`. Subscribe the production queue to Email Sending events:

1. Cloudflare dashboard → **Queues** → `postwren-email-events`.
2. **Subscriptions** → **Subscribe to events**.
3. Source **Email Sending**, choose the sending domain, and select at least `message.bounced`, `message.complained` and `message.delivered`.
4. Leave the queue consumer to Postwren.

One subscription is scoped to one sending domain, so repeat this for every domain you send from.

## HTTP provider setup

1. In **Settings → Sending provider**, choose the provider, fill the fields it asks for, and save.
2. Copy the webhook URL shown in the Delivery events block.
3. Create a webhook at the provider and subscribe to the events in the table above.
4. For Resend and Mailgun, paste the signing secret into settings and save again. Their webhooks are rejected until the signature verifies.
5. Send the test email to confirm the credentials before scheduling a campaign.

Resend signs with the standard webhooks scheme: HMAC-SHA256 over `${webhook-id}.${webhook-timestamp}.${rawBody}`, base64 in `webhook-signature`. Mailgun signs `timestamp + token` with the webhook signing key and sends hex in `signature.signature`. Verification is local; nothing is processed before it succeeds. Mailgun's timestamp tolerance is 24 hours because retries reuse the original timestamp; the event id still makes a replay a no-op.

## Batching and pacing

The campaign queue claims a chunk of recipients, prefetches their subscribers, tags and metadata, renders each message once, and sends the chunk through the provider's batch endpoint when it has one. The chunk is capped at 100 messages even when a provider accepts more, to bound memory and invocation time. Resend and Postmark use their batch endpoints; Cloudflare, SendGrid and Mailgun send one message per request because their APIs do not return one message id per recipient.

Resend and Postmark also pace requests at a conservative default (`ratePerSecond` in the provider registry). A `429` stops the invocation, requeues the affected recipients with the provider's `Retry-After`, and leaves later chunks queued for the next attempt. Daily quota and account errors pause the campaign instead of burning attempts. Sequential providers rely on `429` and `Retry-After` rather than a client-side delay, so a large single-request chunk does not exceed the queue consumer's time budget.

## What each event does

| Event                                                                                                                                                                      | Effect                                                                                                                                   |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| complaint (`message.complained`, `email.complained`, `SpamComplaint`, `spamreport`, `complained`)                                                                          | Subscriber becomes `complained`, active automation runs exit, recipient row becomes `complained`, `subscriber.complained` webhook fires. |
| hard bounce (`bounce.type = hard`, Resend `Permanent`, Postmark `HardBounce`/`Blocked`/`ManuallyDeactivated`, Mailgun `severity = permanent`, SendGrid `bounce`/`dropped`) | Subscriber becomes `bounced`, active runs exit, recipient row becomes `bounced`, `subscriber.bounced` webhook fires.                     |
| soft bounce (`Transient`, `Undetermined`, `SoftBounce`, Mailgun temporary, SendGrid `deferred`)                                                                            | Recorded in `email_events` only. The provider already retries; a soft bounce is not a permanent suppression.                             |
| delivered                                                                                                                                                                  | A recipient row moves from `sent` to `delivered`. Subscriber status is unchanged.                                                        |
| failed or suppressed                                                                                                                                                       | Recorded in `email_events`. Recipient status is left alone because the provider may still retry.                                         |
| other                                                                                                                                                                      | Recorded in `email_events` for audit.                                                                                                    |

## Idempotency

Every event is written to `email_events` first. `event_id` is unique, so a redelivered event changes nothing the second time: no duplicate subscriber transition and no duplicate webhook delivery. Cloudflare supplies `payload.eventId`; Resend supplies the `webhook-id` header; Postmark uses its event `ID`; SendGrid uses `sg_event_id`; Mailgun uses `event-data.id`. A failure retries the queue message or returns a non-2xx, and the event id is committed before side effects, so a partial action can be retried safely.

`email_events.type` keeps the provider's own event name. `email_events.kind` holds the normalised vocabulary (`delivered`, `bounced`, `complained`, `failed`, `other`) the policy branches on. `email_events.provider` records which provider emitted it.

## Relationship to provider suppression

Each provider keeps its own suppression list and may reject a send before Postwren reaches it. Postwren's `subscribers.status` is the application-level layer: it decides who enters a campaign audience or an automation, and it is the state shown in the UI and exported in CSVs. The two layers are complementary:

- The provider protects the sending domain and stops mail even if Postwren asks for it.
- Postwren stops building audiences that include a suppressed person and records why.

A complaint creates a provider suppression and a Postwren `complained` status. A manual removal in the provider dashboard does not automatically revive the Postwren row; that requires an explicit opt-in in the app, which is the safer direction.
