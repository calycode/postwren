import { compileAudience, AudienceError } from '@postwren/shared/audience';
import { AppError } from '@postwren/worker-kit/errors';

export function assertAudienceQuery(query: string): void {
   try {
      compileAudience(query);
   } catch (error) {
      if (error instanceof AudienceError) {
         throw new AppError(422, 'validation_error', error.message);
      }
      throw error;
   }
}

export async function countAudience(db: D1Database, query: string): Promise<number> {
   const compiled = compileAudience(query);
   const row = await db
      .prepare(`SELECT COUNT(*) AS count FROM subscribers s WHERE (${compiled.sql})`)
      .bind(...compiled.params)
      .first<{ count: number }>();

   return row?.count ?? 0;
}
