import { createId, randomToken, sha256Hex } from '@mailer/worker-kit/ids';
import type { Env } from '../env';
import type { Scope } from '../auth/scopes';
import { serialiseScopes } from '../auth/scopes';
import { nowSeconds } from '../lib/time';
import { ACCESS_TOKEN_TTL_SECONDS, REFRESH_TOKEN_TTL_SECONDS } from './config';

export type IssueTokenInput = {
   grantId: string;
   clientId: string;
   userId: string;
   scopes: Scope[];
   audience: string;
   rotatedFrom?: string;
};

export type IssuedTokenPair = {
   accessToken: string;
   refreshToken: string;
   expiresIn: number;
   scopes: Scope[];
};

export function newOpaqueToken(kind: 'access' | 'refresh' | 'code'): string {
   return `mlro_${kind}_${randomToken(32)}`;
}

export async function tokenHash(raw: string): Promise<string> {
   return sha256Hex(raw);
}

export async function issueTokenPair(
   env: Env,
   input: IssueTokenInput,
   now = nowSeconds(),
): Promise<IssuedTokenPair> {
   const accessToken = newOpaqueToken('access');
   const refreshToken = newOpaqueToken('refresh');
   const scopes = serialiseScopes(input.scopes);

   await env.DB.batch([
      env.DB.prepare(
         `INSERT INTO oauth_tokens
          (id, grant_id, client_id, user_id, token_type, token_hash, scopes, audience,
           rotated_from, expires_at, created_at)
          VALUES (?, ?, ?, ?, 'access', ?, ?, ?, ?, ?, ?)`,
      ).bind(
         createId('otk'),
         input.grantId,
         input.clientId,
         input.userId,
         await tokenHash(accessToken),
         scopes,
         input.audience,
         input.rotatedFrom ?? null,
         now + ACCESS_TOKEN_TTL_SECONDS,
         now,
      ),
      env.DB.prepare(
         `INSERT INTO oauth_tokens
          (id, grant_id, client_id, user_id, token_type, token_hash, scopes, audience,
           rotated_from, expires_at, created_at)
          VALUES (?, ?, ?, ?, 'refresh', ?, ?, ?, ?, ?, ?)`,
      ).bind(
         createId('otk'),
         input.grantId,
         input.clientId,
         input.userId,
         await tokenHash(refreshToken),
         scopes,
         input.audience,
         input.rotatedFrom ?? null,
         now + REFRESH_TOKEN_TTL_SECONDS,
         now,
      ),
   ]);

   return {
      accessToken,
      refreshToken,
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      scopes: input.scopes,
   };
}

export async function revokeGrant(env: Env, grantId: string, now = nowSeconds()): Promise<void> {
   await env.DB.batch([
      env.DB.prepare(
         'UPDATE oauth_grants SET revoked_at = COALESCE(revoked_at, ?) WHERE id = ?',
      ).bind(now, grantId),
      env.DB.prepare(
         'UPDATE oauth_tokens SET revoked_at = COALESCE(revoked_at, ?) WHERE grant_id = ?',
      ).bind(now, grantId),
   ]);
}
