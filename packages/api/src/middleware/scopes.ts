import type { MiddlewareHandler } from 'hono';
import { AppError } from '@postwren/worker-kit/errors';
import type { AppEnv } from '../env';
import { hasScope, requiredScope } from '../auth/scopes';

export const enforceScopes: MiddlewareHandler<AppEnv> = async (c, next) => {
   if (c.req.method === 'OPTIONS' || c.get('authKind') === 'session') {
      await next();
      return;
   }

   const required = requiredScope(c.req.method, c.req.path);
   if (required === null) {
      throw new AppError(403, 'forbidden', 'This credential cannot access this endpoint');
   }

   const scopes = c.get('authScopes') ?? [];
   if (!hasScope(scopes, required)) {
      throw new AppError(403, 'forbidden', `Missing required scope: ${required}`, {
         requiredScope: required,
      });
   }

   await next();
};
