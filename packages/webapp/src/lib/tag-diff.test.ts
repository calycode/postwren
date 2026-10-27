import { describe, expect, it } from 'vitest';
import type { Tag } from './api/types';
import { applyTagDiff, diffTags, hasTagChanges, mergeAppliedTags } from './tag-diff';

function tag(id: string, name = id): Tag {
   return { id, name, subscriber_count: 0 };
}

describe('diffTags', () => {
   it('reports additions and removals by id', () => {
      const saved = [tag('a'), tag('b')];
      const desired = [tag('b'), tag('c')];

      const diff = diffTags(saved, desired);

      expect(diff.added.map((item) => item.id)).toEqual(['c']);
      expect(diff.removed.map((item) => item.id)).toEqual(['a']);
   });

   it('treats the same set in a different order as unchanged', () => {
      const diff = diffTags([tag('a'), tag('b')], [tag('b'), tag('a')]);

      expect(hasTagChanges(diff)).toBe(false);
   });

   it('treats an empty selection as removing everything', () => {
      const diff = diffTags([tag('a')], []);

      expect(diff.removed.map((item) => item.id)).toEqual(['a']);
   });
});

describe('mergeAppliedTags', () => {
   it('keeps only the writes that completed', () => {
      const saved = [tag('a'), tag('b')];

      const merged = mergeAppliedTags(saved, { added: [tag('c')], removed: [tag('a')] });

      expect(merged.map((item) => item.id)).toEqual(['b', 'c']);
   });
});

describe('applyTagDiff', () => {
   it('applies additions then removals', async () => {
      const writes: string[] = [];

      const result = await applyTagDiff(diffTags([tag('a')], [tag('b')]), {
         add: async (id) => {
            writes.push(`add:${id}`);
         },
         remove: async (id) => {
            writes.push(`remove:${id}`);
         },
      });

      expect(result.failure).toBeNull();
      expect(writes).toEqual(['add:b', 'remove:a']);
   });

   it('stops at the failed tag and reports it without claiming the rest happened', async () => {
      const saved = [tag('a')];
      const added: string[] = [];

      const result = await applyTagDiff(diffTags(saved, [tag('b'), tag('c')]), {
         add: async (id) => {
            if (id === 'c') throw new Error('server said no');
            added.push(id);
         },
         remove: async () => undefined,
      });

      expect(added).toEqual(['b']);
      expect(result.added.map((item) => item.id)).toEqual(['b']);
      expect(result.failure?.action).toBe('add');
      expect(result.failure?.tag.id).toBe('c');
   });
});
