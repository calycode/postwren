import { describe, expect, it } from 'vitest';
import { signToken, verifyToken } from './index';

const SECRET = 'test-secret';
const NOW = 1_000;

function base64UrlEncode(value: string | Uint8Array): string {
   const binary = typeof value === 'string' ? value : String.fromCharCode(...value);
   return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(value: string): string {
   const padded = value.replace(/-/g, '+').replace(/_/g, '/');
   return atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
}

async function signRaw(payload: string, secret: string): Promise<string> {
   const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
   );
   const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
   return `${payload}.${base64UrlEncode(new Uint8Array(signature))}`;
}

describe('signToken and verifyToken', () => {
   it('round-trips a payload', async () => {
      const token = await signToken(
         { subscriberId: 'sub_1' },
         { secret: SECRET, purpose: 'click', ttlSeconds: 60, now: NOW },
      );

      await expect(
         verifyToken(token, { secret: SECRET, purpose: 'click', now: NOW + 1 }),
      ).resolves.toEqual({
         subscriberId: 'sub_1',
         p: 'click',
         exp: NOW + 60,
      });
   });

   it('produces two base64url segments', async () => {
      const token = await signToken(
         { id: 'x' },
         { secret: SECRET, purpose: 'open', ttlSeconds: 60, now: NOW },
      );

      const parts = token.split('.');
      expect(parts).toHaveLength(2);
      expect(parts[0]).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(parts[1]).toMatch(/^[A-Za-z0-9_-]+$/);
   });

   it('rejects a tampered payload', async () => {
      const token = await signToken(
         { subscriberId: 'sub_1' },
         { secret: SECRET, purpose: 'click', ttlSeconds: 60, now: NOW },
      );
      const [payload, signature] = token.split('.');
      const decoded = JSON.parse(base64UrlDecode(payload ?? '')) as Record<string, unknown>;
      decoded.subscriberId = 'sub_2';
      const tampered = `${base64UrlEncode(JSON.stringify(decoded))}.${signature}`;

      await expect(
         verifyToken(tampered, { secret: SECRET, purpose: 'click', now: NOW + 1 }),
      ).resolves.toBeNull();
   });

   it('rejects a tampered signature', async () => {
      const token = await signToken(
         { subscriberId: 'sub_1' },
         { secret: SECRET, purpose: 'click', ttlSeconds: 60, now: NOW },
      );
      const [payload, signature = ''] = token.split('.');
      const flipped = signature[0] === 'A' ? 'B' : 'A';
      const tampered = `${payload}.${flipped}${signature.slice(1)}`;

      await expect(
         verifyToken(tampered, { secret: SECRET, purpose: 'click', now: NOW + 1 }),
      ).resolves.toBeNull();
   });

   it('does not verify a click token as an open token', async () => {
      const token = await signToken(
         { subscriberId: 'sub_1' },
         { secret: SECRET, purpose: 'click', ttlSeconds: 60, now: NOW },
      );

      await expect(
         verifyToken(token, { secret: SECRET, purpose: 'open', now: NOW + 1 }),
      ).resolves.toBeNull();
      await expect(
         verifyToken(token, { secret: SECRET, purpose: 'unsubscribe', now: NOW + 1 }),
      ).resolves.toBeNull();
   });

   it('treats exp equal to now as expired', async () => {
      const token = await signToken(
         { subscriberId: 'sub_1' },
         { secret: SECRET, purpose: 'click', ttlSeconds: 60, now: NOW },
      );

      await expect(
         verifyToken(token, { secret: SECRET, purpose: 'click', now: NOW + 59 }),
      ).resolves.not.toBeNull();
      await expect(
         verifyToken(token, { secret: SECRET, purpose: 'click', now: NOW + 60 }),
      ).resolves.toBeNull();
      await expect(
         verifyToken(token, { secret: SECRET, purpose: 'click', now: NOW + 61 }),
      ).resolves.toBeNull();
   });

   it('rejects tokens signed with a different secret', async () => {
      const token = await signToken(
         { subscriberId: 'sub_1' },
         { secret: SECRET, purpose: 'click', ttlSeconds: 60, now: NOW },
      );

      await expect(
         verifyToken(token, { secret: 'other-secret', purpose: 'click', now: NOW + 1 }),
      ).resolves.toBeNull();
   });

   it.each(['', 'a', 'a.b.c', '!!!.???', '.', 'abc.', '.abc', 'eyJhIjoxfQ.%%%'])(
      'returns null for malformed token %j',
      async (token) => {
         await expect(
            verifyToken(token, { secret: SECRET, purpose: 'click', now: NOW }),
         ).resolves.toBeNull();
      },
   );

   it('returns null when the payload is not a JSON object', async () => {
      const token = await signRaw(base64UrlEncode('[1,2,3]'), SECRET);
      await expect(
         verifyToken(token, { secret: SECRET, purpose: 'click', now: NOW }),
      ).resolves.toBeNull();
   });

   it('returns null when exp is missing', async () => {
      const payload = base64UrlEncode(JSON.stringify({ p: 'click', subscriberId: 'sub_1' }));
      const token = await signRaw(payload, SECRET);

      await expect(
         verifyToken(token, { secret: SECRET, purpose: 'click', now: NOW }),
      ).resolves.toBeNull();
   });

   it('returns null when exp is not a number', async () => {
      const payload = base64UrlEncode(JSON.stringify({ p: 'click', exp: '9999' }));
      const token = await signRaw(payload, SECRET);

      await expect(
         verifyToken(token, { secret: SECRET, purpose: 'click', now: NOW }),
      ).resolves.toBeNull();
   });

   it('lets sign options override p and exp in the input payload', async () => {
      const token = await signToken(
         { p: 'open', exp: 9_999_999, subscriberId: 'sub_1' },
         { secret: SECRET, purpose: 'click', ttlSeconds: 5, now: NOW },
      );

      const verified = await verifyToken<Record<string, unknown>>(token, {
         secret: SECRET,
         purpose: 'click',
         now: NOW + 4,
      });

      expect(verified).toMatchObject({ p: 'click', exp: NOW + 5, subscriberId: 'sub_1' });
   });
});
