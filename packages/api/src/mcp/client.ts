import type { Env } from '../env';
import type { Scope } from '../auth/scopes';
import { signServiceToken } from '../auth/service-token';

export type ApiEnvelope = {
   data: unknown;
   error: null | { code: string; message: string; details?: unknown };
   meta?: unknown;
};

export type ToolCallContext = {
   env: Env;
   scopes: readonly Scope[];
};

export type ApiCallResult = {
   status: number;
   envelope: ApiEnvelope;
};

function isEnvelope(value: unknown): value is ApiEnvelope {
   if (value === null || typeof value !== 'object') return false;
   const candidate = value as Record<string, unknown>;
   return 'data' in candidate && 'error' in candidate;
}

/**
 * Runs the tool against the public REST surface instead of re-implementing
 * subscriber/campaign/template SQL. A short-lived signed credential carries the
 * caller's scopes, so the one scope gate applies to the internal call too.
 */
export async function callApi(
   context: ToolCallContext,
   method: string,
   path: string,
   body?: unknown,
): Promise<ApiCallResult> {
   const { createApp } = await import('../app');
   const response = await createApp(context.env).request(
      path,
      {
         method,
         headers: {
            'content-type': 'application/json',
            'x-mailer-service-token': await signServiceToken(
               context.env.TOKEN_SECRET,
               context.scopes,
            ),
         },
         ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      },
      context.env,
   );

   const text = await response.text();
   let parsed: unknown = null;
   try {
      parsed = text.length === 0 ? null : JSON.parse(text);
   } catch {
      parsed = null;
   }

   if (!isEnvelope(parsed)) {
      return {
         status: response.status,
         envelope: {
            data: null,
            error: {
               code: 'upstream_error',
               message: `The API returned a non-envelope response (HTTP ${response.status})`,
            },
         },
      };
   }

   return { status: response.status, envelope: parsed };
}
