import { describe, expect, it } from 'vitest';
import { createId, randomToken, sha256Hex } from './ids';

const CROCKFORD = /^[0-9abcdefghjkmnpqrstvwxyz]+$/;

describe('createId', () => {
   it('prefixes the identifier', () => {
      expect(createId('sub_')).toMatch(/^sub_/);
   });

   it('encodes 16 bytes as 26 crockford base32 characters', () => {
      const id = createId('sub_');
      expect(id.slice(4)).toHaveLength(26);
      expect(id.slice(4)).toMatch(CROCKFORD);
   });

   it('scales with the requested byte count', () => {
      expect(createId('x_', 8).slice(2)).toHaveLength(13);
      expect(createId('x_', 1).slice(2)).toHaveLength(2);
   });

   it('never uses i, l, o or u', () => {
      const suffixes = Array.from({ length: 50 }, () => createId('x_', 32).slice(2)).join('');
      expect(suffixes).not.toMatch(/[ilou]/);
   });

   it('produces different ids on each call', () => {
      expect(createId('sub_')).not.toBe(createId('sub_'));
   });
});

describe('randomToken', () => {
   it('returns unpadded base64url', () => {
      const token = randomToken();
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(token).not.toContain('=');
   });

   it('encodes 32 bytes as 43 characters by default', () => {
      expect(randomToken()).toHaveLength(43);
   });

   it('scales with the requested byte count', () => {
      expect(randomToken(16)).toHaveLength(22);
      expect(randomToken(1)).toHaveLength(2);
   });

   it('produces different tokens on each call', () => {
      expect(randomToken()).not.toBe(randomToken());
   });
});

describe('sha256Hex', () => {
   it('hashes the empty string', async () => {
      await expect(sha256Hex('')).resolves.toBe(
         'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      );
   });

   it('hashes abc', async () => {
      await expect(sha256Hex('abc')).resolves.toBe(
         'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
      );
   });

   it('returns lowercase hex of 64 characters', async () => {
      const digest = await sha256Hex('hello');
      expect(digest).toMatch(/^[0-9a-f]{64}$/);
   });

   it('hashes different inputs differently', async () => {
      expect(await sha256Hex('a')).not.toBe(await sha256Hex('b'));
   });
});
