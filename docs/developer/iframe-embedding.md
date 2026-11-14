# Iframe embedding

The admin SPA can be embedded in another origin, but only when that exact origin is on the
workspace allowlist. The control lives at **Settings → Iframe embedding** and is stored in D1.

## What is enforced

Every HTML response carries a framing policy. With no allowed origins:

```
Content-Security-Policy: frame-ancestors 'self'
```

With allowed origins:

```
Content-Security-Policy: frame-ancestors 'self' https://cms.example.com https://other.example.com
```

`frame-ancestors` is evaluated by the browser that does the framing. The allowlist is exact:
scheme, host and optional port. Subdomains are separate entries. Wildcards, paths, query strings
and credentials are rejected; a trailing slash is accepted and normalised away. Entries must be
HTTPS, except loopback HTTP for local development.

The header is applied by `packages/api/src/middleware/frame-policy.ts`. The SPA is served by the
Workers assets binding, so `run_worker_first` is enabled: every request, including the SPA fallback,
passes through the Worker and static assets are proxied to the binding unchanged. HTML responses are
`cache-control: no-store` so a policy change is not stranded in a browser cache.

`X-Frame-Options` is only useful as a fallback for browsers that do not implement
`frame-ancestors`. With no allowed origins the SPA also sends `X-Frame-Options: SAMEORIGIN`. Once an
origin is allowed, the header is removed because it cannot express an allowlist; CSP is
authoritative. The OAuth consent page keeps its own `X-Frame-Options: DENY`, and the unsubscribe
page is always `frame-ancestors 'none'`.

The setting is session-only: a `pwr_` bearer key cannot read or change it, and every write needs
the normal CSRF token.

## Security model

Allowing an origin to frame Postwren is a clickjacking grant. The parent page cannot read the
iframe's DOM, but it can:

- position the iframe under its own controls;
- overlay transparent elements;
- resize or scroll the frame;
- trick a signed-in owner into clicking a real control, such as sending a campaign, deleting a
  subscriber, changing the default sender, or creating an API key.

Only add origins you control, and remove them when the embed is no longer needed. The grant is
about who may **display** the UI. It does not change authentication, CSRF checks, API scopes, or
the `SameSite` session cookie.

An empty list means only this Worker's own origin can frame the app. That is the default.

## Deploying

The allowlist is the `embed_origins` table in the new `migrations/0008_embed_origins.sql` migration.
Run `pnpm db:migrate:remote` before deploying this version. If the table is missing, HTML responses
still fail closed to `frame-ancestors 'self'`, and the settings card reports a load error instead of
letting you save an allowlist that does not exist yet.

The `assets.run_worker_first` setting must stay enabled. Without it, the Workers assets binding serves
`index.html` for SPA routes and unknown asset paths without going through the middleware.

## Setting it up for EmDash

1. Decide the exact origin of the EmDash admin that will host the iframe, for example
   `https://cms.example.com`.
2. In Postwren, open **Settings → Iframe embedding** and add that origin.
3. Point the iframe at the Postwren origin, e.g. `https://mail.example.com/`.
4. Confirm the response header:

```sh
curl -sI https://mail.example.com/ | grep -i content-security-policy
```

Expected:

```
content-security-policy: frame-ancestors 'self' https://cms.example.com
```

If the browser still refuses the frame, look for an `X-Frame-Options` header added by a Cloudflare
Transform Rule, a reverse proxy, or a `frame-src` directive in the host page's own CSP. The Worker
removes `X-Frame-Options` from its HTML responses, but an edge rule that adds it after the Worker
can still block the embed.

## Session cookies in an iframe

The grant fixes framing, not third-party cookies. Postwren's session cookie is `SameSite=Lax`.
Browsers send it in a cross-origin iframe only when the embedding page and the Worker are on the
same **site** (same scheme and registrable domain):

- `https://cms.example.com` embedding `https://mail.example.com` works: same site.
- `https://cms.emdash.app` embedding `https://mail.example.com` is cross-site. Chrome, Safari and
  Firefox may withhold the session cookie, so the iframe stays signed out even though framing is
  allowed.

For a cross-site embed, put the Worker on a custom domain under the same registrable domain as the
host, or plan an explicit token handoff. Do not relax the session cookie to `SameSite=None` just
to make an iframe work; that widens CSRF exposure for every session.

## Signing in inside the iframe

Use the 6-digit code from the sign-in email. The magic link navigates to a top-level page, but the
code keeps the login inside the iframe. The code is single-use, expires after 15 minutes, and is
rate limited per email and IP.

The code only solves the navigation. The cookie rule above still applies: if the browser refuses
the `sid` cookie in a cross-site iframe, the login page returns with a message that the session
could not be loaded. Put Postwren on a custom domain under the same registrable domain as the
EmDash site.
