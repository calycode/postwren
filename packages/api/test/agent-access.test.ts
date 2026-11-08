import { beforeEach, describe, expect, it } from 'vitest';
import { env, SELF } from 'cloudflare:test';
import { sha256Hex } from '@postwren/worker-kit/ids';
import type { Scope } from '../src/auth/scopes';
import { apiKeyHash, generateApiKey } from '../src/auth/api-key';
import { authHeaders, baseEnv, createAppForTest, json, now, resetDb, seedOwner } from './helpers';

const app = createAppForTest();
const APP_URL = baseEnv().APP_URL.replace(/\/+$/, '');
const REDIRECT_URI = 'https://client.example/callback';
const VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
const CHALLENGE = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';

type Client = { client_id: string; redirect_uris: string[] };
type Auth = { cookie: string; csrf: string; userId: string };

async function clearOAuthKv(): Promise<void> {
   let cursor: string | undefined;
   for (;;) {
      const page = await env.OAUTH_KV.list(cursor === undefined ? {} : { cursor });
      await Promise.all(page.keys.map((key) => env.OAUTH_KV.delete(key.name)));
      if (page.list_complete || page.cursor === undefined) break;
      cursor = page.cursor;
   }
}

async function resetAgentDb(): Promise<void> {
   await env.DB.prepare('DELETE FROM api_keys').run();
   await resetDb();
   await clearOAuthKv();
}

beforeEach(async () => {
   await resetAgentDb();
});

async function seedApiKey(
   scopes: Scope[],
   overrides: { expiresAt?: number | null; revokedAt?: number | null } = {},
): Promise<string> {
   const { raw, prefix } = generateApiKey();
   const hash = await apiKeyHash(raw);
   const createdAt = now();

   await env.DB.prepare(
      `INSERT INTO api_keys (id, name, prefix, key_hash, scopes, created_at, expires_at, revoked_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
   )
      .bind(
         `key_${prefix}`,
         'test key',
         prefix,
         hash,
         JSON.stringify(scopes),
         createdAt,
         overrides.expiresAt ?? null,
         overrides.revokedAt ?? null,
      )
      .run();

   return raw;
}

function bearer(raw: string, extra: Record<string, string> = {}): Record<string, string> {
   return { authorization: `Bearer ${raw}`, 'content-type': 'application/json', ...extra };
}

function setCookies(response: Response): string[] {
   const headers = response.headers as Headers & { getSetCookie?: () => string[] };
   return headers.getSetCookie?.() ?? [];
}

function mergeCookies(jar: Map<string, string>, response: Response): void {
   for (const cookie of setCookies(response)) {
      const pair = cookie.split(';')[0] ?? '';
      const separator = pair.indexOf('=');
      if (separator <= 0) continue;
      jar.set(pair.slice(0, separator), pair.slice(separator + 1));
   }
}

function cookieHeader(jar: Map<string, string>): string {
   return [...jar.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
}

function jarFrom(auth: Auth): Map<string, string> {
   const jar = new Map<string, string>();
   for (const part of auth.cookie.split(';')) {
      const [name, value] = part.trim().split('=');
      if (name !== undefined && value !== undefined) jar.set(name, value);
   }
   return jar;
}

async function registerClient(overrides: Record<string, unknown> = {}): Promise<Client> {
   const response = await SELF.fetch(`${APP_URL}/oauth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
         client_name: 'Test connector',
         redirect_uris: [REDIRECT_URI],
         token_endpoint_auth_method: 'none',
         ...overrides,
      }),
   });

   expect(response.status).toBe(201);
   return (await response.json()) as Client;
}

type Approval = {
   owner: Auth;
   client: Client;
   location: string;
   jar: Map<string, string>;
   code: string;
};

async function approveConsent(
   client: Client,
   options: { scopes?: string; verifier?: string; owner?: Auth; granted?: string[] } = {},
): Promise<Approval> {
   const owner = options.owner ?? (await seedOwner());
   const verifier = options.verifier ?? VERIFIER;
   const params = new URLSearchParams({
      response_type: 'code',
      client_id: client.client_id,
      redirect_uri: client.redirect_uris[0] ?? REDIRECT_URI,
      scope: options.scopes ?? 'tags:read tags:write',
      state: 'state-123',
      code_challenge: CHALLENGE,
      code_challenge_method: 'S256',
   });

   const jar = jarFrom(owner);
   const consent = await SELF.fetch(`${APP_URL}/oauth/authorize?${params.toString()}`, {
      headers: { cookie: cookieHeader(jar) },
      redirect: 'manual',
   });

   expect(consent.status).toBe(200);
   const html = await consent.text();
   expect(html).toContain('Test connector');
   expect(html).toContain('tags:read');
   mergeCookies(jar, consent);

   const handle = /name="handle" value="([^"]+)"/.exec(html)?.[1];
   expect(handle).toBeTruthy();

   const form = new URLSearchParams({
      handle: handle ?? '',
      csrf: owner.csrf,
      decision: 'approve',
   });

   if (options.granted !== undefined) {
      form.set('scope_present', '1');
      for (const scope of options.granted) form.append('scope', scope);
   }

   const approval = await SELF.fetch(`${APP_URL}/oauth/authorize`, {
      method: 'POST',
      headers: {
         cookie: cookieHeader(jar),
         'content-type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
      redirect: 'manual',
   });

   expect(approval.status).toBe(302);
   mergeCookies(jar, approval);

   const location = approval.headers.get('location') ?? '';
   const code = new URL(location).searchParams.get('code');
   expect(code).toBeTruthy();
   expect(new URL(location).searchParams.get('state')).toBe('state-123');
   expect(new URL(location).searchParams.get('iss')).toBe(APP_URL);

   return { owner, client, location, jar, code: code ?? '' };
}

function tokenForm(input: Record<string, string>): string {
   return new URLSearchParams(input).toString();
}

async function exchangeCode(
   clientId: string,
   code: string,
   options: { verifier?: string; redirectUri?: string; resource?: string } = {},
): Promise<Response> {
   const body: Record<string, string> = {
      grant_type: 'authorization_code',
      client_id: clientId,
      code,
      redirect_uri: options.redirectUri ?? REDIRECT_URI,
      code_verifier: options.verifier ?? VERIFIER,
   };
   if (options.resource !== undefined) body['resource'] = options.resource;

   return SELF.fetch(`${APP_URL}/oauth/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: tokenForm(body),
   });
}

async function refresh(
   clientId: string,
   refreshToken: string,
   options: { resource?: string; scope?: string } = {},
): Promise<Response> {
   const body: Record<string, string> = {
      grant_type: 'refresh_token',
      client_id: clientId,
      refresh_token: refreshToken,
   };
   if (options.resource !== undefined) body['resource'] = options.resource;
   if (options.scope !== undefined) body['scope'] = options.scope;

   return SELF.fetch(`${APP_URL}/oauth/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: tokenForm(body),
   });
}

async function mcp(raw: string, payload: unknown): Promise<Response> {
   return SELF.fetch(`${APP_URL}/mcp`, {
      method: 'POST',
      headers: {
         authorization: `Bearer ${raw}`,
         'content-type': 'application/json',
         accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify(payload),
   });
}

describe('scoped API keys', () => {
   it('creates a key once and never returns its hash', async () => {
      const owner = await seedOwner();

      const created = await app.request('/api/v1/settings/api-keys', {
         method: 'POST',
         headers: authHeaders(owner),
         body: JSON.stringify({ name: 'CI', scopes: ['subscribers:read', 'tags:write'] }),
      });

      expect(created.status).toBe(201);
      const createdBody = await json(created);
      expect(createdBody.data.key).toMatch(/^pwr_[a-z0-9]+_/);
      expect(createdBody.data.scopes).toEqual(['subscribers:read', 'tags:write']);

      const stored = await env.DB.prepare('SELECT * FROM api_keys WHERE id = ?')
         .bind(createdBody.data.id)
         .first<Record<string, unknown>>();
      expect(stored?.['key_hash']).toBe(await sha256Hex(createdBody.data.key));
      expect(stored?.['key_hash']).not.toBe(createdBody.data.key);

      const list = await app.request('/api/v1/settings/api-keys', {
         headers: { cookie: owner.cookie },
      });
      expect(list.status).toBe(200);
      const listed = (await json(list)).data[0];
      expect(listed.key).toBeUndefined();
      expect(listed.key_hash).toBeUndefined();
      expect(listed.prefix).toBe(createdBody.data.prefix);
   });

   it('accepts a bearer key without CSRF and rejects it once revoked', async () => {
      const raw = await seedApiKey(['tags:write']);

      const created = await app.request('/api/v1/tags', {
         method: 'POST',
         headers: bearer(raw),
         body: JSON.stringify({ name: 'news' }),
      });
      expect(created.status).toBe(201);
      expect((await json(created)).data.name).toBe('news');

      const keyRow = await env.DB.prepare('SELECT id, last_used_at FROM api_keys').first<{
         id: string;
         last_used_at: number | null;
      }>();
      expect(keyRow?.last_used_at).not.toBeNull();

      const owner = await seedOwner();
      await app.request(`/api/v1/settings/api-keys/${keyRow?.id ?? ''}`, {
         method: 'DELETE',
         headers: authHeaders(owner),
      });

      const after = await app.request('/api/v1/tags', { headers: bearer(raw) });
      expect(after.status).toBe(401);
   });

   it('rejects expired keys and keys that never matched a stored hash', async () => {
      const expired = await seedApiKey(['tags:read'], { expiresAt: now() - 1 });

      expect((await app.request('/api/v1/tags', { headers: bearer(expired) })).status).toBe(401);
      expect(
         (
            await app.request('/api/v1/tags', {
               headers: bearer('pwr_abcdef_invalidsecretvalue'),
            })
         ).status,
      ).toBe(401);
   });

   it('enforces the scope matrix in one place', async () => {
      const reader = await seedApiKey(['subscribers:read', 'campaigns:read', 'tags:read']);
      const writer = await seedApiKey(['subscribers:write', 'tags:write', 'campaigns:write']);

      expect((await app.request('/api/v1/subscribers', { headers: bearer(reader) })).status).toBe(
         200,
      );
      expect((await app.request('/api/v1/tags', { headers: bearer(reader) })).status).toBe(200);
      expect(
         (
            await app.request('/api/v1/subscribers', {
               method: 'POST',
               headers: bearer(reader),
               body: JSON.stringify({ email: 'read-only@example.com' }),
            })
         ).status,
      ).toBe(403);
      expect(
         (
            await app.request('/api/v1/tags', {
               method: 'POST',
               headers: bearer(reader),
               body: JSON.stringify({ name: 'blocked' }),
            })
         ).status,
      ).toBe(403);
      expect(
         (
            await app.request('/api/v1/campaigns', {
               method: 'POST',
               headers: bearer(reader),
               body: JSON.stringify({}),
            })
         ).status,
      ).toBe(403);

      expect(
         (
            await app.request('/api/v1/subscribers', {
               method: 'POST',
               headers: bearer(writer),
               body: JSON.stringify({ email: 'writer@example.com' }),
            })
         ).status,
      ).toBe(201);
      expect((await app.request('/api/v1/subscribers', { headers: bearer(writer) })).status).toBe(
         403,
      );
   });

   it('requires send:write for the campaign send lifecycle', async () => {
      const campaignWriter = await seedApiKey(['campaigns:write']);

      const response = await app.request('/api/v1/campaigns/cmp_missing/schedule', {
         method: 'POST',
         headers: bearer(campaignWriter),
         body: JSON.stringify({ scheduledAt: now() + 600 }),
      });

      expect(response.status).toBe(403);
      expect((await json(response)).error.code).toBe('forbidden');
   });

   it('keeps API key administration session-only', async () => {
      const raw = await seedApiKey(['subscribers:read']);

      const response = await app.request('/api/v1/settings/api-keys', { headers: bearer(raw) });
      expect(response.status).toBe(403);
   });

   it('leaves session users unrestricted while still requiring CSRF', async () => {
      const owner = await seedOwner();

      expect(
         (await app.request('/api/v1/subscribers', { headers: { cookie: owner.cookie } })).status,
      ).toBe(200);

      const noCsrf = await app.request('/api/v1/tags', {
         method: 'POST',
         headers: { cookie: owner.cookie, 'content-type': 'application/json' },
         body: JSON.stringify({ name: 'session-tag' }),
      });
      expect(noCsrf.status).toBe(403);

      const withCsrf = await app.request('/api/v1/tags', {
         method: 'POST',
         headers: authHeaders(owner),
         body: JSON.stringify({ name: 'session-tag' }),
      });
      expect(withCsrf.status).toBe(201);
   });
});

describe('OAuth discovery and registration', () => {
   it('advertises protected resource metadata for the MCP endpoint', async () => {
      const response = await SELF.fetch(`${APP_URL}/.well-known/oauth-protected-resource/mcp`);
      expect(response.status).toBe(200);

      const body = await json(response);
      expect(body.resource).toBe(`${APP_URL}/mcp`);
      expect(body.authorization_servers).toEqual([APP_URL]);
      expect(body.bearer_methods_supported).toEqual(['header']);
   });

   it('advertises authorization server metadata with PKCE, DCR and CIMD', async () => {
      const response = await SELF.fetch(`${APP_URL}/.well-known/oauth-authorization-server`);
      expect(response.status).toBe(200);

      const body = await json(response);
      expect(body.issuer).toBe(APP_URL);
      expect(body.authorization_endpoint).toBe(`${APP_URL}/oauth/authorize`);
      expect(body.token_endpoint).toBe(`${APP_URL}/oauth/token`);
      expect(body.registration_endpoint).toBe(`${APP_URL}/oauth/register`);
      expect(body.code_challenge_methods_supported).toEqual(['S256']);
      expect(body.client_id_metadata_document_supported).toBe(true);
      expect(body.grant_types_supported).toContain('authorization_code');
      expect(body.grant_types_supported).toContain('refresh_token');
   });

   it('registers a public client and keeps localhost redirects', async () => {
      const client = await registerClient({
         redirect_uris: ['http://localhost:3333/callback', REDIRECT_URI],
      });

      expect(client.client_id).toBeTruthy();
      expect(client.redirect_uris).toEqual(['http://localhost:3333/callback', REDIRECT_URI]);
   });

   it('rejects insecure and fragmented redirect URIs', async () => {
      for (const redirect of ['http://evil.example/callback', `${REDIRECT_URI}#fragment`]) {
         const response = await SELF.fetch(`${APP_URL}/oauth/register`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
               client_name: 'Bad',
               redirect_uris: [redirect],
               token_endpoint_auth_method: 'none',
            }),
         });

         expect(response.status).toBe(400);
         expect((await json(response)).error).toBeTruthy();
      }
   });
});

describe('OAuth authorization code with PKCE', () => {
   it('sends an unauthenticated owner to login and preserves the return path', async () => {
      const client = await registerClient();
      const params = new URLSearchParams({
         response_type: 'code',
         client_id: client.client_id,
         redirect_uri: REDIRECT_URI,
         scope: 'tags:read',
         code_challenge: CHALLENGE,
         code_challenge_method: 'S256',
      });

      const response = await SELF.fetch(`${APP_URL}/oauth/authorize?${params.toString()}`, {
         redirect: 'manual',
      });
      expect(response.status).toBe(302);

      const location = new URL(response.headers.get('location') ?? '');
      expect(`${location.origin}${location.pathname}`).toBe(`${APP_URL}/login`);
      expect(location.searchParams.get('next')).toContain('/oauth/authorize?');
   });

   it('does not restrict form-action, so the browser can follow the callback redirect', async () => {
      const client = await registerClient();
      const owner = await seedOwner();
      const params = new URLSearchParams({
         response_type: 'code',
         client_id: client.client_id,
         redirect_uri: REDIRECT_URI,
         scope: 'tags:read',
         code_challenge: CHALLENGE,
         code_challenge_method: 'S256',
      });

      const consent = await SELF.fetch(`${APP_URL}/oauth/authorize?${params.toString()}`, {
         headers: { cookie: owner.cookie },
         redirect: 'manual',
      });

      expect(consent.status).toBe(200);
      // A form-action policy also governs the 302 that follows the consent POST.
      // Restricting it to 'self' makes the browser drop the code instead of
      // navigating to the client's callback.
      expect(consent.headers.get('content-security-policy') ?? '').not.toContain('form-action');
   });

   it('renders consent and exchanges a code for access and refresh tokens', async () => {
      const client = await registerClient();
      const approval = await approveConsent(client, { scopes: 'tags:read tags:write' });

      const token = await exchangeCode(client.client_id, approval.code);
      expect(token.status).toBe(200);
      expect(token.headers.get('cache-control')).toBe('no-store');

      const body = await json(token);
      expect(body.token_type.toLowerCase()).toBe('bearer');
      expect(body.expires_in).toBe(3600);
      expect(body.access_token).toBeTruthy();
      expect(body.refresh_token).toBeTruthy();
      expect(body.scope).toBe('tags:read tags:write');

      const rest = await app.request('/api/v1/tags', {
         headers: { authorization: `Bearer ${body.access_token}` },
      });
      expect(rest.status).toBe(401);
   });

   it('defaults to read-only scopes when the client requests none', async () => {
      const client = await registerClient();
      const approval = await approveConsent(client, { scopes: '' });

      const tokens = await json(await exchangeCode(client.client_id, approval.code));
      expect(tokens.scope.split(' ').sort()).toEqual(
         ['campaigns:read', 'subscribers:read', 'tags:read', 'templates:read'].sort(),
      );
   });

   it('renders each requested scope as a checked checkbox on the consent screen', async () => {
      const client = await registerClient();
      const owner = await seedOwner();
      const params = new URLSearchParams({
         response_type: 'code',
         client_id: client.client_id,
         redirect_uri: REDIRECT_URI,
         scope: 'tags:read tags:write',
         state: 'state-123',
         code_challenge: CHALLENGE,
         code_challenge_method: 'S256',
      });

      const consent = await SELF.fetch(`${APP_URL}/oauth/authorize?${params.toString()}`, {
         headers: { cookie: owner.cookie },
         redirect: 'manual',
      });

      expect(consent.status).toBe(200);
      const html = await consent.text();
      expect(html).toContain('name="scope" value="tags:read" checked');
      expect(html).toContain('name="scope" value="tags:write" checked');
      expect(html).toContain('name="scope_present" value="1"');
   });

   it('grants only the scopes the user keeps on the consent screen', async () => {
      const client = await registerClient();
      const approval = await approveConsent(client, {
         scopes: 'tags:read tags:write',
         granted: ['tags:write'],
      });

      const tokens = await json(await exchangeCode(client.client_id, approval.code));
      expect(tokens.scope).toBe('tags:write');
   });

   it('ignores a submitted scope the client never requested', async () => {
      const client = await registerClient();
      const approval = await approveConsent(client, {
         scopes: 'tags:read',
         granted: ['tags:read', 'campaigns:write'],
      });

      const tokens = await json(await exchangeCode(client.client_id, approval.code));
      expect(tokens.scope).toBe('tags:read');
   });

   it('rejects a wrong verifier, redirect mismatch and wrong resource', async () => {
      const client = await registerClient();
      const approval = await approveConsent(client, { scopes: 'tags:read' });

      const wrongVerifier = await exchangeCode(client.client_id, approval.code, {
         verifier: 'wrong-verifier-0123456789-abcdefghijklmnopqrstuvwxyzABCDE',
      });
      expect(wrongVerifier.status).toBe(400);
      expect((await json(wrongVerifier)).error).toBe('invalid_grant');

      const wrongRedirect = await exchangeCode(client.client_id, approval.code, {
         redirectUri: 'https://client.example/other',
      });
      expect(wrongRedirect.status).toBe(400);
      expect((await json(wrongRedirect)).error).toBe('invalid_grant');

      const wrongResource = await exchangeCode(client.client_id, approval.code, {
         resource: 'https://evil.example/mcp',
      });
      expect(wrongResource.status).toBe(400);
      expect((await json(wrongResource)).error).toBe('invalid_target');
   });

   it('rejects a reused authorization code', async () => {
      const client = await registerClient();
      const approval = await approveConsent(client, { scopes: 'tags:read' });

      const first = await exchangeCode(client.client_id, approval.code);
      expect(first.status).toBe(200);

      const second = await exchangeCode(client.client_id, approval.code);
      expect(second.status).toBe(400);
      expect((await json(second)).error).toBe('invalid_grant');
   });

   it('rotates refresh tokens and rejects the previous token after use', async () => {
      const client = await registerClient();
      const approval = await approveConsent(client, { scopes: 'tags:read' });
      const first = await json(await exchangeCode(client.client_id, approval.code));

      const rotatedResponse = await refresh(client.client_id, first.refresh_token);
      expect(rotatedResponse.status).toBe(200);
      const rotated = await json(rotatedResponse);
      expect(rotated.refresh_token).not.toBe(first.refresh_token);

      const secondRotation = await refresh(client.client_id, rotated.refresh_token);
      expect(secondRotation.status).toBe(200);

      const reuse = await refresh(client.client_id, first.refresh_token);
      expect(reuse.status).toBe(400);
      expect((await json(reuse)).error).toBe('invalid_grant');
   });
});

describe('MCP endpoint', () => {
   it('returns a 401 challenge pointing at protected resource metadata', async () => {
      const response = await SELF.fetch(`${APP_URL}/mcp`, {
         method: 'POST',
         headers: { 'content-type': 'application/json' },
         body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize' }),
      });

      expect(response.status).toBe(401);
      expect(response.headers.get('www-authenticate')).toContain(
         `resource_metadata="${APP_URL}/.well-known/oauth-protected-resource/mcp"`,
      );
   });

   it('initializes, answers ping and lists tools with an API key', async () => {
      const raw = await seedApiKey(['tags:read']);

      const initialized = await mcp(raw, {
         jsonrpc: '2.0',
         id: 1,
         method: 'initialize',
         params: { protocolVersion: '2025-06-18', clientInfo: { name: 'test', version: '1' } },
      });
      expect(initialized.status).toBe(200);
      const init = await json(initialized);
      expect(init.result.protocolVersion).toBe('2025-06-18');
      expect(init.result.serverInfo.name).toBe('postwren');
      expect(init.result.capabilities.tools).toBeDefined();

      const notification = await mcp(raw, {
         jsonrpc: '2.0',
         method: 'notifications/initialized',
      });
      expect(notification.status).toBe(202);

      const pong = await json(await mcp(raw, { jsonrpc: '2.0', id: 2, method: 'ping' }));
      expect(pong.result).toEqual({});

      const listed = await json(await mcp(raw, { jsonrpc: '2.0', id: 3, method: 'tools/list' }));
      const names = (listed.result.tools as Array<{ name: string }>).map((tool) => tool.name);
      expect(names).toEqual(
         expect.arrayContaining([
            'list_tags',
            'create_tag',
            'list_subscribers',
            'get_subscriber',
            'create_subscriber',
            'update_subscriber',
            'delete_subscriber',
            'assign_tag',
            'remove_tag',
            'bulk_tag_subscribers',
            'list_campaigns',
            'get_campaign',
            'create_campaign',
            'update_campaign',
            'preview_audience',
            'schedule_campaign',
            'send_campaign_now',
            'pause_campaign',
            'resume_campaign',
            'get_campaign_stats',
            'list_templates',
            'get_template',
            'create_template',
            'update_template',
            'preview_template',
         ]),
      );
   });

   it('calls REST tools with the caller scopes and returns an envelope', async () => {
      const reader = await seedApiKey(['tags:read']);
      await env.DB.prepare('INSERT INTO tags (id, name, created_at) VALUES (?, ?, ?)')
         .bind('tag_1', 'news', now())
         .run();

      const listed = await json(
         await mcp(reader, {
            jsonrpc: '2.0',
            id: 4,
            method: 'tools/call',
            params: { name: 'list_tags', arguments: {} },
         }),
      );
      const content = JSON.parse(listed.result.content[0].text) as {
         data: Array<{ name: string }>;
         error: null;
      };
      expect(content.error).toBeNull();
      expect(content.data.map((tag) => tag.name)).toEqual(['news']);

      const denied = await json(
         await mcp(reader, {
            jsonrpc: '2.0',
            id: 5,
            method: 'tools/call',
            params: { name: 'create_tag', arguments: { name: 'blocked' } },
         }),
      );
      expect(denied.result.isError).toBe(true);
      const deniedBody = JSON.parse(denied.result.content[0].text) as {
         error: { code: string };
      };
      expect(deniedBody.error.code).toBe('forbidden');
   });

   it('writes subscribers through the REST routes, not MCP-specific SQL', async () => {
      const raw = await seedApiKey(['subscribers:read', 'subscribers:write']);

      const created = await json(
         await mcp(raw, {
            jsonrpc: '2.0',
            id: 6,
            method: 'tools/call',
            params: {
               name: 'create_subscriber',
               arguments: { email: 'mcp@example.com', firstName: 'MCP' },
            },
         }),
      );
      const createdBody = JSON.parse(created.result.content[0].text) as {
         data: { id: string; email: string };
         error: null;
      };
      expect(createdBody.error).toBeNull();
      expect(createdBody.data.email).toBe('mcp@example.com');

      const fetched = await json(
         await mcp(raw, {
            jsonrpc: '2.0',
            id: 7,
            method: 'tools/call',
            params: { name: 'get_subscriber', arguments: { id: createdBody.data.id } },
         }),
      );
      const fetchedBody = JSON.parse(fetched.result.content[0].text) as {
         data: { email: string };
      };
      expect(fetchedBody.data.email).toBe('mcp@example.com');
   });

   it('reports unknown methods and tools as JSON-RPC errors', async () => {
      const raw = await seedApiKey(['tags:read']);

      const method = await json(
         await mcp(raw, { jsonrpc: '2.0', id: 8, method: 'resources/list' }),
      );
      expect(method.error.code).toBe(-32601);

      const tool = await json(
         await mcp(raw, {
            jsonrpc: '2.0',
            id: 9,
            method: 'tools/call',
            params: { name: 'drop_database', arguments: {} },
         }),
      );
      expect(tool.error.code).toBe(-32602);
   });

   it('accepts an OAuth access token on MCP and uses its scopes', async () => {
      const client = await registerClient();
      const approval = await approveConsent(client, { scopes: 'tags:read tags:write' });
      const tokens = await json(await exchangeCode(client.client_id, approval.code));

      const response = await mcp(tokens.access_token, {
         jsonrpc: '2.0',
         id: 10,
         method: 'tools/call',
         params: { name: 'create_tag', arguments: { name: 'from-oauth' } },
      });
      expect(response.status).toBe(200);

      const body = await json(response);
      const content = JSON.parse(body.result.content[0].text) as {
         data: { name: string };
         error: null;
      };
      expect(content.error).toBeNull();
      expect(content.data.name).toBe('from-oauth');
   });

   it('keeps subscriber export matched ahead of the new single-subscriber route', async () => {
      const owner = await seedOwner();

      const response = await app.request('/api/v1/subscribers/export', {
         headers: { cookie: owner.cookie },
      });
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/csv');
   });
});
