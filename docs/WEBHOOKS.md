# Webhooks

Outbound webhooks are signed, retried and logged. Manage them under **Settings → Webhooks** or through `/api/v1/webhooks` with an API key that has `webhooks:read` / `webhooks:write`.

## Create an endpoint

```sh
curl -X POST https://postwren.example.com/api/v1/webhooks \
  -H 'content-type: application/json' \
  -H 'cookie: sid=...; csrf=...' \
  -H 'x-csrf-token: ...' \
  -d '{
    "url": "https://example.com/hooks/postwren",
    "description": "CRM sync",
    "events": ["subscriber.created", "subscriber.confirmed", "campaign.sent"]
  }'
```

The response contains the signing secret **once**:

```json
{
   "data": {
      "id": "whk...",
      "url": "https://example.com/hooks/postwren",
      "events": ["subscriber.created", "subscriber.confirmed", "campaign.sent"],
      "enabled": true,
      "secret": "whsec_..."
   },
   "error": null
}
```

Only HTTPS URLs are accepted.

## Events

| Event                     | When                                                       |
| ------------------------- | ---------------------------------------------------------- |
| `subscriber.created`      | A new row is written by the public form, dashboard or CSV. |
| `subscriber.confirmed`    | A double opt-in link is posted and the row becomes active. |
| `subscriber.updated`      | Name, email or metadata changes from the dashboard.        |
| `subscriber.unsubscribed` | A one-click unsubscribe is posted.                         |
| `subscriber.bounced`      | Cloudflare reports a hard bounce or exhausted soft bounce. |
| `subscriber.complained`   | Cloudflare reports a validated spam complaint.             |
| `subscriber.deleted`      | One or more rows are soft-deleted.                         |
| `campaign.scheduled`      | A campaign is pinned to an audience and scheduled.         |
| `campaign.sent`           | The last recipient finishes and the campaign completes.    |
| `webhook.test`            | The Test button on an endpoint.                            |

A delivery body is a small envelope:

```json
{
   "id": "whd...",
   "event": "subscriber.created",
   "created_at": 1767225600,
   "data": {
      "id": "sub...",
      "email": "ada@example.com",
      "first_name": "Ada",
      "last_name": "Lovelace",
      "source": "public_subscribe",
      "tags": ["newsletter"]
   }
}
```

## Verify the signature

Every request carries:

```
X-Postwren-Event: subscriber.created
X-Postwren-Delivery: whd...
X-Postwren-Signature: t=1767225600,v1=<hex>
```

The signed string is `<t>.<raw request body>`, HMAC-SHA-256 with the endpoint secret. Compare in constant time and reject timestamps outside a short window to block replays.

```ts
import { createHmac, timingSafeEqual } from 'node:crypto';

function verify(secret: string, header: string, rawBody: string): boolean {
   const [timestampPart, signaturePart] = header.split(',');
   const timestamp = Number(timestampPart?.replace('t=', ''));
   if (!Number.isFinite(timestamp) || Math.abs(Date.now() / 1000 - timestamp) > 300) return false;

   const expected = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
   const provided = signaturePart?.replace('v1=', '') ?? '';

   return (
      provided.length === expected.length &&
      timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
   );
}
```

## Delivery and retries

A delivery is written before the HTTP request, then sent by the cron sweep, so a slow receiver never delays a signup or a send. The first attempt happens within a minute.

| Attempt | Delay before it        |
| ------- | ---------------------- |
| 1       | immediately            |
| 2       | 1 minute               |
| 3       | 5 minutes              |
| 4       | 30 minutes             |
| 5       | 2 hours                |
| 6       | 6 hours, then terminal |

`2xx` is success. `429`, `5xx`, and network failures are retried. Other `4xx` responses fail immediately. The endpoint card and `GET /api/v1/webhooks/:id/deliveries` show the status, attempt count, response code and error for every delivery. `POST /api/v1/webhooks/deliveries/:id/retry` resets a terminal failure and attempts it immediately.

Disabling an endpoint stops new deliveries and pauses pending ones without deleting the history.
