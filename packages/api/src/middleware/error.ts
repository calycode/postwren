import type { ErrorHandler } from 'hono';
import { ZodError } from 'zod';
import { DocumentError } from '@mailer/email/ir';
import { fail } from '@mailer/worker-kit/envelope';
import { isAppError } from '@mailer/worker-kit/errors';
import type { AppEnv } from '../env';

function requestIdOf(c: Parameters<ErrorHandler<AppEnv>>[1]): string | undefined {
   try {
      return c.get('requestId');
   } catch {
      return undefined;
   }
}

export const onErrorHandler: ErrorHandler<AppEnv> = (error, c) => {
   const requestId = requestIdOf(c);

   if (isAppError(error)) {
      return fail(error.status, error.code, error.message, error.details, requestId);
   }

   if (error instanceof ZodError) {
      return fail(
         422,
         'validation_error',
         'Request validation failed',
         {
            issues: error.issues,
         },
         requestId,
      );
   }

   if (error instanceof DocumentError) {
      return fail(422, 'validation_error', error.message, { issues: error.issues }, requestId);
   }

   console.error(
      JSON.stringify({
         level: 'error',
         requestId,
         message: error instanceof Error ? error.message : String(error),
         stack: error instanceof Error ? error.stack : undefined,
      }),
   );

   return fail(500, 'internal_error', 'Internal server error', undefined, requestId);
};
