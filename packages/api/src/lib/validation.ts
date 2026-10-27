import type { Context } from 'hono';
import { AppError } from '@mailer/worker-kit/errors';
import type { AppEnv } from '../env';

export async function readJson(c: Context<AppEnv>): Promise<unknown> {
   try {
      return await c.req.json();
   } catch {
      throw new AppError(422, 'validation_error', 'Invalid JSON body');
   }
}

export function likePattern(value: string): string {
   return `%${value.replace(/[\\%_]/g, (match) => `\\${match}`)}%`;
}

export function escapeLike(value: string): string {
   return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

export function isUniqueViolation(error: unknown): boolean {
   if (typeof error !== 'object' || error === null) return false;
   const message = (error as { message?: unknown }).message;
   return typeof message === 'string' && /UNIQUE constraint failed/i.test(message);
}
