import { describe, expect, it } from 'vitest';
import { apiKeyHash, generateApiKey, parseApiKey } from '../src/auth/api-key';
import { pkceChallenge, verifyPkce } from '../src/oauth/pkce';

describe('API key format', () => {
   it('generates a prefix and a secret that survive parsing', () => {
      const { raw, prefix } = generateApiKey();

      expect(raw.startsWith(`mlr_${prefix}_`)).toBe(true);
      expect(parseApiKey(raw)).toEqual({ prefix, secret: raw.slice(prefix.length + 5) });
   });

   it('hashes deterministically without keeping the plaintext', async () => {
      const { raw } = generateApiKey();
      const first = await apiKeyHash(raw);
      const second = await apiKeyHash(raw);

      expect(first).toBe(second);
      expect(first).toMatch(/^[0-9a-f]{64}$/);
      expect(first).not.toContain(raw);
   });

   it('rejects secrets that do not follow the documented format', () => {
      expect(parseApiKey('mlr_short_x')).toBeNull();
      expect(parseApiKey('not-a-key')).toBeNull();
      expect(parseApiKey('mlr_abcdef_short')).toBeNull();
   });
});

describe('PKCE S256', () => {
   it('matches the RFC 7636 test vector', async () => {
      const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
      await expect(pkceChallenge(verifier)).resolves.toBe(
         'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
      );
   });

   it('rejects a wrong verifier and non-S256 methods', async () => {
      const challenge = await pkceChallenge('a'.repeat(48));

      await expect(verifyPkce('a'.repeat(48), challenge, 'S256')).resolves.toBe(true);
      await expect(verifyPkce('b'.repeat(48), challenge, 'S256')).resolves.toBe(false);
      await expect(verifyPkce('a'.repeat(48), challenge, 'plain')).resolves.toBe(false);
   });
});
