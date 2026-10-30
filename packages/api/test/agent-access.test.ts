import { beforeEach, describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import { sha256Hex } from '@mailer/worker-kit/ids';
import type { Scope } from '../src/auth/scopes';
import { apiKeyHash, generateApiKey } from '../src/auth/api-key';
import { pkceChallenge } from '../src/oauth/pkce';
import { authHeaders, baseEnv, createAppForTest, json, now, resetDb, seedOwner } from './helpers';

const app = createAppForTest();
const APP_URL = baseEnv().APP_URL.replace(/\/+$/, '');
const REDIRECT_URI = 'https://client.example/callback';
const VERIFIER = 'test-verifier-0123456789-abcdefghijklmnopqrstuvwxyzABCDE';

async function resetAgentDb(): Promise<void> {
   await env.DB.batch([
      env.DB.prepare('DELETE FROM oauth_tokens'),
      env.DB.prepare('DELETE FROM oauth_grants'),
      env.DB.prepare('DELETE FROM oauth_clients'),
      env.DB.prepare('DELETE FROM api_keys'),
   ]);
   await resetDb();
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

async function registerClient(
   overrides: Record<string, unknown> = {},
): Promise<{ client_id: string; redirect_uris: string[] }> {
   const response = await app.request('/oauth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
         client_name: 'Test connector',
         redirect_uris: [REDIRECT_URI],
         ...overrides,
      }),
   });

   expect(response.status).toBe(201);
   return json(response);
}

type Client = { client_id: string; redirect_uris: string[] };

async function authorize(
   client: Client,
   options: { scopes?: string; verifier?: string; redirectUri?: string; resource?: string } = {},
): Promise<Response> {
   const owner = await seedOwner();
   const verifier = options.verifier ?? VERIFIER;
   const params = new URLSearchParams({
      response_type: 'code',
      client_id: client.client_id,
      redirect_uri: options.redirectUri ?? client.redirect_uris[0] ?? REDIRECT_URI,
      scope: options.scopes ?? 'subscribers:read tags:read',
      state: 'state-123',
      code_challenge: await pkceChallenge(verifier),
      code_challenge_method: 'S256',
   });
   if (options.resource !== undefined) params.set('resource', options.resource);

   const consent = await app.request(`/oauth/authorize?${params.toString()}`, {
      headers: { cookie: owner.cookie },
   });

   expect(consent.status).toBe(200);

   const form = new URLSearchParams(params);
   form.set('csrf', owner.csrf);
   form.set('decision', 'approve');

   return app.request('/oauth/authorize', {
      method: 'POST',
      headers: {
         cookie: owner.cookie,
         'content-type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
   });
}

function codeFrom(response: Response): string {
   const location = response.headers.get('location');
   expect(location).not.toBeNull();
   const code = new URL(location ?? '').searchParams.get('code');
   expect(code).not.toBeNull();
   return code ?? '';
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

   return app.request('/oauth/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: tokenForm(body),
   });
}

async function mcp(raw: string, payload: unknown): Promise<Response> {
   return app.request('/mcp', {
      method: 'POST',
      headers: {
         authorization: `Bearer ${raw}`,
         'content-type': 'application/json',
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
      expect(createdBody.data.key).toMatch(/^mlr_[a-z0-9]+_/);
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
         (await app.request('/api/v1/tags', { headers: bearer('mlr_abcdef_invalidsecretvalue') }))
            .status,
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
      const response = await app.request('/.well-known/oauth-protected-resource');
      expect(response.status).toBe(200);

      const body = await json(response);
      expect(body.resource).toBe(`${APP_URL}/mcp`);
      expect(body.authorization_servers).toEqual([APP_URL]);
      expect(body.bearer_methods_supported).toEqual(['header']);
      expect(body.scopes_supported).toContain('send:write');

      const alias = await app.request('/.well-known/oauth-protected-resource/mcp');
      expect(alias.status).toBe(200);
      expect((await json(alias)).resource).toBe(`${APP_URL}/mcp`);
   });

   it('advertises authorization server metadata with PKCE S256', async () => {
      const response = await app.request('/.well-known/oauth-authorization-server');
      expect(response.status).toBe(200);

      const body = await json(response);
      expect(body.issuer).toBe(APP_URL);
      expect(body.authorization_endpoint).toBe(`${APP_URL}/oauth/authorize`);
      expect(body.token_endpoint).toBe(`${APP_URL}/oauth/token`);
      expect(body.registration_endpoint).toBe(`${APP_URL}/oauth/register`);
      expect(body.code_challenge_methods_supported).toEqual(['S256']);
      expect(body.token_endpoint_auth_methods_supported).toEqual(['none']);
   });

   it('registers a public client and keeps localhost redirects', async () => {
      const client = await registerClient({
         redirect_uris: ['http://localhost:3333/callback', REDIRECT_URI],
      });

      expect(client.client_id).toMatch(/^ocl/);
      expect(client.redirect_uris).toEqual(['http://localhost:3333/callback', REDIRECT_URI]);
   });

   it('rejects insecure, fragmented and confidential clients', async () => {
      for (const overrides of [
         { redirect_uris: ['http://evil.example/callback'] },
         { redirect_uris: [`${REDIRECT_URI}#fragment`] },
         { token_endpoint_auth_method: 'client_secret_basic' },
      ]) {
         const response = await app.request('/oauth/register', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ client_name: 'Bad', ...overrides }),
         });

         expect(response.status).toBe(400);
         expect((await json(response)).error).toBe('invalid_client_metadata');
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
         code_challenge: await pkceChallenge(VERIFIER),
         code_challenge_method: 'S256',
      });

      const response = await app.request(`/oauth/authorize?${params.toString()}`);
      expect(response.status).toBe(302);

      const location = new URL(response.headers.get('location') ?? '');
      expect(`${location.origin}${location.pathname}`).toBe(`${APP_URL}/login`);
      expect(location.searchParams.get('next')).toContain('/oauth/authorize?');
   });

   it('renders consent and exchanges a code for access and refresh tokens', async () => {
      const client = await registerClient();
      const approval = await authorize(client, { scopes: 'tags:read tags:write' });
      expect(approval.status).toBe(302);
      expect(new URL(approval.headers.get('location') ?? '').searchParams.get('state')).toBe(
         'state-123',
      );

      const code = codeFrom(approval);
      const token = await exchangeCode(client.client_id, code);
      expect(token.status).toBe(200);
      expect(token.headers.get('cache-control')).toBe('no-store');

      const body = await json(token);
      expect(body.token_type).toBe('Bearer');
      expect(body.expires_in).toBe(3600);
      expect(body.access_token).toMatch(/^mlro_access_/);
      expect(body.refresh_token).toMatch(/^mlro_refresh_/);
      expect(body.scope).toBe('tags:read tags:write');

      const rest = await app.request('/api/v1/tags', {
         headers: { authorization: `Bearer ${body.access_token}` },
      });
      expect(rest.status).toBe(200);
   });

   it('rejects a wrong verifier, redirect mismatch and wrong resource', async () => {
      const client = await registerClient();
      const code = codeFrom(await authorize(client, { scopes: 'tags:read' }));

      const wrongVerifier = await exchangeCode(client.client_id, code, {
         verifier: 'wrong-verifier-0123456789-abcdefghijklmnopqrstuvwxyzABCDE',
      });
      expect(wrongVerifier.status).toBe(400);
      expect((await json(wrongVerifier)).error).toBe('invalid_grant');

      const wrongRedirect = await exchangeCode(client.client_id, code, {
         redirectUri: 'https://client.example/other',
      });
      expect(wrongRedirect.status).toBe(400);
      expect((await json(wrongRedirect)).error).toBe('invalid_grant');

      const wrongResource = await exchangeCode(client.client_id, code, {
         resource: 'https://evil.example/mcp',
      });
      expect(wrongResource.status).toBe(400);
      expect((await json(wrongResource)).error).toBe('invalid_target');
   });

   it('rejects a reused authorization code and revokes the grant', async () => {
      const client = await registerClient();
      const code = codeFrom(await authorize(client, { scopes: 'tags:read' }));

      const first = await exchangeCode(client.client_id, code);
      expect(first.status).toBe(200);
      const firstBody = await json(first);

      const second = await exchangeCode(client.client_id, code);
      expect(second.status).toBe(400);
      expect((await json(second)).error).toBe('invalid_grant');

      const access = await app.request('/api/v1/tags', {
         headers: { authorization: `Bearer ${firstBody.access_token}` },
      });
      expect(access.status).toBe(401);
   });

   it('rotates refresh tokens and revokes the grant on reuse', async () => {
      const client = await registerClient();
      const code = codeFrom(await authorize(client, { scopes: 'tags:read' }));
      const first = await json(await exchangeCode(client.client_id, code));

      const wrongResource = await app.request('/oauth/token', {
         method: 'POST',
         headers: { 'content-type': 'application/x-www-form-urlencoded' },
         body: tokenForm({
            grant_type: 'refresh_token',
            client_id: client.client_id,
            refresh_token: first.refresh_token,
            resource: 'https://evil.example/mcp',
         }),
      });
      expect(wrongResource.status).toBe(400);
      expect((await json(wrongResource)).error).toBe('invalid_target');

      const rotatedResponse = await app.request('/oauth/token', {
         method: 'POST',
         headers: { 'content-type': 'application/x-www-form-urlencoded' },
         body: tokenForm({
            grant_type: 'refresh_token',
            client_id: client.client_id,
            refresh_token: first.refresh_token,
         }),
      });
      expect(rotatedResponse.status).toBe(200);

      const rotated = await json(rotatedResponse);
      expect(rotated.refresh_token).not.toBe(first.refresh_token);

      const reuse = await app.request('/oauth/token', {
         method: 'POST',
         headers: { 'content-type': 'application/x-www-form-urlencoded' },
         body: tokenForm({
            grant_type: 'refresh_token',
            client_id: client.client_id,
            refresh_token: first.refresh_token,
         }),
      });
      expect(reuse.status).toBe(400);
      expect((await json(reuse)).error).toBe('invalid_grant');

      const revoked = await app.request('/api/v1/tags', {
         headers: { authorization: `Bearer ${rotated.access_token}` },
      });
      expect(revoked.status).toBe(401);
   });

   it('rejects unknown scopes before issuing a code', async () => {
      const client = await registerClient();
      const owner = await seedOwner();
      const params = new URLSearchParams({
         response_type: 'code',
         client_id: client.client_id,
         redirect_uri: REDIRECT_URI,
         scope: 'subscribers:delete',
         code_challenge: await pkceChallenge(VERIFIER),
         code_challenge_method: 'S256',
      });
      const form = new URLSearchParams(params);
      form.set('csrf', owner.csrf);
      form.set('decision', 'approve');

      const response = await app.request('/oauth/authorize', {
         method: 'POST',
         headers: {
            cookie: owner.cookie,
            'content-type': 'application/x-www-form-urlencoded',
         },
         body: form.toString(),
      });

      expect(response.status).toBe(302);
      const location = new URL(response.headers.get('location') ?? '');
      expect(location.searchParams.get('error')).toBe('invalid_scope');
   });
});

describe('MCP endpoint', () => {
   it('returns a 401 challenge pointing at protected resource metadata', async () => {
      const response = await app.request('/mcp', {
         method: 'POST',
         headers: { 'content-type': 'application/json' },
         body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize' }),
      });

      expect(response.status).toBe(401);
      expect(response.headers.get('www-authenticate')).toContain(
         `resource_metadata="${APP_URL}/.well-known/oauth-protected-resource"`,
      );
   });

   it('initializes, answers ping and lists tools', async () => {
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
      expect(init.result.serverInfo.name).toBe('mailer-cloudflare');
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

   it('accepts an OAuth access token on both MCP and REST', async () => {
      const client = await registerClient();
      const code = codeFrom(await authorize(client, { scopes: 'subscribers:read' }));
      const tokens = await json(await exchangeCode(client.client_id, code));

      const response = await mcp(tokens.access_token, {
         jsonrpc: '2.0',
         id: 10,
         method: 'tools/list',
      });
      expect(response.status).toBe(200);
      expect((await json(response)).result.tools).toBeDefined();

      const rest = await app.request('/api/v1/subscribers', {
         headers: { authorization: `Bearer ${tokens.access_token}` },
      });
      expect(rest.status).toBe(200);
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
