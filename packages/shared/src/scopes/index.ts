export const SCOPES = [
   'subscribers:read',
   'subscribers:write',
   'campaigns:read',
   'campaigns:write',
   'templates:read',
   'templates:write',
   'tags:read',
   'tags:write',
   'media:write',
   'send:write',
   'emails:write',
   'events:write',
   'webhooks:read',
   'webhooks:write',
] as const;

export type Scope = (typeof SCOPES)[number];

const SCOPE_SET: ReadonlySet<string> = new Set(SCOPES);

export function isScope(value: string): value is Scope {
   return SCOPE_SET.has(value);
}
