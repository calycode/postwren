export const HISTORY_LIMIT = 50;

/** Consecutive edits to the same field within this window collapse into one step. */
export const COALESCE_WINDOW_MS = 900;

export type History<T> = {
   readonly past: readonly T[];
   readonly present: T;
   readonly future: readonly T[];
   /** The field that produced the latest commit, used to merge rapid typing. */
   readonly last: { readonly key: string; readonly at: number } | null;
};

export type CommitOptions = {
   coalesceKey?: string;
   at?: number;
};

export function createHistory<T>(present: T): History<T> {
   return { past: [], present, future: [], last: null };
}

export function commit<T>(history: History<T>, next: T, options: CommitOptions = {}): History<T> {
   if (next === history.present) return history;

   const at = options.at ?? Date.now();
   const key = options.coalesceKey;

   if (
      key !== undefined &&
      history.last !== null &&
      history.last.key === key &&
      at - history.last.at <= COALESCE_WINDOW_MS
   ) {
      return { ...history, present: next, future: [], last: { key, at } };
   }

   const past = [...history.past, history.present];
   return {
      past: past.length > HISTORY_LIMIT ? past.slice(past.length - HISTORY_LIMIT) : past,
      present: next,
      future: [],
      last: key === undefined ? null : { key, at },
   };
}

export function undo<T>(history: History<T>): History<T> {
   const previous = history.past[history.past.length - 1];
   if (previous === undefined) return history;

   return {
      past: history.past.slice(0, -1),
      present: previous,
      future: [history.present, ...history.future],
      last: null,
   };
}

export function redo<T>(history: History<T>): History<T> {
   const next = history.future[0];
   if (next === undefined) return history;

   return {
      past: [...history.past, history.present],
      present: next,
      future: history.future.slice(1),
      last: null,
   };
}

export function canUndo<T>(history: History<T>): boolean {
   return history.past.length > 0;
}

export function canRedo<T>(history: History<T>): boolean {
   return history.future.length > 0;
}
