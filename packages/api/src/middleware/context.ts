import type { MiddlewareHandler } from 'hono';
import { deriveRequestId, clientIp } from '@mailer/worker-kit/request';
import type { AppEnv } from '../env';

export const requestContext: MiddlewareHandler<AppEnv> = async (c, next) => {
   c.set('requestId', deriveRequestId(c.req.raw.headers));
   c.set('userId', null);
   c.header('x-request-id', c.get('requestId'));
   await next();
};

export function requestClientIp(c: { req: { raw: Request } }): string {
   return clientIp(c.req.raw.headers);
}
