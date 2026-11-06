const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

export const MAX_EMBED_ORIGINS = 10;
export const MAX_EMBED_ORIGIN_LENGTH = 512;

/**
 * An embed origin is a framing allowlist entry, not a URL to fetch. Only an
 * exact https origin (or loopback http for local development) is accepted:
 * paths, credentials, wildcards and non-http schemes would either be ignored
 * by `frame-ancestors` or silently widen the grant, so they are rejected.
 */
export function normaliseEmbedOrigin(value: string): string | null {
   const trimmed = value.trim();
   if (trimmed.length === 0 || trimmed.length > MAX_EMBED_ORIGIN_LENGTH) return null;
   if (trimmed.includes('*')) return null;

   let url: URL;
   try {
      url = new URL(trimmed);
   } catch {
      return null;
   }

   if (url.username.length > 0 || url.password.length > 0) return null;
   if (url.search.length > 0 || url.hash.length > 0) return null;
   if (url.pathname !== '/') return null;
   if (url.hostname.endsWith('.')) return null;

   if (url.protocol === 'https:') return url.origin;
   if (url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname)) return url.origin;

   return null;
}

export function buildFrameAncestors(origins: readonly string[]): string {
   return origins.length === 0
      ? "frame-ancestors 'self'"
      : `frame-ancestors 'self' ${origins.join(' ')}`;
}

export async function loadEmbedOrigins(db: D1Database): Promise<string[]> {
   let rows: { results: Array<{ origin: string }> };

   try {
      rows = await db
         .prepare('SELECT origin FROM embed_origins ORDER BY created_at ASC, origin ASC')
         .all<{ origin: string }>();
   } catch (error) {
      // Deploying before running the migration must not take the admin down.
      // An absent table means "no external origins", the same as an empty one.
      const message = error instanceof Error ? error.message : String(error);
      if (/no such table/i.test(message)) return [];
      throw error;
   }

   // Fail closed if a row was written by hand or by an older, looser version:
   // skip anything invalid, collapse duplicates and cap the header size.
   const origins: string[] = [];
   for (const row of rows.results) {
      const origin = normaliseEmbedOrigin(row.origin);
      if (origin === null || origins.includes(origin)) continue;

      origins.push(origin);
      if (origins.length === MAX_EMBED_ORIGINS) break;
   }

   return origins;
}

export async function replaceEmbedOrigins(
   db: D1Database,
   origins: readonly string[],
   now: number,
): Promise<void> {
   const statements: D1PreparedStatement[] = [db.prepare('DELETE FROM embed_origins')];

   for (const origin of origins) {
      statements.push(
         db
            .prepare('INSERT INTO embed_origins (origin, created_at) VALUES (?, ?)')
            .bind(origin, now),
      );
   }

   await db.batch(statements);
}
