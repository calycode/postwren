export const JSON_HEADERS: Record<string, string> = {
   'content-type': 'application/json; charset=utf-8',
};

export function noStore(): Record<string, string> {
   return { 'cache-control': 'no-store' };
}

export function cachePublic(maxAgeSeconds: number): Record<string, string> {
   const seconds = Number.isFinite(maxAgeSeconds) ? Math.max(0, Math.floor(maxAgeSeconds)) : 0;
   return { 'cache-control': `public, max-age=${seconds}` };
}

export function timingSafeEqual(a: string, b: string): boolean {
   const length = Math.max(a.length, b.length);
   let diff = a.length ^ b.length;

   for (let i = 0; i < length; i += 1) {
      diff |= (a.charCodeAt(i) | 0) ^ (b.charCodeAt(i) | 0);
   }

   return diff === 0;
}
