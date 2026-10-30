# @postwren/emdash

A native [EmDash](https://emdashcms.com) plugin that forwards newsletter signups from an EmDash site
to a Postwren Worker. Phase 1: the Worker stays standalone and owns all data; the plugin is a
server-side proxy plus an optional footer form. No subscriber data lands in the CMS database.

Requires EmDash 1.3.1 or later (`emdash` is a peer dependency). Cloudflare Workers only.

## Install

```sh
pnpm add @postwren/emdash
```

In a monorepo, use a workspace or a local path instead, for example
`pnpm add file:../postwren/packages/emdash-plugin`. The package ships TypeScript sources
(like other native EmDash plugins) and is consumed by the site's Vite build, so it needs a build step
before it can be published to a registry.

## Configure

```js
// astro.config.mjs
import emdash from 'emdash/astro';
import { postwrenPlugin } from '@postwren/emdash';

export default defineConfig({
   integrations: [
      emdash({
         // ...database, storage, plugins...
         plugins: [
            postwrenPlugin({
               workerUrl: 'https://mail.example.com', // your Postwren Worker origin
               defaultTags: ['newsletter'], // optional fallback
            }),
         ],
      }),
   ],
});
```

`workerUrl` also fixes the plugin's network allowlist, so changing the Worker host later means
editing this file and redeploying.

## Create the subscribe key

In the Postwren Worker admin open **Settings → Public subscribe keys**, create a key for this site and
copy the `pk_live_…` value — it is shown once. These are publishable site keys, not the `pwr_` agent
keys. See `docs/PUBLIC-SUBSCRIBE.md` in the Postwren repo for the key API.

The plugin calls the Worker server-to-server, so the key never reaches the browser and the key's
origin allowlist is not consulted (no `Origin` header is sent). Add the site origin anyway if you
also plan to call the Worker from browser code.

## Settings

Plugins → Postwren → Settings (`/_emdash/admin/plugins-manager/postwren/settings`):

| Setting                   | Type    | Meaning                                                   |
| ------------------------- | ------- | --------------------------------------------------------- |
| Postwren Worker URL       | url     | Should equal the `workerUrl` passed to `postwrenPlugin()` |
| Publishable subscribe key | secret  | `pk_live_…`, encrypted at rest by EmDash                  |
| Default tags              | string  | Comma-separated, added to every signup                    |
| Inject the signup form    | boolean | Adds the footer form to public pages (default off)        |
| Signup form heading       | string  | Heading text, default "Newsletter"                        |

## Routes

| Route                                          | Method | Access           |
| ---------------------------------------------- | ------ | ---------------- |
| `/_emdash/api/plugins/postwren/signup`         | POST   | public           |
| `/_emdash/api/plugins/postwren/overview`       | GET    | `plugins:read`   |
| `/_emdash/api/plugins/postwren/testConnection` | POST   | `plugins:manage` |

`signup` accepts `{ email, firstName?, lastName?, tags?, metadata?, sourceUrl?, website? }` as JSON
(≤ 8 KiB) and answers `{ "success": true, "data": { "subscribed": true } }`. Failures:
`422 INVALID_EMAIL`, `429 RATE_LIMITED`, `502 WORKER_NOT_CONFIGURED`, `502 SUBSCRIBE_FAILED`.
`website` is a honeypot: any value returns success and forwards nothing.

It always tells the Worker `source: "emdash"` and merges `defaultTags` with submitted tags.

## Copy-paste form

```html
<form id="newsletter">
   <label for="newsletter-email">Email address</label>
   <input
      id="newsletter-email"
      name="email"
      type="email"
      autocomplete="email"
      required
   />
   <input
      name="website"
      type="text"
      tabindex="-1"
      autocomplete="off"
      aria-hidden="true"
      hidden
   />
   <button type="submit">Subscribe</button>
   <p
      id="newsletter-status"
      role="status"
      aria-live="polite"
   ></p>
</form>
```

```js
document.querySelector('#newsletter').addEventListener('submit', async (event) => {
   event.preventDefault();
   const form = new FormData(event.currentTarget);
   const status = document.querySelector('#newsletter-status');

   const response = await fetch('/_emdash/api/plugins/postwren/signup', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-EmDash-Request': '1' },
      body: JSON.stringify({
         email: form.get('email'),
         website: form.get('website'),
         sourceUrl: location.href,
      }),
   });

   status.textContent = response.ok
      ? 'Thanks — you are on the list.'
      : 'Signup failed. Please try again.';
   if (response.ok) event.currentTarget.reset();
});
```

The `X-EmDash-Request: 1` header is required for every state-changing plugin route.

## Injected form

With **Inject the signup form** on, the plugin appends an accessible form to every public page. This
uses the `page:fragments` hook, so the site's template must render `<EmDashBodyEnd />`. The form
carries no external assets and uses CSS system colours, so it follows the site's light/dark scheme.

## Notes

- No admin UI in phase 1: EmDash renders the settings form from the plugin schema, and the private
  routes answer status calls. The full editor, campaigns and subscriber list stay in the Worker.
- The Worker rate-limits per client IP. Every visitor of this site may share the Worker's single
  egress IP, so a busy site can receive `429 RATE_LIMITED`; the form shows a friendly message.
- Tags can be set here and on the subscribe key itself; the Worker lowercases and de-duplicates them.
- Unsubscribe links, open pixels and click tracking stay on the Worker (`/u/*`, `/t/*`), not on the
  CMS origin.
