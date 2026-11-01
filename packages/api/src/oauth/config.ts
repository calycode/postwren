export const ACCESS_TOKEN_TTL_SECONDS = 60 * 60;
export const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30;

export const DEFAULT_SCOPES = [
   'subscribers:read',
   'campaigns:read',
   'templates:read',
   'tags:read',
] as const;

export function mcpResource(origin: string): string {
   return `${origin}/mcp`;
}
