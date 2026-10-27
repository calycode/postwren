import type { MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';
import { UnauthorizedError, AppError } from '@mailer/worker-kit/errors';
import { timingSafeEqual } from '@mailer/worker-kit/http';
import type { AppEnv } from '../env';
import { CSRF_COOKIE, SESSION_COOKIE, findSessionUser } from '../auth/session';

const MUTATING = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
   if (c.req.method === 'OPTIONS') {
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
   await next();
};

export const requireCsrf: MiddlewareHandler<AppEnv> = async (c, next) => {
   if (!MUTATING.has(c.req.method)) {
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
