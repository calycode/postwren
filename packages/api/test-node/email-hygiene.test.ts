import { describe, expect, it } from 'vitest';
import { checkEmailHygiene, domainAcceptsMail } from '../src/lib/email-hygiene';

function doh(answer: Array<{ type: number; data: string }>, status = 0): Response {
   return new Response(JSON.stringify({ Status: status, Answer: answer }), {
      status: 200,
      headers: { 'content-type': 'application/dns-json' },
   });
}

describe('email hygiene', () => {
   it('rejects disposable domains without a network call', () => {
      expect(checkEmailHygiene('ada@mailinator.com')).toEqual({
         ok: false,
         reason: 'disposable',
      });
   });

   it('suggests the corrected address for a known typo', () => {
      expect(checkEmailHygiene('ada@gmial.com')).toEqual({
         ok: false,
         reason: 'typo',
         suggestion: 'ada@gmail.com',
      });
   });

   it('accepts an ordinary address', () => {
      expect(checkEmailHygiene('ada@example.org')).toEqual({ ok: true });
   });

   it('treats a null MX as a refusal of mail', async () => {
      const request = (async (input: RequestInfo | URL) => {
         const url = new URL(String(input));
         return url.searchParams.get('type') === 'MX'
            ? doh([{ type: 15, data: '0 .' }])
            : doh([{ type: 1, data: '93.184.216.34' }]);
      }) as typeof fetch;

      expect(await domainAcceptsMail('example.com', request)).toBe(false);
   });

   it('accepts an A record when there is no MX', async () => {
      const request = (async (input: RequestInfo | URL) => {
         const url = new URL(String(input));
         return url.searchParams.get('type') === 'MX'
            ? doh([], 0)
            : doh([{ type: 1, data: '93.184.216.34' }]);
      }) as typeof fetch;

      expect(await domainAcceptsMail('example.org', request)).toBe(true);
   });

   it('fails open when DNS cannot be reached', async () => {
      const request = (async () => {
         throw new Error('offline');
      }) as typeof fetch;

      expect(await domainAcceptsMail('example.org', request)).toBeNull();
   });
});
