import { describe, expect, it } from 'vitest';
import { apiKeyHash, generateApiKey, parseApiKey } from '../src/auth/api-key';
import { signServiceToken, verifyServiceToken } from '../src/auth/service-token';

describe('API key format', () => {
   it('generates a prefix and a secret that survive parsing', () => {
      const { raw, prefix } = generateApiKey();

      expect(raw.startsWith(`pwr_${prefix}_`)).toBe(true);
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
      expect(parseApiKey('pwr_short_x')).toBeNull();
      expect(parseApiKey('not-a-key')).toBeNull();
      expect(parseApiKey('pwr_abcdef_short')).toBeNull();
   });
});

describe('MCP service token', () => {
   it('round-trips scopes and rejects a tampered signature', async () => {
      const token = await signServiceToken(
         'test-secret',
         ['tags:read', 'subscribers:write'],
         60,
         1000,
      );
      await expect(verifyServiceToken('test-secret', token, 1001)).resolves.toEqual([
         'tags:read',
         'subscribers:write',
      ]);

      const [body, signature] = token.split('.');
      await expect(
         verifyServiceToken('test-secret', `${body}.${signature?.slice(0, -1)}x`, 1001),
      ).resolves.toBeNull();
      await expect(verifyServiceToken('other-secret', token, 1001)).resolves.toBeNull();
   });

   it('expires and refuses unknown scopes', async () => {
      const token = await signServiceToken('test-secret', ['tags:read'], 60, 1000);

      await expect(verifyServiceToken('test-secret', token, 1061)).resolves.toBeNull();
      await expect(verifyServiceToken('test-secret', 'not-a-token', 1001)).resolves.toBeNull();
   });
});
