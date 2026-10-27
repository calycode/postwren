import { describe, expect, it } from 'vitest';

import { nextTabIndex } from './tabs-keyboard';

describe('nextTabIndex', () => {
   it('moves right and wraps to the first tab', () => {
      expect(nextTabIndex(0, 'ArrowRight', 3)).toBe(1);
      expect(nextTabIndex(2, 'ArrowRight', 3)).toBe(0);
   });

   it('moves left and wraps to the last tab', () => {
      expect(nextTabIndex(2, 'ArrowLeft', 3)).toBe(1);
      expect(nextTabIndex(0, 'ArrowLeft', 3)).toBe(2);
   });

   it('jumps to the first and last tab with Home and End', () => {
      expect(nextTabIndex(1, 'Home', 4)).toBe(0);
      expect(nextTabIndex(1, 'End', 4)).toBe(3);
   });

   it('ignores keys that do not navigate tabs', () => {
      expect(nextTabIndex(1, 'Enter', 4)).toBeNull();
      expect(nextTabIndex(1, 'Tab', 4)).toBeNull();
   });

   it('returns null when there are no tabs', () => {
      expect(nextTabIndex(0, 'ArrowRight', 0)).toBeNull();
   });
});
