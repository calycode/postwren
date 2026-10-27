import { describe, expect, it } from 'vitest';
import { appendCursorPage, cursorStateFrom, emptyCursorState } from './pagination';

type Row = { id: string };

describe('emptyCursorState', () => {
   it('starts empty with no next page', () => {
      expect(emptyCursorState<Row>()).toEqual({ items: [], nextCursor: null, hasMore: false });
   });
});

describe('cursorStateFrom', () => {
   it('replaces the current items with the first page', () => {
      const state = cursorStateFrom<Row>(
         { data: [{ id: 'a' }, { id: 'b' }], meta: { nextCursor: 'next', hasMore: true } },
         (row) => row.id,
      );

      expect(state).toEqual({
         items: [{ id: 'a' }, { id: 'b' }],
         nextCursor: 'next',
         hasMore: true,
      });
   });

   it('drops duplicate rows within the first page', () => {
      const state = cursorStateFrom<Row>(
         { data: [{ id: 'a' }, { id: 'a' }], meta: { nextCursor: null, hasMore: false } },
         (row) => row.id,
      );

      expect(state.items).toEqual([{ id: 'a' }]);
   });
});

describe('appendCursorPage', () => {
   it('accumulates rows and advances the cursor', () => {
      const first = cursorStateFrom<Row>({
         data: [{ id: 'a' }],
         meta: { nextCursor: 'cursor-1', hasMore: true },
      });

      const second = appendCursorPage(
         first,
         { data: [{ id: 'b' }], meta: { nextCursor: null, hasMore: false } },
         (row) => row.id,
      );

      expect(second).toEqual({
         items: [{ id: 'a' }, { id: 'b' }],
         nextCursor: null,
         hasMore: false,
      });
   });

   it('does not repeat a row that a later page includes again', () => {
      const first: { items: Row[]; nextCursor: string | null; hasMore: boolean } = {
         items: [{ id: 'a' }, { id: 'b' }],
         nextCursor: 'cursor-1',
         hasMore: true,
      };

      const second = appendCursorPage(
         first,
         {
            data: [{ id: 'b' }, { id: 'c' }],
            meta: { nextCursor: 'cursor-2', hasMore: true },
         },
         (row) => row.id,
      );

      expect(second.items).toEqual([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
      expect(second.nextCursor).toBe('cursor-2');
   });

   it('keeps every row when no key is supplied', () => {
      const first = {
         items: [{ id: 'a' }],
         nextCursor: 'cursor-1',
         hasMore: true,
      };

      const second = appendCursorPage(first, {
         data: [{ id: 'a' }],
         meta: { nextCursor: null, hasMore: false },
      });

      expect(second.items).toEqual([{ id: 'a' }, { id: 'a' }]);
   });
});
