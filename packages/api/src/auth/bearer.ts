import type { Env } from '../env';
import { nowSeconds } from '../lib/time';
import { parseApiKey, apiKeyHash } from './api-key';
import { parseScopes } from './scopes';
import type { Scope } from './scopes';

export type ApiKeyCredential = {
   kind: 'api_key';
   id: string;
   prefix: string;
   scopes: Scope[];
   expiresAt: number | null;
};

type ApiKeyRow = {
   id: string;
   prefix: string;
   scopes: string;
   expires_at: number | null;
   revoked_at: number | null;
};

export function looksLikeApiKey(raw: string): boolean {
   return raw.startsWith('mlr_');
}

export async function authenticateApiKey(
   env: Env,
   raw: string,
   now = nowSeconds(),
): Promise<ApiKeyCredential | null> {
   if (raw.length === 0 || raw.length > 512) {
      return null;
   }

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
