import { sha256Hex } from '@mailer/worker-kit/ids';
import type { Env } from '../env';
import { nowSeconds } from '../lib/time';
import { parseApiKey, apiKeyHash } from './api-key';
import { parseScopes } from './scopes';
import type { Scope } from './scopes';
import { isAllowedResource } from '../oauth/config';

export type ApiKeyCredential = {
   kind: 'api_key';
   id: string;
   prefix: string;
   scopes: Scope[];
   expiresAt: number | null;
};

export type OAuthCredential = {
   kind: 'oauth';
   id: string;
   grantId: string;
   userId: string;
   scopes: Scope[];
   audience: string;
   expiresAt: number;
};

export type BearerCredential = ApiKeyCredential | OAuthCredential;

const OAUTH_TOKEN_PREFIX = 'mlro_';

type ApiKeyRow = {
   id: string;
   prefix: string;
   scopes: string;
   expires_at: number | null;
   revoked_at: number | null;
};

type OAuthTokenRow = {
   id: string;
   grant_id: string;
   user_id: string;
   scopes: string;
   audience: string;
   expires_at: number;
   revoked_at: number | null;
   grant_revoked_at: number | null;
};

export function looksLikeBearerSecret(raw: string): boolean {
   return raw.startsWith('mlr_');
}

export async function authenticateBearer(
   env: Env,
   raw: string,
   now = nowSeconds(),
): Promise<BearerCredential | null> {
   if (raw.length === 0 || raw.length > 512) {
      return null;
   }

   if (raw.startsWith(OAUTH_TOKEN_PREFIX)) {
      return authenticateOAuthToken(env, raw, now);
   }

   if (looksLikeBearerSecret(raw)) {
      return authenticateApiKey(env, raw, now);
   }

   return null;
}

async function authenticateApiKey(
   env: Env,
   raw: string,
   now: number,
): Promise<ApiKeyCredential | null> {
   const parsed = parseApiKey(raw);
   if (parsed === null) {
      return null;
   }

   const hash = await apiKeyHash(raw);
   const row = await env.DB.prepare(
      `SELECT id, prefix, scopes, expires_at, revoked_at
       FROM api_keys WHERE key_hash = ?`,
   )
      .bind(hash)
      .first<ApiKeyRow>();

   if (row === null || row.prefix !== parsed.prefix || row.revoked_at !== null) {
      return null;
   }

   if (row.expires_at !== null && row.expires_at <= now) {
      return null;
   }

   await env.DB.prepare('UPDATE api_keys SET last_used_at = ? WHERE id = ?')
      .bind(now, row.id)
      .run();

   return {
      kind: 'api_key',
      id: row.id,
      prefix: row.prefix,
      scopes: parseScopes(row.scopes),
      expiresAt: row.expires_at,
   };
}

async function authenticateOAuthToken(
   env: Env,
   raw: string,
   now: number,
): Promise<OAuthCredential | null> {
   const hash = await sha256Hex(raw);
   const row = await env.DB.prepare(
      `SELECT t.id, t.grant_id, t.user_id, t.scopes, t.audience, t.expires_at,
              t.revoked_at, g.revoked_at AS grant_revoked_at
       FROM oauth_tokens t
       JOIN oauth_grants g ON g.id = t.grant_id
       WHERE t.token_hash = ? AND t.token_type = 'access'`,
   )
      .bind(hash)
      .first<OAuthTokenRow>();

   if (row === null || row.revoked_at !== null || row.grant_revoked_at !== null) {
      return null;
   }

   if (row.expires_at <= now) {
      return null;
   }

   if (!isAllowedResource(env, row.audience)) {
      return null;
   }

   return {
      kind: 'oauth',
      id: row.id,
      grantId: row.grant_id,
      userId: row.user_id,
      scopes: parseScopes(row.scopes),
      audience: row.audience,
      expiresAt: row.expires_at,
   };
}
