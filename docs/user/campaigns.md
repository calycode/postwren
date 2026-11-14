# Campaigns

A campaign is a pinned template revision plus an audience, sender, schedule and
UTM values. It is the only object that sends to many recipients at once.

## Create a campaign

Campaigns → New asks for:

| Field                      | Notes                                                       |
| -------------------------- | ----------------------------------------------------------- |
| Name                       | Internal only; never shown to recipients                    |
| Template                   | The revision is pinned when the campaign is scheduled       |
| Subject                    | Can use merge tags                                          |
| From name                  | Display name                                                |
| From email                 | Must be a verified sending address in Settings → Sending    |
| Reply-to                   | Optional                                                    |
| Audience                   | Tag and metadata query; preview shows the match count       |
| Custom fields              | Rendered as `{{ campaign.meta.key }}`                       |
| Data                       | JSON lists for repeat blocks, for example `{ "posts": [] }` |
| UTM source/medium/campaign | Appended to tracked links                                   |

Content itself lives in the template. Editing the template after scheduling does
not change an in-flight campaign.

## Statuses and actions

| Status      | What it means                                          | Actions                        |
| ----------- | ------------------------------------------------------ | ------------------------------ |
| `draft`     | Editable, never dispatched                             | Save, schedule, send now, test |
| `scheduled` | Frozen, waiting for its time                           | Send now, cancel, test         |
| `sending`   | Dispatch and queue delivery in progress                | Pause, test                    |
| `paused`    | Quota or operator pause; queued recipients stay queued | Save, send now, cancel, test   |
| `sent`      | Every recipient reached a final state                  | Test                           |
| `cancelled` | No further recipients will be sent                     | Test                           |
| `failed`    | Dispatch failed before completion                      | Test                           |

Scheduling writes `ir_snapshot`, `metadata_snapshot` and `data_snapshot`.
Editing the template, campaign metadata or data afterwards cannot alter the
send.

## What the send does

1. The scheduler creates one recipient row per matched subscriber, each with its
   own `message_id`.
2. Recipients are claimed with a conditional `UPDATE ... WHERE status = 'queued'`.
   Replaying a queue batch therefore sends nothing twice.
3. The queue consumer renders the frozen snapshot per recipient, records opens
   and clicks through signed URLs, and delivers through Cloudflare Email
   Sending.
4. The whitespace-light HTML is built by the same renderer the preview uses.

Recipients are selected only when their status is `subscribed`. Pending,
unsubscribed, bounced, complained and deleted subscribers never enter the
recipient table.

## Daily quota

Cloudflare applies a per-domain daily sending quota. When it is exhausted the
campaign pauses with `E_DAILY_LIMIT_EXCEEDED` instead of failing each recipient.
Queued recipients stay queued. Raise the quota or wait for the reset, then
resume.

## Delivery and engagement

The campaign page reports:

- **Deliverability:** sent, bounced, failed, queued, total recipients.
- **Engagement:** open rate, unique opens, unique clicks, audience size.
- **Opt-out:** complaints and suppressed recipients.
- **Links and clicks:** per-URL counts with click timestamps.

Opens are approximate. Apple Mail Privacy Protection and corporate proxies
pre-fetch pixels, so an open can be recorded without a reader. Clicks are the
metric to trust.

## The web version

Every sent campaign has a public version at `/p/<campaign id>`, rendered from
the frozen snapshot. With a signed `?t=` token it shows the reader's own merge
tags and a working unsubscribe link; without one it is the anonymous, shareable
page. Drafts and in-flight campaigns return 404.

`{{ links.web }}` in a template becomes the signed, per-recipient URL at send
time. The web version does not include a tracking pixel.

## Test sends

The test action renders the campaign as it would send and delivers one copy to
the address you enter. It does not create recipient rows or change campaign
stats. Use it for Outlook, dark mode and link checks before scheduling.
