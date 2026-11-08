import type { ConsentDescription } from '@cloudflare/workers-oauth-provider';
import type { Scope } from '../auth/scopes';

export const SCOPE_DESCRIPTIONS: Record<Scope, string> = {
   'subscribers:read': 'Read subscribers and their tags',
   'subscribers:write': 'Create, update, delete and tag subscribers',
   'campaigns:read': 'Read campaigns, previews and statistics',
   'campaigns:write': 'Create and edit campaigns',
   'templates:read': 'Read and render email templates',
   'templates:write': 'Create and edit email templates',
   'tags:read': 'Read tags',
   'tags:write': 'Create, rename and delete tags',
   'media:write': 'Upload images to the media library',
   'send:write': 'Schedule, send, pause and resume campaigns',
   'emails:write': 'Send transactional email',
   'events:write': 'Send subscriber events that can start automations',
};

export type ConsentInput = {
   details: ConsentDescription;
   handle: string;
   csrf: string;
   username: string;
};

function escapeHtml(value: string): string {
   return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
}

function scopeDescription(scope: string): string {
   return SCOPE_DESCRIPTIONS[scope as Scope] ?? scope;
}

export function renderConsentPage(input: ConsentInput): string {
   const { details, handle, csrf, username } = input;

   const scopeItems = details.scope
      .map(
         (scope) =>
            `<li><label><input type="checkbox" name="scope" value="${escapeHtml(
               scope,
            )}" checked><span><code>${escapeHtml(scope)}</code><em>${escapeHtml(
               scopeDescription(scope),
            )}</em></span></label></li>`,
      )
      .join('');

   const domain = details.clientDomain
      ? `<dt>Client domain</dt><dd>${escapeHtml(details.clientDomain)}</dd>`
      : '';

   const loopback = details.redirectIsLoopback
      ? '<p class="warning">The redirect goes to a local app. Any process on that machine could receive the authorization code.</p>'
      : '';

   return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Authorize ${escapeHtml(details.clientName)}</title>
<style>
:root { color-scheme: light dark; }
* { box-sizing: border-box; }
body { margin: 0; min-height: 100dvh; display: grid; place-items: center; padding: 24px;
  font: 15px/1.55 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  background: Canvas; color: CanvasText; }
main { width: 100%; max-width: 460px; border: 1px solid color-mix(in srgb, CanvasText 18%, transparent);
  border-radius: 14px; padding: 28px; }
h1 { margin: 0 0 6px; font-size: 20px; line-height: 1.25; }
p { margin: 0 0 16px; opacity: .8; }
.warning { padding: 10px 12px; border-radius: 9px; background: color-mix(in srgb, #b45309 14%, transparent); }
dl { margin: 0 0 18px; display: grid; grid-template-columns: max-content 1fr; gap: 4px 12px; }
dt { font-weight: 600; }
dd { margin: 0; overflow-wrap: anywhere; opacity: .85; }
ul { list-style: none; margin: 0 0 22px; padding: 0; display: grid; gap: 8px; }
li { padding: 0; border-radius: 10px; background: color-mix(in srgb, CanvasText 5%, transparent); }
li label { display: flex; align-items: flex-start; gap: 10px; padding: 10px 12px; cursor: pointer; }
li input { margin: 3px 0 0; accent-color: #1d6f42; }
li span { display: grid; gap: 2px; }
li em { font-style: normal; opacity: .8; font-size: 14px; }
code { font: 13px ui-monospace, SFMono-Regular, Menlo, monospace; }
.actions { display: flex; gap: 10px; justify-content: flex-end; flex-wrap: wrap; }
button { font: inherit; padding: 9px 16px; border-radius: 9px; cursor: pointer; border: 1px solid transparent; }
button[value="approve"] { background: #1d6f42; color: #fff; }
button[value="deny"] { background: transparent; color: inherit;
  border-color: color-mix(in srgb, CanvasText 25%, transparent); }
.username { font-weight: 600; }
</style>
</head>
<body>
<main>
<h1>Authorize ${escapeHtml(details.clientName)}</h1>
<p>Signed in as <span class="username">${escapeHtml(username)}</span>.</p>
<p>This client is asking for API access to your Postwren workspace. Uncheck anything it does not need.
It will act with the selected scopes until you revoke its grant.</p>
${loopback}
<dl>
<dt>Client</dt><dd>${escapeHtml(details.clientName)}</dd>
${domain}
<dt>Client ID</dt><dd><code>${escapeHtml(details.clientId)}</code></dd>
<dt>Redirect</dt><dd>${escapeHtml(details.redirectUri)}</dd>
</dl>
<ul>${scopeItems}</ul>
<form method="post" action="/oauth/authorize">
<input type="hidden" name="handle" value="${escapeHtml(handle)}">
<input type="hidden" name="csrf" value="${escapeHtml(csrf)}">
<input type="hidden" name="scope_present" value="1">
<div class="actions">
<button type="submit" name="decision" value="deny">Deny</button>
<button type="submit" name="decision" value="approve">Allow access</button>
</div>
</form>
</main>
</body>
</html>`;
}

export function renderConsentError(message: string): string {
   return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Authorization failed</title></head>
<body style="font: 15px/1.5 system-ui, sans-serif; margin: 40px auto; max-width: 560px;">
<h1 style="font-size:20px;">Authorization failed</h1>
<p>${escapeHtml(message)}</p>
</body></html>`;
}
