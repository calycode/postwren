import { z } from 'zod';

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
] as const;

export type Scope = (typeof SCOPES)[number];

export const scopeSchema = z.enum(SCOPES);
export const scopeListSchema = z.array(scopeSchema).min(1).max(SCOPES.length);

const SCOPE_SET: ReadonlySet<string> = new Set(SCOPES);

export function isScope(value: string): value is Scope {
   return SCOPE_SET.has(value);
}

export function parseScopes(json: string): Scope[] {
   let parsed: unknown;
   try {
      parsed = JSON.parse(json);
   } catch {
      return [];
   }

   if (!Array.isArray(parsed)) {
      return [];
   }

   return parsed.filter((value): value is Scope => typeof value === 'string' && isScope(value));
}

export function serialiseScopes(scopes: readonly Scope[]): string {
   return JSON.stringify([...new Set(scopes)]);
}

export function hasScope(scopes: readonly string[], required: Scope): boolean {
   return scopes.includes(required);
}

const CAMPAIGN_SEND_ACTIONS = new Set([
   'schedule',
   'send-now',
   'pause',
   'resume',
   'cancel',
   'test',
]);

const CAMPAIGN_READ_ACTIONS = new Set(['preview', 'stats', 'recipients']);

const TEMPLATE_READ_ACTIONS = new Set(['preview', 'render-warnings']);

/**
 * Single source of truth for bearer authorization. A path either maps to one
 * scope or to null, which denies every bearer credential. Session users are
 * unrestricted and never reach this mapping.
 */
export function requiredScope(method: string, path: string): Scope | null {
   if (method === 'OPTIONS') {
      return null;
   }

   const segments = path
      .replace(/^\/api\/v1\/?/, '')
      .split('/')
      .filter((segment) => segment.length > 0);

   const resource = segments[0];

   switch (resource) {
      case 'subscribers':
         return method === 'GET' ? 'subscribers:read' : 'subscribers:write';
      case 'tags':
         return method === 'GET' ? 'tags:read' : 'tags:write';
      case 'campaigns': {
         if (method === 'GET') return 'campaigns:read';
         const action = segments[2] ?? '';
         if (CAMPAIGN_SEND_ACTIONS.has(action)) return 'send:write';
         if (CAMPAIGN_READ_ACTIONS.has(action)) return 'campaigns:read';
         return 'campaigns:write';
      }
      case 'templates': {
         if (method === 'GET') return 'templates:read';
         if (TEMPLATE_READ_ACTIONS.has(segments[2] ?? '')) return 'templates:read';
         return 'templates:write';
      }
      case 'audience':
         return method === 'GET' ? 'campaigns:read' : null;
      case 'media':
         return method === 'POST' ? 'media:write' : null;
      default:
         return null;
   }
}
