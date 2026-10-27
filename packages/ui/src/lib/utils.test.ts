import { describe, expect, it } from 'vitest';

import { cn } from './utils';

describe('cn', () => {
   it('joins class names', () => {
      expect(cn('px-2', 'text-sm')).toBe('px-2 text-sm');
   });

   it('lets the last conflicting utility win', () => {
      expect(cn('px-2', 'px-4')).toBe('px-4');
   });

   it('drops falsy inputs', () => {
      expect(cn('px-2', false, undefined, null)).toBe('px-2');
   });

   it('flattens arrays and object maps', () => {
      expect(cn(['px-2', { 'text-sm': true, hidden: false }])).toBe('px-2 text-sm');
   });
});
