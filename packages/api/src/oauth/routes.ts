import { Hono } from 'hono';
import type { Context } from 'hono';
import { getCookie } from 'hono/cookie';
import { z } from 'zod';
import { createId } from '@mailer/worker-kit/ids';
import { timingSafeEqual } from '@mailer/worker-kit/http';
import type { AppEnv, Env } from '../env';
import { CSRF_COOKIE, SESSION_COOKIE, findSessionUser } from '../auth/session';
import { isScope, parseScopes, serialiseScopes } from '../auth/scopes';
import type { Scope } from '../auth/scopes';
import { nowSeconds } from '../lib/time';
import { consumeRateLimit } from '../lib/rate-limit';
import { requestClientIp } from '../middleware/context';
import {
   AUTHORIZATION_CODE_TTL_SECONDS,
   isAllowedResource,
   issuer,
   mcpResource,
   normaliseResource,
} from './config';
import {
   ClientMetadataError,
   assertGrantTypes,
   assertPublicClient,
   assertResponseTypes,
   normaliseRedirectUris,
   registerInput,
} from './clients';
import { newOpaqueToken, issueTokenPair, revokeGrant, tokenHash } from './tokens';
import { verifyPkce } from './pkce';
import { renderConsentError, renderConsentPage } from './consent';

const AUTHORIZE_LIMIT = { windowSeconds: 60, max: 30 } as const;
const TOKEN_LIMIT = { windowSeconds: 60, max: 60 } as const;
const REGISTER_LIMIT = { windowSeconds: 60, max: 10 } as const;

const DEFAULT_SCOPES: Scope[] = [
   'subscribers:read',
   'campaigns:read',
   'templates:read',
   'tags:read',
];

const authorizeQuerySchema = z.object({
   response_type: z.string().optional(),
   client_id: z.string().trim().min(1).optional(),
   redirect_uri: z.string().trim().min(1).optional(),
   scope: z.string().optional(),
   state: z.string().optional(),
   code_challenge: z.string().trim().min(1).optional(),
   code_challenge_method: z.string().trim().optional(),
   resource: z.string().trim().optional(),
});

type AuthorizeParams = z.infer<typeof authorizeQuerySchema>;

type ClientRow = {
   id: string;
   client_name: string;
   redirect_uris: string;
   scope: string | null;
};

type CodeRow = {
   id: string;
   grant_id: string;
   client_id: string;
   user_id: string;
   scopes: string;
   audience: string;
   redirect_uri: string | null;
   code_challenge: string | null;
   code_challenge_method: string | null;
   expires_at: number;
   used_at: number | null;
   revoked_at: number | null;
   grant_revoked_at: number | null;
};

type RefreshRow = {
   id: string;
   grant_id: string;
   client_id: string;
   user_id: string;
   scopes: string;
   audience: string;
   expires_at: number;
   used_at: number | null;
   revoked_at: number | null;
   grant_revoked_at: number | null;
};

export const oauthRoutes = new Hono<AppEnv>();

function jsonError(
   status: number,
   code: string,
   description: string,
   extraHeaders: Record<string, string> = {},
): Response {
   return new Response(JSON.stringify({ error: code, error_description: description }), {
      status,
      headers: {
         'content-type': 'application/json; charset=utf-8',
         'cache-control': 'no-store',
         pragma: 'no-cache',
         ...extraHeaders,
      },
   });
}

function htmlError(status: number, message: string): Response {
   return new Response(renderConsentError(message), {
      status,
      headers: {
         'content-type': 'text/html; charset=utf-8',
         'cache-control': 'no-store',
         'content-security-policy':
            "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'",
         'x-frame-options': 'DENY',
         'referrer-policy': 'no-referrer',
      },
   });
}

async function loadClient(env: Env, id: string): Promise<ClientRow | null> {
   return env.DB.prepare(
      'SELECT id, client_name, redirect_uris, scope FROM oauth_clients WHERE id = ?',
   )
      .bind(id)
      .first<ClientRow>();
}

function redirectUrisOf(client: ClientRow): string[] {
   try {
      const parsed: unknown = JSON.parse(client.redirect_uris);
      return Array.isArray(parsed)
         ? parsed.filter((value): value is string => typeof value === 'string')
         : [];
   } catch {
      return [];
   }
}

function redirectWith(base: string, params: Record<string, string | undefined>): Response {
   const url = new URL(base);
   for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) url.searchParams.set(key, value);
   }
   return new Response(null, {
      status: 302,
      headers: { location: url.toString(), 'cache-control': 'no-store' },
   });
}

function redirectError(
   base: string,
   error: string,
   description: string,
   state: string | undefined,
): Response {
   return redirectWith(base, { error, error_description: description, state });
}

function requestedScopes(params: AuthorizeParams, client: ClientRow): Scope[] | null {
   if (params.scope === undefined || params.scope.trim().length === 0) {
      if (client.scope !== null && client.scope.trim().length > 0) {
         return client.scope.split(/\s+/).filter((value): value is Scope => isScope(value));
      }
      return [...DEFAULT_SCOPES];
   }

   const values = params.scope.split(/\s+/).filter((value) => value.length > 0);
   const scopes: Scope[] = [];
   for (const value of values) {
      if (!isScope(value)) return null;
      if (!scopes.includes(value)) scopes.push(value);
   }
   return scopes.length === 0 ? null : scopes;
}

type ValidatedAuthorize =
   | { ok: true; client: ClientRow; params: AuthorizeParams; scopes: Scope[]; resource: string }
   | { ok: false; response: Response };

async function validateAuthorize(env: Env, params: AuthorizeParams): Promise<ValidatedAuthorize> {
   if (params.client_id === undefined) {
      return { ok: false, response: htmlError(400, 'Missing client_id') };
   }

   const client = await loadClient(env, params.client_id);
   if (client === null) {
      return { ok: false, response: htmlError(400, 'Unknown client') };
   }

   if (params.redirect_uri === undefined || params.redirect_uri.length === 0) {
      return { ok: false, response: htmlError(400, 'Missing redirect_uri') };
   }

   if (!redirectUrisOf(client).includes(params.redirect_uri)) {
      return {
         ok: false,
         response: htmlError(400, 'redirect_uri is not registered for this client'),
      };
   }

   if (params.response_type !== 'code') {
      return {
         ok: false,
         response: redirectError(
            params.redirect_uri,
            'unsupported_response_type',
            'Only response_type=code is supported',
            params.state,
         ),
      };
   }

   if (params.code_challenge === undefined || params.code_challenge_method !== 'S256') {
      return {
         ok: false,
         response: redirectError(
            params.redirect_uri,
            'invalid_request',
            'PKCE with code_challenge_method=S256 is required',
            params.state,
         ),
      };
   }

   const scopes = requestedScopes(params, client);
   if (scopes === null) {
      return {
         ok: false,
         response: redirectError(
            params.redirect_uri,
            'invalid_scope',
            'One or more requested scopes are not supported',
            params.state,
         ),
      };
   }

   let resource = mcpResource(env);
   if (params.resource !== undefined && params.resource.length > 0) {
      if (!isAllowedResource(env, params.resource)) {
         return {
            ok: false,
            response: redirectError(
               params.redirect_uri,
               'invalid_target',
               'Unsupported resource indicator',
               params.state,
            ),
         };
      }
      resource = normaliseResource(params.resource);
   }

   return { ok: true, client, params, scopes, resource };
}

function loginRedirect(c: { req: { path: string; url: string } }, env: Env): Response {
   const url = new URL(c.req.url);
   const target = `${url.pathname}${url.search}`;
   const login = new URL(`${issuer(env)}/login`);
   login.searchParams.set('next', target);
   return new Response(null, { status: 302, headers: { location: login.toString() } });
}

oauthRoutes.get('/authorize', async (c) => {
   const parsed = authorizeQuerySchema.safeParse(c.req.query());
   if (!parsed.success) {
      return htmlError(400, 'Invalid authorization request');
   }

   const validation = await validateAuthorize(c.env, parsed.data);
   if (!validation.ok) return validation.response;

   const sessionRaw = getCookie(c, SESSION_COOKIE);
   const user =
      sessionRaw === undefined || sessionRaw.length === 0
         ? null
         : await findSessionUser(c.env, sessionRaw);

   if (user === null) {
      return loginRedirect(c, c.env);
   }

   const csrf = getCookie(c, CSRF_COOKIE) ?? '';
   const { client, params, scopes } = validation;

   return new Response(
      renderConsentPage({
         clientName: client.client_name,
         clientId: client.id,
         username: user.email,
         scopes,
         csrf,
         params: {
            client_id: params.client_id ?? client.id,
            redirect_uri: params.redirect_uri ?? '',
            response_type: 'code',
            scope: scopes.join(' '),
            state: params.state,
            code_challenge: params.code_challenge ?? '',
            code_challenge_method: 'S256',
            resource: validation.resource,
         },
      }),
      {
         status: 200,
         headers: {
            'content-type': 'text/html; charset=utf-8',
            'cache-control': 'no-store',
            'content-security-policy':
               "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'",
            'x-frame-options': 'DENY',
            'referrer-policy': 'no-referrer',
         },
      },
   );
});

oauthRoutes.post('/authorize', async (c) => {
   await consumeRateLimit(c.env.DB, `oauth-authorize:ip:${requestClientIp(c)}`, AUTHORIZE_LIMIT);

   const body = await c.req.parseBody();
   const value = (key: string): string | undefined => {
      const entry = body[key];
      return typeof entry === 'string' ? entry : undefined;
   };

   const parsed = authorizeQuerySchema.safeParse({
      response_type: value('response_type'),
      client_id: value('client_id'),
      redirect_uri: value('redirect_uri'),
      scope: value('scope'),
      state: value('state'),
      code_challenge: value('code_challenge'),
      code_challenge_method: value('code_challenge_method'),
      resource: value('resource'),
   });

   if (!parsed.success) {
      return htmlError(400, 'Invalid authorization request');
   }

   const validation = await validateAuthorize(c.env, parsed.data);
   if (!validation.ok) return validation.response;

   const csrf = value('csrf') ?? '';
   const cookie = getCookie(c, CSRF_COOKIE) ?? '';
   if (csrf.length === 0 || cookie.length === 0 || !timingSafeEqual(csrf, cookie)) {
      return htmlError(403, 'Invalid CSRF token');
   }

   const sessionRaw = getCookie(c, SESSION_COOKIE);
   const user =
      sessionRaw === undefined || sessionRaw.length === 0
         ? null
         : await findSessionUser(c.env, sessionRaw);

   if (user === null) {
      return loginRedirect(c, c.env);
   }

   const { client, params, scopes, resource } = validation;

   if (value('decision') !== 'approve') {
      return redirectError(
         params.redirect_uri ?? '',
         'access_denied',
         'The resource owner denied the request',
         params.state,
      );
   }

   const now = nowSeconds();
   const grantId = createId('ogr');

   await c.env.DB.prepare(
      `INSERT INTO oauth_grants (id, client_id, user_id, scopes, resource, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
   )
      .bind(grantId, client.id, user.id, serialiseScopes(scopes), resource, now)
      .run();

   const code = newOpaqueToken('code');
   await c.env.DB.prepare(
      `INSERT INTO oauth_tokens
       (id, grant_id, client_id, user_id, token_type, token_hash, scopes, audience,
        redirect_uri, code_challenge, code_challenge_method, expires_at, created_at)
       VALUES (?, ?, ?, ?, 'code', ?, ?, ?, ?, ?, 'S256', ?, ?)`,
   )
      .bind(
         createId('otk'),
         grantId,
         client.id,
         user.id,
         await tokenHash(code),
         serialiseScopes(scopes),
         resource,
         params.redirect_uri ?? '',
         params.code_challenge ?? '',
         now + AUTHORIZATION_CODE_TTL_SECONDS,
         now,
      )
      .run();

   return redirectWith(params.redirect_uri ?? '', { code, state: params.state });
});

type TokenBody = Record<string, string | undefined>;

async function readTokenBody(c: Context<AppEnv>): Promise<TokenBody> {
   const contentType = c.req.header('content-type') ?? '';

   if (
      contentType.includes('application/x-www-form-urlencoded') ||
      contentType.includes('multipart/form-data')
   ) {
      const body = await c.req.parseBody();
      const output: TokenBody = {};
      for (const [key, entry] of Object.entries(body)) {
         if (typeof entry === 'string') output[key] = entry;
      }
      return output;
   }

   try {
      const body = await c.req.json<unknown>();
      if (body === null || typeof body !== 'object' || Array.isArray(body)) return {};
      const output: TokenBody = {};
      for (const [key, entry] of Object.entries(body as Record<string, unknown>)) {
         if (typeof entry === 'string') output[key] = entry;
      }
      return output;
   } catch {
      return {};
   }
}

oauthRoutes.post('/token', async (c) => {
   await consumeRateLimit(c.env.DB, `oauth-token:ip:${requestClientIp(c)}`, TOKEN_LIMIT);

   if (c.req.header('authorization') !== undefined) {
      return jsonError(401, 'invalid_client', 'Public clients must not send client authentication');
   }

   const body = await readTokenBody(c);
   const grantType = body.grant_type;
   const clientId = body.client_id;

   if (grantType === undefined || clientId === undefined) {
      return jsonError(400, 'invalid_request', 'grant_type and client_id are required');
   }

   const client = await loadClient(c.env, clientId);
   if (client === null) {
      return jsonError(401, 'invalid_client', 'Unknown client');
   }

   if (grantType === 'authorization_code') {
      return exchangeAuthorizationCode(c.env, body, client);
   }

   if (grantType === 'refresh_token') {
      return exchangeRefreshToken(c.env, body, client);
   }

   return jsonError(400, 'unsupported_grant_type', `Unsupported grant_type: ${grantType}`);
});

async function exchangeAuthorizationCode(
   env: Env,
   body: TokenBody,
   client: ClientRow,
): Promise<Response> {
   const code = body.code;
   const redirectUri = body.redirect_uri;
   const verifier = body.code_verifier;

   if (code === undefined || redirectUri === undefined || verifier === undefined) {
      return jsonError(400, 'invalid_request', 'code, redirect_uri and code_verifier are required');
   }

   const now = nowSeconds();
   const row = await env.DB.prepare(
      `SELECT t.id, t.grant_id, t.client_id, t.user_id, t.scopes, t.audience,
              t.redirect_uri, t.code_challenge, t.code_challenge_method,
              t.expires_at, t.used_at, t.revoked_at, g.revoked_at AS grant_revoked_at
       FROM oauth_tokens t JOIN oauth_grants g ON g.id = t.grant_id
       WHERE t.token_hash = ? AND t.token_type = 'code'`,
   )
      .bind(await tokenHash(code))
      .first<CodeRow>();

   if (row === null || row.client_id !== client.id) {
      return jsonError(400, 'invalid_grant', 'Unknown authorization code');
   }

   if (row.used_at !== null) {
      await revokeGrant(env, row.grant_id, now);
      return jsonError(400, 'invalid_grant', 'Authorization code was already used');
   }

   if (row.revoked_at !== null || row.grant_revoked_at !== null || row.expires_at <= now) {
      return jsonError(400, 'invalid_grant', 'Authorization code is expired or revoked');
   }

   if (row.redirect_uri === null || row.redirect_uri !== redirectUri) {
      return jsonError(
         400,
         'invalid_grant',
         'redirect_uri does not match the authorization request',
      );
   }

   if (row.code_challenge === null || row.code_challenge_method !== 'S256') {
      return jsonError(400, 'invalid_grant', 'Authorization code has no PKCE challenge');
   }

   if (!(await verifyPkce(verifier, row.code_challenge, row.code_challenge_method))) {
      return jsonError(400, 'invalid_grant', 'PKCE verification failed');
   }

   const requestedResource = body.resource;
   if (requestedResource !== undefined && requestedResource.length > 0) {
      if (!isAllowedResource(env, requestedResource)) {
         return jsonError(400, 'invalid_target', 'Unsupported resource indicator');
      }
      if (normaliseResource(requestedResource) !== normaliseResource(row.audience)) {
         return jsonError(400, 'invalid_target', 'Resource does not match the authorization grant');
      }
   }

   const claimed = await env.DB.prepare(
      'UPDATE oauth_tokens SET used_at = ? WHERE id = ? AND used_at IS NULL',
   )
      .bind(now, row.id)
      .run();

   if ((claimed.meta.changes ?? 0) !== 1) {
      await revokeGrant(env, row.grant_id, now);
      return jsonError(400, 'invalid_grant', 'Authorization code was already used');
   }

   const scopes = parseScopes(row.scopes);
   const issued = await issueTokenPair(
      env,
      {
         grantId: row.grant_id,
         clientId: row.client_id,
         userId: row.user_id,
         scopes,
         audience: row.audience,
      },
      now,
   );

   return tokenResponse(issued);
}

async function exchangeRefreshToken(
   env: Env,
   body: TokenBody,
   client: ClientRow,
): Promise<Response> {
   const refreshToken = body.refresh_token;
   if (refreshToken === undefined) {
      return jsonError(400, 'invalid_request', 'refresh_token is required');
   }

   const now = nowSeconds();
   const row = await env.DB.prepare(
      `SELECT t.id, t.grant_id, t.client_id, t.user_id, t.scopes, t.audience,
              t.expires_at, t.used_at, t.revoked_at, g.revoked_at AS grant_revoked_at
       FROM oauth_tokens t JOIN oauth_grants g ON g.id = t.grant_id
       WHERE t.token_hash = ? AND t.token_type = 'refresh'`,
   )
      .bind(await tokenHash(refreshToken))
      .first<RefreshRow>();

   if (row === null || row.client_id !== client.id) {
      return jsonError(400, 'invalid_grant', 'Unknown refresh token');
   }

   if (row.used_at !== null) {
      await revokeGrant(env, row.grant_id, now);
      return jsonError(400, 'invalid_grant', 'Refresh token reuse detected; grant revoked');
   }

   if (row.revoked_at !== null || row.grant_revoked_at !== null || row.expires_at <= now) {
      return jsonError(400, 'invalid_grant', 'Refresh token is expired or revoked');
   }

   if (body.resource !== undefined && body.resource.length > 0) {
      if (!isAllowedResource(env, body.resource)) {
         return jsonError(400, 'invalid_target', 'Unsupported resource indicator');
      }
      if (normaliseResource(body.resource) !== normaliseResource(row.audience)) {
         return jsonError(400, 'invalid_target', 'Resource does not match the original grant');
      }
   }

   const original = parseScopes(row.scopes);
   let scopes = original;
   if (body.scope !== undefined && body.scope.trim().length > 0) {
      const narrowed: Scope[] = [];
      for (const value of body.scope.split(/\s+/).filter((entry) => entry.length > 0)) {
         if (!isScope(value) || !original.includes(value)) {
            return jsonError(400, 'invalid_scope', 'Requested scope exceeds the original grant');
         }
         if (!narrowed.includes(value)) narrowed.push(value);
      }
      if (narrowed.length === 0) {
         return jsonError(400, 'invalid_scope', 'Requested scope is empty');
      }
      scopes = narrowed;
   }

   const claimed = await env.DB.prepare(
      'UPDATE oauth_tokens SET used_at = ? WHERE id = ? AND used_at IS NULL',
   )
      .bind(now, row.id)
      .run();

   if ((claimed.meta.changes ?? 0) !== 1) {
      await revokeGrant(env, row.grant_id, now);
      return jsonError(400, 'invalid_grant', 'Refresh token reuse detected; grant revoked');
   }

   const issued = await issueTokenPair(
      env,
      {
         grantId: row.grant_id,
         clientId: row.client_id,
         userId: row.user_id,
         scopes,
         audience: row.audience,
         rotatedFrom: row.id,
      },
      now,
   );

   return tokenResponse(issued);
}

function tokenResponse(issued: {
   accessToken: string;
   refreshToken: string;
   expiresIn: number;
   scopes: Scope[];
}): Response {
   return new Response(
      JSON.stringify({
         access_token: issued.accessToken,
         token_type: 'Bearer',
         expires_in: issued.expiresIn,
         refresh_token: issued.refreshToken,
         scope: issued.scopes.join(' '),
      }),
      {
         status: 200,
         headers: {
            'content-type': 'application/json; charset=utf-8',
            'cache-control': 'no-store',
            pragma: 'no-cache',
         },
      },
   );
}

oauthRoutes.post('/register', async (c) => {
   await consumeRateLimit(c.env.DB, `oauth-register:ip:${requestClientIp(c)}`, REGISTER_LIMIT);

   let payload: unknown;
   try {
      payload = await c.req.json<unknown>();
   } catch {
      return jsonError(400, 'invalid_client_metadata', 'Expected a JSON body');
   }

   const parsed = registerInput.safeParse(payload);
   if (!parsed.success) {
      return jsonError(
         400,
         'invalid_client_metadata',
         parsed.error.issues.map((issue) => issue.message).join('; '),
      );
   }

   try {
      assertPublicClient(parsed.data.token_endpoint_auth_method);
      const redirectUris = normaliseRedirectUris(parsed.data.redirect_uris);
      const grantTypes = assertGrantTypes(parsed.data.grant_types);
      const responseTypes = assertResponseTypes(parsed.data.response_types);

      const id = createId('ocl');
      const now = nowSeconds();
      const clientName = parsed.data.client_name ?? 'MCP client';

      await c.env.DB.prepare(
         `INSERT INTO oauth_clients
          (id, client_name, redirect_uris, token_endpoint_auth_method, grant_types,
           response_types, scope, created_at)
          VALUES (?, ?, ?, 'none', ?, ?, ?, ?)`,
      )
         .bind(
            id,
            clientName,
            JSON.stringify(redirectUris),
            JSON.stringify(grantTypes),
            JSON.stringify(responseTypes),
            parsed.data.scope ?? null,
            now,
         )
         .run();

      return new Response(
         JSON.stringify({
            client_id: id,
            client_id_issued_at: now,
            client_name: clientName,
            redirect_uris: redirectUris,
            token_endpoint_auth_method: 'none',
            grant_types: grantTypes,
            response_types: responseTypes,
            ...(parsed.data.scope === undefined ? {} : { scope: parsed.data.scope }),
         }),
         {
            status: 201,
            headers: {
               'content-type': 'application/json; charset=utf-8',
               'cache-control': 'no-store',
            },
         },
      );
   } catch (error) {
      if (error instanceof ClientMetadataError) {
         return jsonError(400, 'invalid_client_metadata', error.message);
      }
      throw error;
   }
});
