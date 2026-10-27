function header(headers: Headers, name: string): string {
   return headers.get(name)?.trim() ?? '';
}

export function deriveRequestId(headers: Headers): string {
   return (
      header(headers, 'cf-ray') || header(headers, 'x-request-id') || globalThis.crypto.randomUUID()
   );
}

export function clientIp(headers: Headers): string {
   const direct = header(headers, 'cf-connecting-ip');
   if (direct.length > 0) return direct;

   const forwarded = header(headers, 'x-forwarded-for');
   const firstHop = forwarded.split(',')[0]?.trim() ?? '';
   return firstHop.length > 0 ? firstHop : 'unknown';
}
