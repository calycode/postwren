# Automations

An automation is one trigger followed by a fixed, linear sequence of steps. It
has no branches, no canvas and no parallel paths. That is the scope, not a
temporary limitation.

## Triggers

| Trigger              | Fires when                                                       |
| -------------------- | ---------------------------------------------------------------- |
| `subscriber.created` | A new subscriber is written by the dashboard, CSV or public form |
| `tag.added`          | A named tag is added to a subscriber                             |
| `campaign.clicked`   | A recipient clicks a tracked link in a campaign                  |
| `api.event`          | A named event arrives at `POST /api/v1/events`                   |

The trigger configuration is validated when the automation is saved. A
`tag.added` automation needs a tag; `campaign.clicked` can narrow to a campaign
and a block link id; `api.event` needs an event name.

## Steps

| Step             | Effect                                                           |
| ---------------- | ---------------------------------------------------------------- |
| Wait             | Delay the next step by minutes, hours or days (maximum 365 days) |
| Send email       | Send a template, optionally with its own subject                 |
| Add tag          | Add a tag to the subscriber                                      |
| Remove tag       | Remove a tag                                                     |
| Set custom field | Write one metadata key and value                                 |
| Exit             | Stop the run                                                     |

A sequence holds at most 30 steps. Sends inside an automation are recorded as
automation deliveries, with their own message ids, not as campaign recipients.

## Enrolment

- Trigger-driven runs get a deterministic id from the automation, subscriber and
  version, so a replayed event cannot enrol the same person twice.
- Manual enrolment from the automation page gets a random id and does not
  require the trigger condition.
- A `pending` subscriber is not enrolled until the double opt-in confirmation
  post succeeds.
- Unsubscribed, bounced, complained and deleted subscribers are not enrolled.

## Runs and the run log

Each run stores the automation version, a frozen graph, the current step index
and the next due time. The run log records when it was queued, first started,
last ran and finished, plus steps executed and emails sent. Duration is derived
from those timestamps, not stored.

When you edit an automation, active runs keep their frozen graph. New runs use
the new version. Archiving an automation stops new enrolments; it does not
rewrite history.

## Events API

`POST /api/v1/events` accepts named events with `events:write`:

```sh
curl -X POST https://mail.example.com/api/v1/events \
  -H "authorization: Bearer $POSTWREN_KEY" \
  -H 'content-type: application/json' \
  -d '{
    "email": "ada@example.com",
    "event": "order.paid",
    "idempotencyKey": "order_1234",
    "properties": { "plan": "pro" }
  }'
```

The `(credential, idempotencyKey)` pair enrols at most once. Use a stable order
or event id, not a timestamp. Properties are capped at 16 KB.

The response does not reveal whether the address is on the list, and a failed
enrolment never turns a valid event into an error. The endpoint is rate limited
per credential and per email address.

## Failure handling

- Email steps retry through the queue with the same backoff as campaigns.
- A hard bounce or complaint exits the run and suppresses the subscriber.
- Pausing the automation stops new step execution; existing runs resume from
  their stored step index.
- A run that reaches an `exit` step, the end of the sequence, or a suppression
  is finished and does not restart.

## What is not here

No conditional branches, no random splits, no goal steps, no re-entry rules
beyond the deterministic trigger id, and no workflow canvas. If a flow needs a
branch, it belongs in two automations with different triggers.
