import type { Env } from '../env';

export const ACCESS_TOKEN_TTL_SECONDS = 60 * 60;
export const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30;
export const AUTHORIZATION_CODE_TTL_SECONDS = 60 * 10;

export const SUPPORTED_GRANT_TYPES = ['authorization_code', 'refresh_token'] as const;
export const SUPPORTED_RESPONSE_TYPES = ['code'] as const;
export const SUPPORTED_CODE_CHALLENGE_METHODS = ['S256'] as const;

export function issuer(env: Env): string {
   return env.APP_URL.replace(/\/+$/, '');
}

export function mcpResource(env: Env): string {
   return `${issuer(env)}/mcp`;
}

export function protectedResourceMetadataUrl(env: Env): string {
   return `${issuer(env)}/.well-known/oauth-protected-resource`;
}

export function authorizationServerMetadataUrl(env: Env): string {
   return `${issuer(env)}/.well-known/oauth-authorization-server`;
}

export function allowedResources(env: Env): string[] {
   return [issuer(env), mcpResource(env)];
}

export function normaliseResource(resource: string): string {
   return resource.replace(/\/+$/, '');
}

export function isAllowedResource(env: Env, resource: string): boolean {
   const candidate = normaliseResource(resource);
   return allowedResources(env).some((allowed) => normaliseResource(allowed) === candidate);
}
