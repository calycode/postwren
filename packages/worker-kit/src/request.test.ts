import { describe, expect, it } from 'vitest';
import { clientIp, deriveRequestId } from './request';

describe('deriveRequestId', () => {
   it('prefers cf-ray', () => {
      const headers = new Headers({ 'cf-ray': '8f3a1b2c3d4e5f6a-CDG', 'x-request-id': 'req_1' });
      expect(deriveRequestId(headers)).toBe('8f3a1b2c3d4e5f6a-CDG');
   });

   it('falls back to x-request-id', () => {
      expect(deriveRequestId(new Headers({ 'x-request-id': 'req_1' }))).toBe('req_1');
   });

   it('generates a uuid when neither header is present', () => {
      const first = deriveRequestId(new Headers());
      const second = deriveRequestId(new Headers());

      expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
      expect(first).not.toBe(second);
   });

   it('ignores blank headers', () => {
      const headers = new Headers({ 'cf-ray': '   ', 'x-request-id': 'req_1' });
      expect(deriveRequestId(headers)).toBe('req_1');
   });
});

describe('clientIp', () => {
   it('prefers cf-connecting-ip', () => {
      const headers = new Headers({
         'cf-connecting-ip': '203.0.113.10',
         'x-forwarded-for': '198.51.100.7, 203.0.113.10',
      });

      expect(clientIp(headers)).toBe('203.0.113.10');
   });

   it('uses the first x-forwarded-for hop', () => {
      expect(clientIp(new Headers({ 'x-forwarded-for': '198.51.100.7, 203.0.113.10' }))).toBe(
         '198.51.100.7',
      );
   });

   it('returns unknown when no address header is present', () => {
      expect(clientIp(new Headers())).toBe('unknown');
   });

   it('returns unknown for blank headers', () => {
      expect(clientIp(new Headers({ 'cf-connecting-ip': ' ' }))).toBe('unknown');
   });
});
