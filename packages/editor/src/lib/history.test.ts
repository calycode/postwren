import { describe, expect, it } from 'vitest';
import {
   COALESCE_WINDOW_MS,
   HISTORY_LIMIT,
   canRedo,
   canUndo,
   commit,
   createHistory,
   redo,
   undo,
} from './history';

describe('history', () => {
   it('starts with nothing to undo or redo', () => {
      const history = createHistory('first');

      expect(history).toEqual({ past: [], present: 'first', future: [], last: null });
      expect(canUndo(history)).toBe(false);
      expect(canRedo(history)).toBe(false);
   });

   it('moves the present into the past when a new document is committed', () => {
      const history = commit(createHistory('first'), 'second');

      expect(history).toEqual({ past: ['first'], present: 'second', future: [], last: null });
      expect(canUndo(history)).toBe(true);
   });

   it('ignores a commit that does not change the document', () => {
      const history = commit(createHistory('first'), 'second');

      expect(commit(history, 'second')).toBe(history);
   });

   it('round-trips undo and redo', () => {
      const committed = commit(createHistory('first'), 'second');
      const undone = undo(committed);

      expect(undone.present).toBe('first');
      expect(canUndo(undone)).toBe(false);
      expect(canRedo(undone)).toBe(true);
      expect(redo(undone)).toEqual(committed);
   });

   it('keeps only the most recent steps when the stack grows past the limit', () => {
      let history = createHistory('doc-0');
      for (let index = 1; index <= HISTORY_LIMIT + 9; index += 1) {
         history = commit(history, `doc-${index}`);
      }

      expect(history.present).toBe(`doc-${HISTORY_LIMIT + 9}`);
      expect(history.past).toHaveLength(HISTORY_LIMIT);

      for (let step = 0; step < HISTORY_LIMIT; step += 1) {
         history = undo(history);
      }

      expect(history.present).toBe('doc-9');
      expect(canUndo(history)).toBe(false);
   });

   it('drops the redo stack when a new document is committed after undo', () => {
      const undone = undo(commit(createHistory('first'), 'second'));
      const branched = commit(undone, 'other');

      expect(branched.future).toEqual([]);
      expect(canRedo(branched)).toBe(false);
      expect(redo(branched)).toBe(branched);
   });

   it('leaves the original history object untouched', () => {
      const history = createHistory('first');
      const committed = commit(history, 'second');

      expect(history).toEqual({ past: [], present: 'first', future: [], last: null });
      expect(committed).not.toBe(history);
   });

   it('merges rapid edits to the same field into one undo step', () => {
      let history = createHistory('Heading');
      history = commit(history, 'Heading a', { coalesceKey: 'heading:text', at: 1000 });
      history = commit(history, 'Heading ab', { coalesceKey: 'heading:text', at: 1300 });

      expect(history.past).toEqual(['Heading']);
      expect(history.present).toBe('Heading ab');
      expect(undo(history).present).toBe('Heading');
   });

   it('starts a new undo step after the coalesce window elapses', () => {
      let history = createHistory('Heading');
      history = commit(history, 'Heading a', { coalesceKey: 'heading:text', at: 1000 });
      history = commit(history, 'Heading ab', {
         coalesceKey: 'heading:text',
         at: 1000 + COALESCE_WINDOW_MS + 1,
      });

      expect(history.past).toEqual(['Heading', 'Heading a']);
   });

   it('starts a new undo step when a different field changes', () => {
      let history = createHistory('Heading');
      history = commit(history, 'Heading a', { coalesceKey: 'heading:text', at: 1000 });
      history = commit(history, 'Heading a!', { coalesceKey: 'text:text', at: 1100 });

      expect(history.past).toHaveLength(2);
   });

   it('does not merge typing that follows an undo', () => {
      let history = commit(createHistory('a'), 'b', { coalesceKey: 'text', at: 1000 });
      history = undo(history);
      history = commit(history, 'c', { coalesceKey: 'text', at: 1200 });

      expect(history.past).toEqual(['a']);
      expect(history.present).toBe('c');
   });
});
