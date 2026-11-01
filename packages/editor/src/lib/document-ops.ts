import type {
   Block,
   Column,
   Document,
   DocumentSettings,
   LeafBlock,
   SectionChild,
} from '@postwren/email/ir';

export type BlockPatch = Partial<Block>;

export const SECTION_CHILD_LIMIT = 20;

type ListResult = {
   blocks: Block[];
   changed: boolean;
};

function isContainerType(type: Block['type']): boolean {
   return type === 'columns' || type === 'section';
}

function containsId(block: Block, id: string): boolean {
   if (block.id === id) return true;
   if (block.type === 'columns') {
      return block.columns.some((column) => column.blocks.some((child) => containsId(child, id)));
   }
   if (block.type === 'section') {
      return block.children.some((child) => containsId(child, id));
   }
   return false;
}

function flattenList(blocks: Block[]): Block[] {
   const flat: Block[] = [];
   for (const block of blocks) {
      flat.push(block);
      if (block.type === 'columns') {
         for (const column of block.columns) {
            flat.push(...flattenList(column.blocks));
         }
      } else if (block.type === 'section') {
         flat.push(...flattenList(block.children));
      }
   }
   return flat;
}

function defaultWidths(count: number): number[] {
   if (count === 0) return [];
   if (count === 2) return [50, 50];
   if (count === 3) return [33, 34, 33];
   const base = Math.floor(100 / count);
   const remainder = 100 - base * count;
   return Array.from({ length: count }, (_, index) => base + (index < remainder ? 1 : 0));
}

function updateInList(blocks: Block[], id: string, patch: BlockPatch): ListResult {
   let changed = false;
   const next = blocks.map((block) => {
      if (block.id === id) {
         changed = true;
         return { ...block, ...patch } as unknown as Block;
      }

      if (block.type === 'columns') {
         let columnChanged = false;
         const columns = block.columns.map((column) => {
            const result = updateInList(column.blocks, id, patch);
            if (!result.changed) return column;
            columnChanged = true;
            return { ...column, blocks: result.blocks as LeafBlock[] };
         });
         if (columnChanged) {
            changed = true;
            return { ...block, columns };
         }
      }

      if (block.type === 'section') {
         const result = updateInList(block.children, id, patch);
         if (result.changed) {
            changed = true;
            return { ...block, children: result.blocks as SectionChild[] };
         }
      }

      return block;
   });

   return changed ? { blocks: next, changed } : { blocks, changed };
}

function removeFromList(blocks: Block[], id: string): ListResult {
   let changed = false;
   const next: Block[] = [];

   for (const block of blocks) {
      if (block.id === id) {
         changed = true;
         continue;
      }

      if (block.type === 'columns') {
         let columnChanged = false;
         const columns = block.columns.map((column) => {
            const result = removeFromList(column.blocks, id);
            if (!result.changed) return column;
            columnChanged = true;
            return { ...column, blocks: result.blocks as LeafBlock[] };
         });
         if (columnChanged) {
            changed = true;
            next.push({ ...block, columns });
            continue;
         }
      }

      if (block.type === 'section') {
         const result = removeFromList(block.children, id);
         if (result.changed) {
            changed = true;
            next.push({ ...block, children: result.blocks as SectionChild[] });
            continue;
         }
      }

      next.push(block);
   }

   return changed ? { blocks: next, changed } : { blocks, changed };
}

function moveInList(blocks: Block[], id: string, delta: -1 | 1): ListResult {
   const index = blocks.findIndex((block) => block.id === id);
   if (index >= 0) {
      const target = index + delta;
      if (target < 0 || target >= blocks.length) return { blocks, changed: false };

      const next = blocks.slice();
      const [item] = next.splice(index, 1);
      if (!item) return { blocks, changed: false };
      next.splice(target, 0, item);
      return { blocks: next, changed: true };
   }

   let changed = false;
   const next = blocks.map((block) => {
      if (block.type === 'columns') {
         let columnChanged = false;
         const columns = block.columns.map((column) => {
            const result = moveInList(column.blocks, id, delta);
            if (!result.changed) return column;
            columnChanged = true;
            return { ...column, blocks: result.blocks as LeafBlock[] };
         });

         if (!columnChanged) return block;
         changed = true;
         return { ...block, columns };
      }

      if (block.type === 'section') {
         const result = moveInList(block.children, id, delta);
         if (!result.changed) return block;
         changed = true;
         return { ...block, children: result.blocks as SectionChild[] };
      }

      return block;
   });

   return changed ? { blocks: next, changed } : { blocks, changed };
}

export function insertBlock(doc: Document, block: Block, at?: number): Document {
   const requested =
      at === undefined || !Number.isFinite(at) ? doc.children.length : Math.trunc(at);
   const index = Math.max(0, Math.min(requested, doc.children.length));

   return {
      ...doc,
      children: [...doc.children.slice(0, index), block, ...doc.children.slice(index)],
   };
}

function insertAfterInList(blocks: Block[], id: string, block: Block): ListResult {
   const index = blocks.findIndex((candidate) => candidate.id === id);
   if (index >= 0) {
      const next = blocks.slice();
      next.splice(index + 1, 0, block);
      return { blocks: next, changed: true };
   }

   let changed = false;
   const next = blocks.map((candidate) => {
      if (candidate.type === 'columns') {
         let columnChanged = false;
         const columns = candidate.columns.map((column) => {
            const result = insertAfterInList(column.blocks, id, block);
            if (!result.changed) return column;
            columnChanged = true;
            return { ...column, blocks: result.blocks as LeafBlock[] };
         });

         if (!columnChanged) return candidate;
         changed = true;
         return { ...candidate, columns };
      }

      if (candidate.type === 'section') {
         const result = insertAfterInList(candidate.children, id, block);
         if (!result.changed) return candidate;
         changed = true;
         return { ...candidate, children: result.blocks as SectionChild[] };
      }

      return candidate;
   });

   return changed ? { blocks: next, changed } : { blocks, changed };
}

export function insertAfter(doc: Document, id: string, block: Block): Document {
   const anchorIndex = doc.children.findIndex((child) => containsId(child, id));
   const anchor = anchorIndex < 0 ? undefined : doc.children[anchorIndex];

   if (isContainerType(block.type)) {
      // Containers are only valid at the top level, so a selected nested block
      // anchors the insertion after its nearest top-level ancestor instead.
      return insertBlock(doc, block, anchorIndex < 0 ? undefined : anchorIndex + 1);
   }

   if (anchor?.type === 'section' && anchor.children.length >= SECTION_CHILD_LIMIT) {
      // A full section cannot hold another child, so the block lands after it.
      return insertBlock(doc, block, anchorIndex + 1);
   }

   const result = insertAfterInList(doc.children, id, block);
   return result.changed ? { ...doc, children: result.blocks } : insertBlock(doc, block);
}

function cloneWithNewIds(block: Block): Block {
   if (block.type === 'columns') {
      return {
         ...block,
         id: `${block.type}-${crypto.randomUUID()}`,
         columns: block.columns.map((column) => ({
            ...column,
            blocks: column.blocks.map(cloneWithNewIds) as LeafBlock[],
         })),
      };
   }

   if (block.type === 'section') {
      return {
         ...block,
         id: `${block.type}-${crypto.randomUUID()}`,
         children: block.children.map(cloneWithNewIds) as SectionChild[],
      };
   }

   return { ...block, id: `${block.type}-${crypto.randomUUID()}` };
}

function duplicateInList(blocks: Block[], id: string, newId?: string): ListResult {
   const index = blocks.findIndex((candidate) => candidate.id === id);
   if (index >= 0) {
      const original = blocks[index];
      if (!original) return { blocks, changed: false };

      const copy = cloneWithNewIds(original);
      if (newId !== undefined) {
         (copy as { id: string }).id = newId;
      }

      const next = blocks.slice();
      next.splice(index + 1, 0, copy);
      return { blocks: next, changed: true };
   }

   let changed = false;
   const next = blocks.map((candidate) => {
      if (candidate.type === 'columns') {
         let columnChanged = false;
         const columns = candidate.columns.map((column) => {
            const result = duplicateInList(column.blocks, id, newId);
            if (!result.changed) return column;
            columnChanged = true;
            return { ...column, blocks: result.blocks as LeafBlock[] };
         });

         if (!columnChanged) return candidate;
         changed = true;
         return { ...candidate, columns };
      }

      if (candidate.type === 'section') {
         const result = duplicateInList(candidate.children, id, newId);
         if (!result.changed) return candidate;
         changed = true;
         return { ...candidate, children: result.blocks as SectionChild[] };
      }

      return candidate;
   });

   return changed ? { blocks: next, changed } : { blocks, changed };
}

export function duplicateBlock(doc: Document, id: string, newId?: string): Document {
   const result = duplicateInList(doc.children, id, newId);
   return result.changed ? { ...doc, children: result.blocks } : doc;
}

export function insertIntoSection(doc: Document, sectionId: string, block: LeafBlock): Document {
   const section = findBlock(doc, sectionId);
   if (section?.type !== 'section') return doc;
   if (section.children.length >= SECTION_CHILD_LIMIT) return doc;
   return updateBlock(doc, sectionId, { children: [...section.children, block] });
}

export function removeFromSection(doc: Document, sectionId: string, childId: string): Document {
   const section = findBlock(doc, sectionId);
   if (section?.type !== 'section') return doc;

   const children = section.children.filter((child) => child.id !== childId);
   if (children.length === section.children.length) return doc;
   return updateBlock(doc, sectionId, { children });
}

export function removeBlock(doc: Document, id: string): Document {
   const result = removeFromList(doc.children, id);
   return result.changed ? { ...doc, children: result.blocks } : doc;
}

export function moveBlock(doc: Document, id: string, delta: -1 | 1): Document {
   const result = moveInList(doc.children, id, delta);
   return result.changed ? { ...doc, children: result.blocks } : doc;
}

export type DropPosition = 'before' | 'after';

function reorderInList(
   blocks: Block[],
   sourceId: string,
   targetId: string,
   position: DropPosition,
): ListResult {
   const sourceIndex = blocks.findIndex((block) => block.id === sourceId);
   const targetIndex = blocks.findIndex((block) => block.id === targetId);

   if (sourceIndex >= 0 && targetIndex >= 0) {
      if (sourceIndex === targetIndex) return { blocks, changed: false };

      const next = blocks.slice();
      const [item] = next.splice(sourceIndex, 1);
      if (item === undefined) return { blocks, changed: false };

      let insertAt = targetIndex;
      if (sourceIndex < targetIndex) insertAt -= 1;
      if (position === 'after') insertAt += 1;
      next.splice(insertAt, 0, item);
      return { blocks: next, changed: true };
   }

   let changed = false;
   const next = blocks.map((block) => {
      if (block.type === 'columns') {
         let columnChanged = false;
         const columns = block.columns.map((column) => {
            const result = reorderInList(column.blocks, sourceId, targetId, position);
            if (!result.changed) return column;
            columnChanged = true;
            return { ...column, blocks: result.blocks as LeafBlock[] };
         });

         if (!columnChanged) return block;
         changed = true;
         return { ...block, columns };
      }

      if (block.type === 'section') {
         const result = reorderInList(block.children, sourceId, targetId, position);
         if (!result.changed) return block;
         changed = true;
         return { ...block, children: result.blocks as SectionChild[] };
      }

      return block;
   });

   return changed ? { blocks: next, changed } : { blocks, changed };
}

/**
 * Reorders `sourceId` next to `targetId` when both share a parent list. Blocks
 * dragged across containers are left where they are rather than silently
 * changing nesting.
 */
export function moveBlockTo(
   doc: Document,
   sourceId: string,
   targetId: string,
   position: DropPosition,
): Document {
   if (sourceId === targetId) return doc;
   const result = reorderInList(doc.children, sourceId, targetId, position);
   return result.changed ? { ...doc, children: result.blocks } : doc;
}

export function updateBlock(doc: Document, id: string, patch: BlockPatch): Document {
   const safePatch: BlockPatch = { ...patch };
   delete (safePatch as { id?: string }).id;

   const result = updateInList(doc.children, id, safePatch);
   return result.changed ? { ...doc, children: result.blocks } : doc;
}

export function updateSettings(doc: Document, patch: Partial<DocumentSettings>): Document {
   return { ...doc, settings: { ...doc.settings, ...patch } };
}

export function findBlock(doc: Document, id: string): Block | null {
   return flattenBlocks(doc).find((block) => block.id === id) ?? null;
}

export function flattenBlocks(doc: Document): Block[] {
   return flattenList(doc.children);
}

export function normaliseColumns(columns: Column[]): Column[] {
   if (columns.length === 0) return [];

   const firstColumn = columns[0];
   if (!firstColumn) return columns;
   if (columns.length === 1) return [{ ...firstColumn, widthPercent: 100 }];

   const count = columns.length;
   const raw = columns.map((column) => column.widthPercent);
   const useDefaults = raw.every((width) => !Number.isFinite(width) || width <= 0);
   const widths = useDefaults
      ? defaultWidths(count)
      : raw.map((width) => (Number.isFinite(width) ? Math.round(width) : 0));

   if (!useDefaults) {
      const total = widths.reduce((sum, width) => sum + width, 0);
      if (total !== 100) {
         const first = Math.min(Math.max(widths[0] ?? 1, 1), Math.max(1, 100 - (count - 1)));
         const remaining = 100 - first;
         const others = count - 1;
         const base = Math.floor(remaining / others);
         const extra = remaining - base * others;

         widths[0] = first;
         let seen = 0;
         for (let index = 1; index < count; index += 1) {
            widths[index] = base + (seen < extra ? 1 : 0);
            seen += 1;
         }
      }
   }

   return columns.map((column, index) => ({
      ...column,
      widthPercent: widths[index] ?? 0,
   }));
}

export function blockLabel(block: Block): string {
   switch (block.type) {
      case 'heading':
         return `Heading ${block.level}`;
      case 'text':
         return 'Text';
      case 'button':
         return 'Button';
      case 'image':
         return 'Image';
      case 'divider':
         return 'Divider';
      case 'spacer':
         return 'Spacer';
      case 'columns':
         return `Columns (${block.columns.length})`;
      case 'social':
         return 'Social';
      case 'list':
         return block.ordered ? 'Numbered list' : 'List';
      case 'quote':
         return 'Quote';
      case 'code':
         return 'Code';
      case 'link':
         return 'Link';
      case 'markdown':
         return 'Markdown';
      case 'avatar':
         return 'Avatar';
      case 'gallery':
         return `Gallery (${block.images.length})`;
      case 'table':
         return 'Table';
      case 'section':
         return `Section (${block.children.length})`;
   }
}
