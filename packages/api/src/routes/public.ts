import { Hono } from 'hono';
import type { Context } from 'hono';
import { ZodError } from 'zod';
import { sha256Hex } from '@mailer/worker-kit/ids';
import { fail, ok } from '@mailer/worker-kit/envelope';
import { UnauthorizedError, isAppError } from '@mailer/worker-kit/errors';
import { RATE_LIMITS, publicSubscribeInput } from '@mailer/shared/contracts';
import type { AppEnv } from '../env';
import { consumeRateLimit } from '../lib/rate-limit';
import { readJson } from '../lib/validation';
import { nowSeconds } from '../lib/time';
import { upsertSubscriber } from '../lib/subscribers';
import { requestClientIp } from '../middleware/context';

type SubscribeKeyRow = {
   id: string;
   name: string;
   allowed_origins: string;
   default_tags: string;
   revoked_at: number | null;
};

export const publicRoutes = new Hono<AppEnv>();

function stringArray(value: string): string[] {
   try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed)
         ? parsed.filter((item): item is string => typeof item === 'string')
         : [];
   } catch {
      return [];
   }
}

function subscribeSecret(c: Context<AppEnv>): string {
   const authorization = c.req.header('authorization') ?? '';
   if (/^bearer\s+/i.test(authorization)) {
      return authorization.replace(/^bearer\s+/i, '').trim();
   }

   return (c.req.header('x-subscribe-key') ?? '').trim();
}

async function findKey(db: D1Database, secret: string): Promise<SubscribeKeyRow | null> {
   if (!secret.startsWith('pk_live_')) return null;

   return db
      .prepare(
         `SELECT id, name, allowed_origins, default_tags, revoked_at
          FROM subscribe_keys WHERE key_hash = ? AND revoked_at IS NULL`,
      )
      .bind(await sha256Hex(secret))
      .first<SubscribeKeyRow>();
}

function withCors(response: Response, origin: string | null): Response {
   if (origin !== null) {
      response.headers.set('access-control-allow-origin', origin);
      response.headers.set('vary', 'Origin');
   }
   return response;
}

publicRoutes.options('/api/public/subscribe', (c) => {
   const headers: Record<string, string> = {
      'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-allow-headers': 'authorization, content-type, x-subscribe-key',
      'access-control-max-age': '600',
      vary: 'Origin',
   };

   const origin = c.req.header('origin');
   if (origin !== undefined) headers['access-control-allow-origin'] = origin;

   return new Response(null, { status: 204, headers });
});

publicRoutes.post('/api/public/subscribe', async (c) => {
   const secret = subscribeSecret(c);
   if (secret.length === 0) {
      throw new UnauthorizedError('A subscribe key is required');
   }

   const key = await findKey(c.env.DB, secret);
   if (key === null) {
      throw new UnauthorizedError('The subscribe key is invalid or revoked');
   }

   const origin = c.req.header('origin') ?? null;
   const allowedOrigins = stringArray(key.allowed_origins);

   if (origin !== null && !allowedOrigins.includes(origin)) {
      return fail(
         403,
         'forbidden',
         'Origin is not allowed for this subscribe key',
         undefined,
         c.get('requestId'),
      );
   }

   const allowedOrigin = origin !== null ? origin : null;
   const requestId = c.get('requestId');

   try {
      await consumeRateLimit(
         c.env.DB,
         `public-subscribe:${requestClientIp(c)}`,
         RATE_LIMITS.publicSubscribe,
      );

      const raw = await readJson(c);
      const record =
         typeof raw === 'object' && raw !== null && !Array.isArray(raw)
            ? (raw as Record<string, unknown>)
            : {};

      if (typeof record.website === 'string' && record.website.trim().length > 0) {
         return withCors(ok({ subscribed: true, created: false }, { requestId }), allowedOrigin);
      }

      const body = publicSubscribeInput.parse(raw);

      const tags = [...stringArray(key.default_tags), ...(body.tags ?? [])];
      const result = await upsertSubscriber(
         c.env.DB,
         {
            email: body.email,
            firstName: body.firstName ?? null,
            lastName: body.lastName ?? null,
            status: 'subscribed',
            source: body.source ?? 'public_subscribe',
            sourceUrl: body.sourceUrl ?? null,
            updateSource: true,
            tags,
            metadata: body.metadata ?? {},
         },
         nowSeconds(),
      );

      return withCors(
         ok({ subscribed: true, created: result.created }, { requestId }),
         allowedOrigin,
      );
   } catch (error) {
      if (isAppError(error)) {
         return withCors(
            fail(error.status, error.code, error.message, error.details, requestId),
            allowedOrigin,
         );
      }

      if (error instanceof ZodError) {
         return withCors(
            fail(
               422,
               'validation_error',
               'Request validation failed',
               { issues: error.issues },
               requestId,
            ),
            allowedOrigin,
         );
      }

      throw error;
   }
});
