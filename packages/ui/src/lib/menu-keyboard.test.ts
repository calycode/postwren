import { describe, expect, it } from 'vitest';

import { nextMenuIndex } from './menu-keyboard';

const enabled = () => false;

describe('nextMenuIndex', () => {
   it('moves down and wraps to the first item', () => {
      expect(nextMenuIndex(0, 3, 'ArrowDown', enabled)).toBe(1);
      expect(nextMenuIndex(2, 3, 'ArrowDown', enabled)).toBe(0);
   });

   it('moves up and wraps to the last item', () => {
      expect(nextMenuIndex(2, 3, 'ArrowUp', enabled)).toBe(1);
      expect(nextMenuIndex(0, 3, 'ArrowUp', enabled)).toBe(2);
   });

   it('enters the menu from nothing focused', () => {
      expect(nextMenuIndex(-1, 3, 'ArrowDown', enabled)).toBe(0);
      expect(nextMenuIndex(-1, 3, 'ArrowUp', enabled)).toBe(2);
   });

   it('jumps to the first and last item with Home and End', () => {
      expect(nextMenuIndex(1, 4, 'Home', enabled)).toBe(0);
      expect(nextMenuIndex(1, 4, 'End', enabled)).toBe(3);
   });

   it('skips disabled items while moving', () => {
      const disabled = (index: number) => index === 1 || index === 2;
      expect(nextMenuIndex(0, 4, 'ArrowDown', disabled)).toBe(3);
      expect(nextMenuIndex(3, 4, 'ArrowUp', disabled)).toBe(0);
      expect(nextMenuIndex(0, 4, 'End', disabled)).toBe(3);
   });

   it('skips disabled items at the edges when wrapping', () => {
      const disabled = (index: number) => index === 0;
      expect(nextMenuIndex(2, 3, 'ArrowDown', disabled)).toBe(1);
      expect(nextMenuIndex(1, 3, 'ArrowUp', disabled)).toBe(2);
   });

   it('ignores keys that do not navigate the menu', () => {
      expect(nextMenuIndex(1, 4, 'Tab', enabled)).toBeNull();
      expect(nextMenuIndex(1, 4, 'Enter', enabled)).toBeNull();
      expect(nextMenuIndex(1, 4, 'Escape', enabled)).toBeNull();
   });

   it('returns null when there are no selectable items', () => {
      expect(nextMenuIndex(0, 0, 'ArrowDown', enabled)).toBeNull();
      expect(nextMenuIndex(0, 2, 'ArrowDown', () => true)).toBeNull();
   });
});
