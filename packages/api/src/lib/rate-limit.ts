import { AppError } from '@mailer/worker-kit/errors';
import { nowSeconds } from './time';

export type RateLimit = { windowSeconds: number; max: number };

export async function consumeRateLimit(
   db: D1Database,
   key: string,
   limit: RateLimit,
   now = nowSeconds(),
): Promise<void> {
   const windowStart = now - (now % limit.windowSeconds);

   await db
      .prepare(
         `INSERT INTO rate_limits (key, count, window_start) VALUES (?, 1, ?)
          ON CONFLICT(key) DO UPDATE SET
            count = CASE WHEN rate_limits.window_start = ? THEN rate_limits.count + 1 ELSE 1 END,
            window_start = ?`,
      )
      .bind(key, windowStart, windowStart, windowStart)
      .run();

   const row = await db
      .prepare('SELECT count FROM rate_limits WHERE key = ?')
      .bind(key)
      .first<{ count: number }>();

   if (row !== null && row.count > limit.max) {
      throw new AppError(429, 'rate_limited', 'Too many requests');
   }
}
