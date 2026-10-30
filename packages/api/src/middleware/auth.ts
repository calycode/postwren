import type { MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';
import { UnauthorizedError, AppError } from '@mailer/worker-kit/errors';
import { timingSafeEqual } from '@mailer/worker-kit/http';
import type { AppEnv } from '../env';
import { CSRF_COOKIE, SESSION_COOKIE, findSessionUser } from '../auth/session';
import { authenticateApiKey } from '../auth/bearer';
import { SERVICE_TOKEN_HEADER, verifyServiceToken } from '../auth/service-token';

const MUTATING = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);
const BEARER_PATTERN = /^Bearer\s+(\S+)$/i;

export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
   if (c.req.method === 'OPTIONS') {
      await next();
      return;
   }

   const serviceToken = c.req.header(SERVICE_TOKEN_HEADER);
   if (serviceToken !== undefined && serviceToken.length > 0) {
      const scopes = await verifyServiceToken(c.env.TOKEN_SECRET, serviceToken);
      if (scopes === null) {
         throw new UnauthorizedError('Invalid or expired service credential');
      }

      c.set('authKind', 'service');
      c.set('authScopes', scopes);
      c.set('credentialId', null);
      c.set('userId', null);

      await next();
      return;
   }

   const authorization = c.req.header('authorization');
   const bearer = authorization === undefined ? null : BEARER_PATTERN.exec(authorization.trim());

   if (bearer !== null) {
      const credential = await authenticateApiKey(c.env, bearer[1] ?? '');
      if (credential === null) {
         throw new UnauthorizedError('Invalid or expired credential');
      }

      c.set('authKind', credential.kind);
      c.set('authScopes', credential.scopes);
      c.set('credentialId', credential.id);
      c.set('userId', null);

      await next();
      return;
   }

   const raw = getCookie(c, SESSION_COOKIE);
   if (raw === undefined || raw.length === 0) {
      throw new UnauthorizedError();
   }

   const user = await findSessionUser(c.env, raw);
   if (user === null) {
      throw new UnauthorizedError();
   }

   c.set('userId', user.id);
   c.set('authKind', 'session');
   c.set('authScopes', null);
   c.set('credentialId', null);

   await next();
};

export const requireCsrf: MiddlewareHandler<AppEnv> = async (c, next) => {
   if (!MUTATING.has(c.req.method)) {
      await next();
      return;
   }

   const kind = c.get('authKind');
   if (kind === 'api_key' || kind === 'service') {
      await next();
      return;
   }

   const header = c.req.header('x-csrf-token') ?? '';
   const cookie = getCookie(c, CSRF_COOKIE) ?? '';

   if (header.length === 0 || cookie.length === 0 || !timingSafeEqual(header, cookie)) {
      throw new AppError(403, 'forbidden', 'Invalid CSRF token');
   }

   await next();
};
