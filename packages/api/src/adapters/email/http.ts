/** Reads Retry-After as seconds, or as an HTTP date, and clamps it to a day. */
export function retryAfterFrom(response: Response): number | null {
   const raw = response.headers.get('retry-after');
   if (raw === null || raw.trim().length === 0) return null;

   const seconds = Number(raw);
   if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(Math.ceil(seconds), 86_400);
   }

   const date = Date.parse(raw);
   if (Number.isNaN(date)) return null;

   return Math.min(Math.max(Math.ceil((date - Date.now()) / 1000), 0), 86_400);
}

export function messageOf(error: unknown, fallback: string): string {
   return error instanceof Error ? error.message : fallback;
}
