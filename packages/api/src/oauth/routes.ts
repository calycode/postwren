import { Hono } from 'hono';
import type { Context } from 'hono';
import { getCookie } from 'hono/cookie';
import { AuthorizationError, CimdFetchError } from '@cloudflare/workers-oauth-provider';
import type {
   AuthRequest,
   ConsentDescription,
   OAuthHelpers,
} from '@cloudflare/workers-oauth-provider';
import { timingSafeEqual } from '@postwren/worker-kit/http';
import { AppError } from '@postwren/worker-kit/errors';
import type { AppEnv, Env } from '../env';
import { CSRF_COOKIE, SESSION_COOKIE, findSessionUser } from '../auth/session';
import { appOrigin } from '../lib/app-url';
import { DEFAULT_SCOPES } from './config';
import { renderConsentError, renderConsentPage } from './consent';

export const oauthRoutes = new Hono<AppEnv>();

// No `form-action` on purpose: browsers apply it to every hop of the navigation
// that follows the consent POST, including the 302 to the client's callback. A
// `form-action 'self'` policy therefore issues the code and then blocks the
// browser from delivering it, which looks like a dead callback to the client.
const SECURITY_HEADERS: Record<string, string> = {
   'cache-control': 'no-store',
   'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'",
   'x-frame-options': 'DENY',
   'referrer-policy': 'no-referrer',
};

function requireOAuth(env: Env): OAuthHelpers {
   const oauth = env.OAUTH_PROVIDER;
   if (oauth === undefined) {
      throw new AppError(500, 'oauth_unavailable', 'OAuth provider is not configured');
   }
   return oauth;
}

function htmlError(status: number, message: string): Response {
   return new Response(renderConsentError(message), {
      status,
      headers: { 'content-type': 'text/html; charset=utf-8', ...SECURITY_HEADERS },
   });
}

function redirectTo(location: string, headers?: Headers): Response {
   const merged = new Headers(headers);
   merged.set('location', location);
   merged.set('cache-control', 'no-store');
   return new Response(null, { status: 302, headers: merged });
}

function authorizationFailure(error: unknown): Response {
   if (error instanceof AuthorizationError) {
      if (error.redirectTo !== undefined) return redirectTo(error.redirectTo);
      return htmlError(400, error.description);
   }

   if (error instanceof CimdFetchError) {
      return htmlError(400, error.message);
   }

   throw error;
}

function loginRedirect(c: Context<AppEnv>): Response {
   const url = new URL(c.req.url);
   const target = `${url.pathname}${url.search}`;
   const login = new URL(`${appOrigin(c)}/login`);
   login.searchParams.set('next', target);
   return redirectTo(login.toString());
}

oauthRoutes.get('/authorize', async (c) => {
   const oauth = requireOAuth(c.env);

   let request: AuthRequest;
   try {
      request = await oauth.parseAuthRequest(c.req.raw);
   } catch (error) {
      return authorizationFailure(error);
   }

   if (request.scope.length === 0) {
      request.scope = [...DEFAULT_SCOPES];
   }

   const sessionRaw = getCookie(c, SESSION_COOKIE);
   const user =
      sessionRaw === undefined || sessionRaw.length === 0
         ? null
         : await findSessionUser(c.env, sessionRaw);

   if (user === null) {
      return loginRedirect(c);
   }

   let details: ConsentDescription;
   let consent: Awaited<ReturnType<OAuthHelpers['beginConsent']>>;
   try {
      details = await oauth.describeConsent(request);
      consent = await oauth.beginConsent(request);
   } catch (error) {
      return authorizationFailure(error);
   }

   const csrf = getCookie(c, CSRF_COOKIE) ?? '';
   const headers = new Headers(consent.headers);
   headers.set('content-type', 'text/html; charset=utf-8');
   for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      headers.set(name, value);
   }

   return new Response(
      renderConsentPage({
         details,
         handle: consent.handle,
         csrf,
         username: user.email,
      }),
      { status: 200, headers },
   );
});

oauthRoutes.post('/authorize', async (c) => {
   const form = await c.req.raw.clone().formData();
   const handle = String(form.get('handle') ?? '');
   const csrf = String(form.get('csrf') ?? '');
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
      return loginRedirect(c);
   }

   const oauth = requireOAuth(c.env);

   try {
      if (form.get('decision') !== 'approve') {
         const denied = await oauth.denyConsent(c.req.raw, handle);
         return redirectTo(denied.redirectTo, denied.headers);
      }

      const approved = await oauth.approveConsent(c.req.raw, handle);
      const { redirectTo: location } = await oauth.completeAuthorization({
         request: approved.request,
         userId: user.id,
         metadata: { email: user.email },
         scope: approved.request.scope,
         props: { userId: user.id, email: user.email },
      });

      return redirectTo(location, approved.headers);
   } catch (error) {
      return authorizationFailure(error);
   }
});
