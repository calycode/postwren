import type { MiddlewareHandler } from 'hono';
import type { AppEnv } from '../env';
import { buildFrameAncestors, loadEmbedOrigins } from '../lib/embed-origins';

const DENY_FRAMING = "frame-ancestors 'none'";

function isHtml(response: Response): boolean {
   return (response.headers.get('content-type') ?? '').toLowerCase().includes('text/html');
}

function isNeverEmbeddable(path: string): boolean {
   return path === '/oauth' || path.startsWith('/oauth/') || path.startsWith('/u/');
}

/**
 * The admin SPA is served by the assets binding, so this middleware runs after
 * the asset fallback has produced a response. Only HTML documents need a
 * framing policy: JSON and media cannot be framed usefully.
 *
 * A response that already carries a CSP owns its own framing rules (the OAuth
 * consent screen does). Everything else gets the workspace allowlist, which is
 * always `'self'` plus exact origins. Unsubscribe pages are never embeddable.
 */
export const framePolicy: MiddlewareHandler<AppEnv> = async (c, next) => {
   await next();

   const response = c.res;
   if (!isHtml(response)) return;
   if (response.headers.has('content-security-policy')) return;

   if (isNeverEmbeddable(c.req.path)) {
      response.headers.set('content-security-policy', DENY_FRAMING);
      response.headers.set('x-frame-options', 'DENY');
      return;
   }

   const origins = await loadEmbedOrigins(c.env.DB);
   response.headers.set('content-security-policy', buildFrameAncestors(origins));

   // X-Frame-Options cannot express an allowlist, so it is only useful as
   // defence in depth for browsers that do not implement frame-ancestors.
   // Once an origin is allowed, CSP is the only accurate control.
   if (origins.length === 0) {
      response.headers.set('x-frame-options', 'SAMEORIGIN');
   } else {
      response.headers.delete('x-frame-options');
   }

   // `no-store` keeps a policy change from being stranded in an HTML cache.
   response.headers.set('cache-control', 'no-store');
};
