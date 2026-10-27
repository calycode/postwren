import { describe, expect, it } from 'vitest';
import { JSON_HEADERS, cachePublic, noStore, timingSafeEqual } from './http';

describe('JSON_HEADERS', () => {
   it('declares a UTF-8 JSON content type', () => {
      expect(JSON_HEADERS['content-type']).toBe('application/json; charset=utf-8');
   });
});

describe('noStore', () => {
   it('disables caching', () => {
      expect(noStore()).toEqual({ 'cache-control': 'no-store' });
   });
});

describe('cachePublic', () => {
   it('sets a public max-age', () => {
      expect(cachePublic(60)).toEqual({ 'cache-control': 'public, max-age=60' });
   });

   it('clamps to a non-negative integer', () => {
      expect(cachePublic(-5)).toEqual({ 'cache-control': 'public, max-age=0' });
      expect(cachePublic(1.9)).toEqual({ 'cache-control': 'public, max-age=1' });
   });
});

describe('timingSafeEqual', () => {
   it('returns true for equal strings', () => {
      expect(timingSafeEqual('correct-horse', 'correct-horse')).toBe(true);
      expect(timingSafeEqual('', '')).toBe(true);
   });

   it('returns false for different strings of equal length', () => {
      expect(timingSafeEqual('correct-horse', 'correct-house')).toBe(false);
   });

   it('returns false for different lengths', () => {
      expect(timingSafeEqual('secret', 'secret-longer')).toBe(false);
      expect(timingSafeEqual('', 'a')).toBe(false);
   });

   it('handles multi-byte characters', () => {
      expect(timingSafeEqual('héllo', 'héllo')).toBe(true);
      expect(timingSafeEqual('héllo', 'hello')).toBe(false);
   });
});
