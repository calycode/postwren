import type { Context } from 'hono';
import { AppError } from '@postwren/worker-kit/errors';
import type { AppEnv, Env } from '../env';

/**
 * APP_URL is a plain `http(s)` origin. Trailing slashes and paths are dropped so
 * `${origin}/login` cannot become `https://host//login`.
 */
export function normaliseAppOrigin(value: string | undefined | null): string | null {
   const trimmed = value?.trim();
   if (!trimmed) return null;

   try {
      const url = new URL(trimmed);
      if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
      return url.origin;
   } catch {
      return null;
   }
}

/**
 * Public origin for links that leave the Worker. An explicit APP_URL wins;
 * otherwise the request's own origin is used, so a fresh workers.dev or custom
 * domain deploy works before anything is configured.
 */
export function resolveAppOrigin(requestUrl: string | URL, env: Env): string {
   return normaliseAppOrigin(env.APP_URL) ?? new URL(requestUrl).origin;
}

export function appOrigin(c: Context<AppEnv>): string {
   return resolveAppOrigin(c.req.url, c.env);
}

/**
 * Queue and cron work has no request to fall back to, so campaign links need
 * APP_URL to be set. Returns null when it is missing or not a valid origin.
 */
export function configuredAppOrigin(env: Env): string | null {
   return normaliseAppOrigin(env.APP_URL);
}

/** Rejects a campaign send before any mail goes out with dead links. */
export function requireConfiguredAppOrigin(env: Env): string {
   const origin = configuredAppOrigin(env);
   if (origin === null) {
      throw new AppError(
         422,
         'app_url_missing',
         'Set APP_URL to the public origin, for example https://mail.example.com, before sending a campaign',
      );
   }
   return origin;
}
