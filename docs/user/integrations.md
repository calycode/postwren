# Integrations

Postwren has five ways to connect something else. All of them use the same
subscriber status rules, so a suppressed address stays suppressed no matter
which door it came through.

## Newsletter forms

`POST /api/public/subscribe` accepts a publishable key and a small JSON body.
Use it from a server, a form handler, or a static site:

```sh
curl -X POST https://mail.example.com/api/public/subscribe \
  -H 'authorization: Bearer pk_live_…' \
  -H 'content-type: application/json' \
  -d '{
    "email": "ada@example.com",
    "firstName": "Ada",
    "tags": ["newsletter"],
    "metadata": { "signup_source": "homepage" }
  }'
```

The key's origin allowlist applies to browser calls. A non-empty `website` field
is a honeypot and returns success without writing. The response is always
`202 { "data": { "subscribed": true } }`, whether the address was new or
already present, so the endpoint cannot be used to test list membership.

Keys, origins, default tags, double opt-in and Turnstile are managed in
Settings. Full contract: [Public subscribe endpoint](../developer/public-subscribe.md).

## Webhooks

Outbound, signed and retried. Subscriber and campaign events are delivered to
HTTPS endpoints with a per-attempt delivery log. The signature header is
Stripe-style, signed over `<timestamp>.<raw body>`:

```text
X-Postwren-Signature: t=1767225600,v1=<hex HMAC-SHA256>
```

Verify it against the raw request body before trusting the parsed JSON. See
[Webhooks](../developer/webhooks.md).

## API keys and transactional email

Scoped `pwr_` keys authenticate `/api/v1/*`. The transactional endpoint sends one
message to one recipient without creating a campaign or recipient row:

```sh
curl -X POST https://mail.example.com/api/v1/emails \
  -H "authorization: Bearer $POSTWREN_KEY" \
  -H 'content-type: application/json' \
  -d '{
    "to": "customer@example.com",
    "subject": "Your receipt",
    "html": "<p>Thanks for your order.</p>"
  }'
```

Suppressed recipients are refused. The endpoint needs `emails:write`. See
[Agent access](../developer/agent-access.md) and the generated
[HTTP API reference](../developer/reference/api.md).

## AI agents over MCP

`/mcp` is a Streamable HTTP MCP server with 25 scoped tools for lists,
subscribers, campaigns, templates and sending. Clients can present a `pwr_` API
key directly, or complete OAuth 2.1 with PKCE and dynamic client registration
for connectors that cannot send a static header.

Point a client at:

```text
https://mail.example.com/mcp
```

The tool list is generated from the server definitions:
[MCP tools](../developer/reference/mcp-tools.md).

## EmDash sites

The `@postwren/emdash` plugin proxies signups to the Worker and renders its
settings inside the EmDash admin. It is a native plugin, not an iframe. See
[EmDash plugin](../developer/emdash-plugin.md).

## Admin embedding

If you want the whole Postwren admin inside another host, add that exact origin
under Settings → Embedding. The Worker sets `Content-Security-Policy:
frame-ancestors` on every HTML response, which is why all requests go through
the Worker rather than straight to static assets.

Same-origin framing always works. There is no wildcard and no path matching.
See [Iframe embedding](../developer/iframe-embedding.md).
