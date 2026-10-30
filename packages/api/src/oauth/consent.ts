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
};

export type ConsentParams = {
   client_id: string;
   redirect_uri: string;
   response_type: string;
   scope: string;
   state?: string;
   code_challenge: string;
   code_challenge_method: string;
   resource?: string;
};

function escapeHtml(value: string): string {
   return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
}

function hidden(name: string, value: string | undefined): string {
   if (value === undefined) return '';
   return `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}">`;
}

export function renderConsentPage(input: {
   clientName: string;
   clientId: string;
   username: string;
   scopes: Scope[];
   params: ConsentParams;
   csrf: string;
}): string {
   const { clientName, clientId, username, scopes, params, csrf } = input;

   const scopeItems = scopes
      .map(
         (scope) =>
            `<li><code>${escapeHtml(scope)}</code><span>${escapeHtml(
               SCOPE_DESCRIPTIONS[scope],
            )}</span></li>`,
      )
      .join('');

   const fields = [
      hidden('csrf', csrf),
      hidden('client_id', params.client_id),
      hidden('redirect_uri', params.redirect_uri),
      hidden('response_type', params.response_type),
      hidden('scope', params.scope),
      hidden('state', params.state),
      hidden('code_challenge', params.code_challenge),
      hidden('code_challenge_method', params.code_challenge_method),
      hidden('resource', params.resource),
   ].join('');

   return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Authorize ${escapeHtml(clientName)}</title>
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
dl { margin: 0 0 18px; display: grid; grid-template-columns: max-content 1fr; gap: 4px 12px; }
dt { font-weight: 600; }
dd { margin: 0; overflow-wrap: anywhere; opacity: .85; }
ul { list-style: none; margin: 0 0 22px; padding: 0; display: grid; gap: 8px; }
li { display: grid; gap: 2px; padding: 10px 12px; border-radius: 10px;
  background: color-mix(in srgb, CanvasText 5%, transparent); }
li span { opacity: .8; font-size: 14px; }
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
<h1>Authorize ${escapeHtml(clientName)}</h1>
<p>Signed in as <span class="username">${escapeHtml(username)}</span>.</p>
<p>This client is asking for API access to your mailer. It will act with the scopes below
until you revoke its grant.</p>
<dl>
<dt>Client</dt><dd>${escapeHtml(clientName)}</dd>
<dt>Client ID</dt><dd><code>${escapeHtml(clientId)}</code></dd>
<dt>Redirect</dt><dd>${escapeHtml(params.redirect_uri)}</dd>
</dl>
<ul>${scopeItems}</ul>
<form method="post" action="/oauth/authorize">
${fields}
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
