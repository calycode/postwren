# Settings

Settings is the workspace surface: sending addresses, public keys, webhooks,
API credentials and embed origins. Account and theme controls live in the
sidebar account menu, not here.

## Sending domains

Campaigns can only send from an address on this list. Add the address you will
use, then mark it verified once Cloudflare has onboarded its domain for Email
Sending.

- Cloudflare verifies **domains**, not individual addresses. Once
  `example.com` is onboarded, any address on it may send.
- Use a dedicated subdomain such as `marketing.example.com` for marketing, so a
  complaint cannot damage transactional reputation.
- A typo in the from address is caught here instead of burning the domain.

If the Worker has a read-only `CLOUDFLARE_API_TOKEN` configured (Zone Read, DNS
Read, Email Sending Read), the settings page can list your zones, flag missing
MX, SPF, DKIM and DMARC records, and ask Cloudflare whether a domain is
onboarded. Postwren never edits DNS. Without the token you mark addresses
verified by hand.

## Public subscribe keys

A subscribe key is a publishable `pk_live_…` credential for
`POST /api/public/subscribe`. The secret is shown once; only a hash and a
display prefix are stored.

Each key carries:

| Option               | Effect                                                                  |
| -------------------- | ----------------------------------------------------------------------- |
| Allowed origins      | Exact browser origins allowed to call the key; enforced, not advertised |
| Default tags         | Tags added to every signup through this key                             |
| Require confirmation | Double opt-in; new rows stay `pending` until the confirmation POST      |
| Turnstile site key   | Requires a Turnstile token in the request; needs `TURNSTILE_SECRET`     |

A key without origins can still be called server-side. Browser calls from an
origin outside the list are rejected. Revoking a key stops it immediately.

## Webhooks

Register an HTTPS endpoint, choose its events, and copy the signing secret when
it is shown. The endpoint page keeps a delivery log with status, attempts,
response code, error and next attempt time, plus a **Test** action that sends a
`webhook.test` event.

Deliveries are signed with hex HMAC-SHA256 over the body. Retries use backoff
and stop after the configured attempts. See
[Webhooks](../developer/webhooks.md) for the signature and event catalogue.

## API keys

Create scoped `pwr_` keys for scripts and external apps. A key is shown once and
stores only its hash and display prefix. Scopes are explicit per key, for
example `subscribers:read`, `campaigns:write`, `emails:write` or
`events:write`.

The API tab also shows the full scope list, the API base URL, and a copyable
transactional-email snippet. The same keys authenticate the MCP endpoint at
`/mcp`, so an agent can use one credential for both.

## Embedding

The admin SPA may be framed only by its own origin plus exact origins added
under Embedding. An origin is scheme, host and optional port; paths, wildcards
and credentials are rejected, and HTTPS is required outside loopback
development.

The session cookie is `SameSite=Lax`, so a cross-site frame may load but stay
signed out. Sign-in inside a frame uses the six-digit code, not the magic link.
See [Iframe embedding](../developer/iframe-embedding.md).

## Account and appearance

The account menu at the bottom of the sidebar holds:

- Light, dark and system theme.
- The guided tour, which can be replayed.
- Sign-out.

There is one owner account. Changing `OWNER_EMAIL` on the Worker changes who can
sign in; it does not migrate data.
