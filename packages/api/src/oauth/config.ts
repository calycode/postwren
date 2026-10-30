import type { Env } from '../env';

export const ACCESS_TOKEN_TTL_SECONDS = 60 * 60;
export const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30;

export const DEFAULT_SCOPES = [
   'subscribers:read',
   'campaigns:read',
   'templates:read',
   'tags:read',
] as const;

export function issuer(env: Env): string {
   return env.APP_URL.replace(/\/+$/, '');
}

export function mcpResource(env: Env): string {
   return `${issuer(env)}/mcp`;
}

/** RFC 9728 derives the metadata path from the canonical resource path. */
export function protectedResourceMetadataUrl(env: Env): string {
   return `${issuer(env)}/.well-known/oauth-protected-resource/mcp`;
}
