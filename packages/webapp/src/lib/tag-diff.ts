import type { Tag } from './api/types';

export type TagDiff = {
   added: Tag[];
   removed: Tag[];
};

export type TagFailure = {
   action: 'add' | 'remove';
   tag: Tag;
   cause: unknown;
};

export type TagApplyResult = {
   added: Tag[];
   removed: Tag[];
   failure: TagFailure | null;
};

export type TagWrites = {
   add: (tagId: string) => Promise<void>;
   remove: (tagId: string) => Promise<void>;
};

export function diffTags(saved: readonly Tag[], desired: readonly Tag[]): TagDiff {
   const savedIds = new Set(saved.map((tag) => tag.id));
   const desiredIds = new Set(desired.map((tag) => tag.id));

   return {
      added: desired.filter((tag) => !savedIds.has(tag.id)),
      removed: saved.filter((tag) => !desiredIds.has(tag.id)),
   };
}

export function hasTagChanges(diff: TagDiff): boolean {
   return diff.added.length > 0 || diff.removed.length > 0;
}

export function mergeAppliedTags(
   saved: readonly Tag[],
   result: { added: readonly Tag[]; removed: readonly Tag[] },
): Tag[] {
   const removedIds = new Set(result.removed.map((tag) => tag.id));
   const merged = saved.filter((tag) => !removedIds.has(tag.id));

   for (const tag of result.added) {
      if (!merged.some((item) => item.id === tag.id)) merged.push(tag);
   }

   return merged;
}

export async function applyTagDiff(diff: TagDiff, writes: TagWrites): Promise<TagApplyResult> {
   const added: Tag[] = [];
   const removed: Tag[] = [];

   for (const tag of diff.added) {
      try {
         await writes.add(tag.id);
         added.push(tag);
      } catch (cause) {
         return { added, removed, failure: { action: 'add', tag, cause } };
      }
   }

   for (const tag of diff.removed) {
      try {
         await writes.remove(tag.id);
         removed.push(tag);
      } catch (cause) {
         return { added, removed, failure: { action: 'remove', tag, cause } };
      }
   }

   return { added, removed, failure: null };
}
