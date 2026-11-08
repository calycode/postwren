import { describe, expect, it } from 'vitest';
import { configuredAppOrigin, normaliseAppOrigin, resolveAppOrigin } from '../src/lib/app-url';
import { baseEnv } from './helpers';

describe('app origin', () => {
   it('normalises an origin and drops paths and trailing slashes', () => {
      expect(normaliseAppOrigin('https://mail.example.com/')).toBe('https://mail.example.com');
      expect(normaliseAppOrigin(' https://mail.example.com/app ')).toBe('https://mail.example.com');
      expect(normaliseAppOrigin('http://localhost:8787')).toBe('http://localhost:8787');
   });

   it('assumes https for a bare host, and http for loopback', () => {
      expect(normaliseAppOrigin('postwren.calycode.com')).toBe('https://postwren.calycode.com');
      expect(normaliseAppOrigin('postwren.calycode.com/')).toBe('https://postwren.calycode.com');
      expect(normaliseAppOrigin('localhost:8787')).toBe('http://localhost:8787');
      expect(normaliseAppOrigin('127.0.0.1:8787')).toBe('http://127.0.0.1:8787');
   });

   it('rejects empty and non-http values', () => {
      expect(normaliseAppOrigin('')).toBeNull();
      expect(normaliseAppOrigin('   ')).toBeNull();
      expect(normaliseAppOrigin(undefined)).toBeNull();
      expect(normaliseAppOrigin('ftp://mail.example.com')).toBeNull();
      expect(normaliseAppOrigin('https://')).toBeNull();
   });

   it('falls back to the request origin when APP_URL is unset', () => {
      const env = { ...baseEnv(), APP_URL: '' };

      expect(resolveAppOrigin('https://postwren.example.workers.dev/some/path', env)).toBe(
         'https://postwren.example.workers.dev',
      );
   });

   it('prefers a configured APP_URL over the request origin', () => {
      const env = { ...baseEnv(), APP_URL: 'https://mail.example.com' };

      expect(resolveAppOrigin('https://postwren.example.workers.dev/', env)).toBe(
         'https://mail.example.com',
      );
   });

   it('treats a blank APP_URL as unset for campaign links', () => {
      expect(configuredAppOrigin({ ...baseEnv(), APP_URL: ' ' })).toBeNull();
   });
});
