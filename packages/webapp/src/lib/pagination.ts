export type CursorState<T> = {
   items: T[];
   nextCursor: string | null;
   hasMore: boolean;
};

export type CursorPage<T> = {
   data: T[];
   meta: {
      nextCursor: string | null;
      hasMore: boolean;
   };
};

export function emptyCursorState<T>(): CursorState<T> {
   return { items: [], nextCursor: null, hasMore: false };
}

export function cursorStateFrom<T>(page: CursorPage<T>, key?: (item: T) => string): CursorState<T> {
   return {
      items: key ? uniqueBy(page.data, key) : page.data,
      nextCursor: page.meta.nextCursor,
      hasMore: page.meta.hasMore,
   };
}

export function appendCursorPage<T>(
   state: CursorState<T>,
   page: CursorPage<T>,
   key?: (item: T) => string,
): CursorState<T> {
   let additions = page.data;

   if (key) {
      const seen = new Set(state.items.map(key));
      additions = page.data.filter((item) => {
         const value = key(item);
         if (seen.has(value)) return false;
         seen.add(value);
         return true;
      });
   }

   return {
      items: [...state.items, ...additions],
      nextCursor: page.meta.nextCursor,
      hasMore: page.meta.hasMore,
   };
}

function uniqueBy<T>(items: T[], key: (item: T) => string): T[] {
   const seen = new Set<string>();
   return items.filter((item) => {
      const value = key(item);
      if (seen.has(value)) return false;
      seen.add(value);
      return true;
   });
}
