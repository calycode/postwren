import { AppError } from '@postwren/worker-kit/errors';
import type { Env } from '../env';

type SiteverifyResponse = {
   success: boolean;
   'error-codes'?: string[];
};

/**
 * Called only when the subscribe key has a site key. The secret is a Worker
 * secret; a missing secret is a deployment error, so fail closed rather than
 * silently accepting every bot.
 */
export async function verifyTurnstile(
   env: Env,
   token: string | undefined,
   remoteIp?: string,
   request: typeof fetch = fetch,
): Promise<void> {
   if (token === undefined || token.length === 0) {
      throw new AppError(422, 'turnstile_required', 'Complete the Turnstile challenge');
   }

   const secret = env.TURNSTILE_SECRET?.trim();
   if (secret === undefined || secret.length === 0) {
      throw new AppError(
         503,
         'turnstile_not_configured',
         'TURNSTILE_SECRET is not configured for this deployment',
      );
   }

   const body = new URLSearchParams({ secret, response: token });
   if (remoteIp !== undefined && remoteIp.length > 0) body.set('remoteip', remoteIp);

   let result: SiteverifyResponse;
   try {
      const response = await request('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
         method: 'POST',
         headers: { 'content-type': 'application/x-www-form-urlencoded' },
         body: body.toString(),
         signal: AbortSignal.timeout(5000),
      });
      result = (await response.json()) as SiteverifyResponse;
   } catch {
      throw new AppError(503, 'turnstile_unavailable', 'Turnstile could not be reached');
   }

   if (!result.success) {
      throw new AppError(422, 'turnstile_failed', 'Turnstile verification failed', {
         codes: result['error-codes'] ?? [],
      });
   }
}
