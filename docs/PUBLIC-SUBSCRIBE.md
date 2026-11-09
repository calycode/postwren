# Public subscribe endpoint

`POST /api/public/subscribe` lets a marketing site, a static page, or a framework action add a subscriber without a session. It is the only unauthenticated write path.

## 1. Create a subscribe key

In the admin UI open **Settings → Public subscribe keys**, or call the API with an owner session:

```sh
curl -X POST https://postwren.example.com/api/v1/subscribe-keys \
  -H 'content-type: application/json' \
  -H 'cookie: sid=...; csrf=...' \
  -H 'x-csrf-token: ...' \
  -d '{
    "name": "Marketing site",
    "allowedOrigins": ["https://example.com"],
    "defaultTags": ["newsletter"],
    "requireConfirmation": true
  }'
```

The response contains the publishable secret **once**:

```json
{
   "data": {
      "id": "sk_...",
      "name": "Marketing site",
      "prefix": "pk_live_ab12cd34",
      "key": "pk_live_ab12cd34...",
      "allowed_origins": ["https://example.com"],
      "default_tags": ["newsletter"],
      "require_confirmation": true,
      "created_at": 1767225600,
      "revoked_at": null
   },
   "error": null
}
```

Store `key` in the marketing site's environment. Only a SHA-256 hash and the display prefix are stored server-side.

## 2. Call it from a server or a form handler

```sh
curl -X POST https://postwren.example.com/api/public/subscribe \
  -H 'authorization: Bearer pk_live_ab12cd34...' \
  -H 'content-type: application/json' \
  -d '{
    "email": "ada@example.com",
    "firstName": "Ada",
    "lastName": "Lovelace",
    "tags": ["vip"],
    "metadata": { "signup_source": "emdash", "plan": "free" },
    "source": "emdash-form",
    "sourceUrl": "https://example.com/newsletter"
  }'
```

`X-Subscribe-Key: pk_live_...` works as an alternative to the `Authorization` header.

Successful response:

```json
{ "data": { "subscribed": true }, "error": null }
```

The response is identical for a new and an existing address (`202 Accepted`). That is deliberate: the endpoint is public and must not reveal list membership. Repeating the call is safe: tags and metadata are merged, the subscriber is not duplicated, and an unsubscribed or bounced subscriber is never moved back to `subscribed`.

### Double opt-in

When the key has `requireConfirmation: true`, a new address is stored with status `pending` and receives a confirmation email. Campaign audiences only select `subscribed` rows, so a pending address is never mailed. The response adds `pending`:

```json
{ "data": { "subscribed": true, "pending": true }, "error": null }
```

The confirmation link is `GET /confirm/<token>` and `POST /confirm/<token>`. GET itself never writes, so a mailbox scanner that only fetches links cannot opt someone in. The page then auto-submits the POST, so a reader still confirms with one click rather than two. Confirming moves the row to `subscribed`, sets `confirmed_at`, and only then enrols `subscriber.created` and `tag.added` automations. Outside production the response also includes `devConfirmUrl`, because there is no real mailbox to open.

Double opt-in is per key and off by default. It is not required for every deployment; turn it on where you need explicit consent evidence (Germany, for example) or want the list hygiene.

### Address hygiene

Before writing, the endpoint rejects obvious disposable domains and known provider typos (`gmial.com` returns `details.suggestion`). In production it also asks Cloudflare DNS for an MX or A record; a null MX (`0 .`) is refused. If DNS cannot be reached the check fails open, so an outage never blocks a real signup. This is deliberately smaller than a paid validation service.

### Browser code

Browser requests must come from an origin listed in the key's `allowedOrigins`. The server checks the `Origin` header on the request itself, so a permissive preflight does not bypass it.

```js
const response = await fetch('https://postwren.example.com/api/public/subscribe', {
   method: 'POST',
   headers: {
      authorization: `Bearer ${import.meta.env.PUBLIC_SUBSCRIBE_KEY}`,
      'content-type': 'application/json',
   },
   body: JSON.stringify({
      email,
      firstName,
      metadata: { signup_source: 'emdash' },
      source: 'emdash-form',
      sourceUrl: window.location.href,
   }),
});

if (!response.ok) {
   const payload = await response.json();
   throw new Error(payload.error?.message ?? 'Subscription failed');
}
```

With a React or Preact form handler the shape is the same. Keep the publishable key on the server when you can: a `pk_live_` key is publishable, but it can still be used to submit addresses.

### EmDash form

```html
<form id="newsletter">
   <input
      type="email"
      name="email"
      required
   />
   <input
      type="text"
      name="website"
      tabindex="-1"
      autocomplete="off"
      hidden
   />
   <button type="submit">Subscribe</button>
</form>
```

```js
document.querySelector('#newsletter').addEventListener('submit', async (event) => {
   event.preventDefault();
   const form = new FormData(event.currentTarget);
   const response = await fetch('https://postwren.example.com/api/public/subscribe', {
      method: 'POST',
      headers: {
         authorization: `Bearer ${PUBLIC_SUBSCRIBE_KEY}`,
         'content-type': 'application/json',
      },
      body: JSON.stringify({
         email: form.get('email'),
         website: form.get('website'),
         source: 'emdash-form',
         sourceUrl: location.href,
      }),
   });

   if (response.ok) event.currentTarget.reset();
});
```

`website` is a honeypot. When it is non-empty the endpoint returns a successful no-op and writes nothing, so bots see the same response as humans.

## Body

| Field       | Required | Notes                                                                      |
| ----------- | -------- | -------------------------------------------------------------------------- |
| `email`     | yes      | Trimmed and lowercased. Duplicates are merged, not rejected.               |
| `firstName` | no       | At most 100 characters.                                                    |
| `lastName`  | no       | At most 100 characters.                                                    |
| `tags`      | no       | At most 20 tags; the key's `defaultTags` are always added.                 |
| `metadata`  | no       | Flat string map. Keys match `^[a-z][a-z0-9_]{0,63}$`, values ≤ 1024.       |
| `source`    | no       | Provenance label stored on the subscriber. Defaults to `public_subscribe`. |
| `sourceUrl` | no       | Absolute URL of the page that submitted the form.                          |
| `website`   | no       | Honeypot. Any non-empty value returns a 202 no-op.                         |

Reserved metadata keys (`id`, `email`, `first_name`, `last_name`, `status`, `tags`) are rejected with a validation error.

## Errors

| Status | Meaning                                                             |
| ------ | ------------------------------------------------------------------- |
| 401    | Missing, malformed, or revoked subscribe key.                       |
| 403    | The request `Origin` is not in the key's allowed origins.           |
| 422    | Body validation failed, or the address is disposable/undeliverable. |
| 429    | More than `RATE_LIMITS.publicSubscribe` requests per window.        |

Failures use the same envelope as the rest of the API:

```json
{ "data": null, "error": { "code": "validation_error", "message": "..." } }
```

## Revoke a key

```sh
curl -X DELETE https://postwren.example.com/api/v1/subscribe-keys/sk_... \
  -H 'cookie: sid=...; csrf=...' \
  -H 'x-csrf-token: ...'
```

Revoked keys fail with 401 immediately. Create a new key and redeploy the site with the replacement.
