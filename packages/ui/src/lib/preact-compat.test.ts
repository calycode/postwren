import { describe, expect, expectTypeOf, it } from 'vitest';

import { withoutRef } from './preact-compat';

describe('withoutRef', () => {
   it('strips ref and keeps every other prop', () => {
      const props = { href: '/campaigns', ref: () => {} };
      const result = withoutRef(props);

      expect(result).toEqual({ href: '/campaigns' });
      expect('ref' in result).toBe(false);
   });

   it('removes ref from the result type', () => {
      const result = withoutRef({ id: 'campaign-name', ref: undefined });

      expectTypeOf(result).toEqualTypeOf<{ id: string }>();

      type ResultHasRef = 'ref' extends keyof typeof result ? true : false;
      const hasRef: ResultHasRef = false;

      expect(hasRef).toBe(false);
   });
});
