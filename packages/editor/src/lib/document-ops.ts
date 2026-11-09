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
export const REPEAT_CHILD_LIMIT = 20;

type ListResult = {
   blocks: Block[];
   changed: boolean;
};

type ListTransform = (blocks: Block[]) => ListResult;

function unchanged(blocks: Block[]): ListResult {
   return { blocks, changed: false };
}

function isContainerType(type: Block['type']): boolean {
   return type === 'columns' || type === 'section' || type === 'repeat';
}

/** The child lists a container owns, in visual order. Leaves return null. */
function childBlocks(block: Block): Block[] | null {
   if (block.type === 'columns') return block.columns.flatMap((column) => column.blocks);
   if (block.type === 'section' || block.type === 'repeat') return block.children;
   return null;
}

/**
 * Rebuilds a container's child lists through `transform`. Returns null when no
 * child list changed, so untouched blocks and columns keep their identity.
 */
function mapContainerChildren(block: Block, transform: ListTransform): Block | null {
   if (block.type === 'columns') {
      let changed = false;
      const columns = block.columns.map((column) => {
         const result = mapBlockLists(column.blocks, transform);
         if (!result.changed) return column;
         changed = true;
         return { ...column, blocks: result.blocks as LeafBlock[] };
      });
      return changed ? { ...block, columns } : null;
   }

   if (block.type === 'section') {
      const result = mapBlockLists(block.children, transform);
      return result.changed ? { ...block, children: result.blocks as SectionChild[] } : null;
   }

   if (block.type === 'repeat') {
      const result = mapBlockLists(block.children, transform);
      return result.changed ? { ...block, children: result.blocks } : null;
   }

   return null;
}

/**
 * The one recursive traversal over the document tree. `transform` runs against
 * each list: the top level first, then the children of every container. A list
 * that reports a change returns as-is, so nested lists are never searched once
 * the target has been found at that level.
 */
function mapBlockLists(blocks: Block[], transform: ListTransform): ListResult {
   const local = transform(blocks);
   if (local.changed) return local;

   let changed = false;
   const next = blocks.map((block) => {
      const rebuilt = mapContainerChildren(block, transform);
      if (rebuilt === null) return block;
      changed = true;
      return rebuilt;
   });

   return changed ? { blocks: next, changed } : unchanged(blocks);
}

function containsId(block: Block, id: string): boolean {
   if (block.id === id) return true;
   const children = childBlocks(block);
   return children !== null && children.some((child) => containsId(child, id));
}

function flattenList(blocks: Block[]): Block[] {
   const flat: Block[] = [];
   for (const block of blocks) {
      flat.push(block);
      const children = childBlocks(block);
      if (children !== null) flat.push(...flattenList(children));
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
   return mapBlockLists(blocks, (list) => {
      const index = list.findIndex((block) => block.id === id);
      const target = index < 0 ? undefined : list[index];
      if (target === undefined) return unchanged(list);

      const next = list.slice();
      next[index] = { ...target, ...patch } as unknown as Block;
      return { blocks: next, changed: true };
   });
}

function removeFromList(blocks: Block[], id: string): ListResult {
   return mapBlockLists(blocks, (list) => {
      const index = list.findIndex((block) => block.id === id);
      if (index < 0) return unchanged(list);
      return { blocks: [...list.slice(0, index), ...list.slice(index + 1)], changed: true };
   });
}

function moveInList(blocks: Block[], id: string, delta: -1 | 1): ListResult {
   return mapBlockLists(blocks, (list) => {
      const index = list.findIndex((block) => block.id === id);
      if (index < 0) return unchanged(list);

      const target = index + delta;
      if (target < 0 || target >= list.length) return unchanged(list);

      const next = list.slice();
      const [item] = next.splice(index, 1);
      if (item === undefined) return unchanged(list);
      next.splice(target, 0, item);
      return { blocks: next, changed: true };
   });
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

function insertAdjacentInList(
   blocks: Block[],
   id: string,
   block: Block,
   position: DropPosition,
): ListResult {
   return mapBlockLists(blocks, (list) => {
      const index = list.findIndex((candidate) => candidate.id === id);
      if (index < 0) return unchanged(list);

      const next = list.slice();
      next.splice(index + (position === 'after' ? 1 : 0), 0, block);
      return { blocks: next, changed: true };
   });
}

function appendAfterTopLevel(doc: Document, id: string, block: Block): Document {
   const index = doc.children.findIndex((child) => containsId(child, id));
   return insertBlock(doc, block, index < 0 ? undefined : index + 1);
}

/**
 * Insert for a block dropped or added from the library. The target decides the
 * parent: dropping on a section or a column appends inside it, dropping next to
 * a nested block stays in that parent list, and containers never nest.
 */
export function insertAtTarget(
   doc: Document,
   block: Block,
   targetId: string | null,
   position: InsertPosition = 'after',
): Document {
   if (targetId === null) return insertBlock(doc, block);

   const target = findBlock(doc, targetId);
   if (target === null) return insertBlock(doc, block);

   const isLeaf = !isContainerType(block.type);

   if (target.type === 'section') {
      if (!isLeaf) return appendAfterTopLevel(doc, target.id, block);
      return insertIntoSection(doc, target.id, block as LeafBlock);
   }

   if (target.type === 'columns') {
      if (!isLeaf) return appendAfterTopLevel(doc, target.id, block);
      return insertIntoColumn(doc, target.id, 0, block as LeafBlock);
   }

   if (target.type === 'repeat') {
      if (block.type === 'repeat') return appendAfterTopLevel(doc, target.id, block);
      return insertIntoRepeat(doc, target.id, block);
   }

   if (!isLeaf) return appendAfterTopLevel(doc, target.id, block);

   const ancestor = doc.children.find((child) => containsId(child, target.id));
   if (ancestor?.type === 'section' && ancestor.children.length >= SECTION_CHILD_LIMIT) {
      // A full section cannot hold another child, so the block lands after it.
      return appendAfterTopLevel(doc, target.id, block);
   }
   if (ancestor?.type === 'repeat' && ancestor.children.length >= REPEAT_CHILD_LIMIT) {
      return appendAfterTopLevel(doc, target.id, block);
   }

   const result = insertAdjacentInList(
      doc.children,
      targetId,
      block,
      position === 'inside' ? 'after' : position,
   );
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

   if (block.type === 'repeat') {
      return {
         ...block,
         id: `${block.type}-${crypto.randomUUID()}`,
         children: block.children.map(cloneWithNewIds),
      };
   }

   return { ...block, id: `${block.type}-${crypto.randomUUID()}` };
}

export function cloneBlockWithNewIds(block: Block): Block {
   return cloneWithNewIds(block);
}

function duplicateInList(blocks: Block[], id: string, newId?: string): ListResult {
   return mapBlockLists(blocks, (list) => {
      const index = list.findIndex((candidate) => candidate.id === id);
      const original = index < 0 ? undefined : list[index];
      if (original === undefined) return unchanged(list);

      const copy = cloneWithNewIds(original);
      if (newId !== undefined) {
         (copy as { id: string }).id = newId;
      }

      const next = list.slice();
      next.splice(index + 1, 0, copy);
      return { blocks: next, changed: true };
   });
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

export function insertIntoRepeat(doc: Document, repeatId: string, block: Block): Document {
   const repeat = findBlock(doc, repeatId);
   if (repeat?.type !== 'repeat') return doc;
   if (block.type === 'repeat') return doc;
   if (repeat.children.length >= REPEAT_CHILD_LIMIT) return doc;
   return updateBlock(doc, repeatId, { children: [...repeat.children, block] });
}

export function insertIntoColumn(
   doc: Document,
   columnsId: string,
   columnIndex: number,
   block: LeafBlock,
): Document {
   const container = findBlock(doc, columnsId);
   if (container?.type !== 'columns' || container.columns.length === 0) return doc;

   const index = Math.max(0, Math.min(columnIndex, container.columns.length - 1));
   const columns = container.columns.map((column, position) =>
      position === index ? { ...column, blocks: [...column.blocks, block] } : column,
   );

   return updateBlock(doc, columnsId, { columns });
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

/** Library drops may also mean "append inside this container". */
export type InsertPosition = DropPosition | 'inside';

function reorderInList(
   blocks: Block[],
   sourceId: string,
   targetId: string,
   position: DropPosition,
): ListResult {
   return mapBlockLists(blocks, (list) => {
      const sourceIndex = list.findIndex((block) => block.id === sourceId);
      const targetIndex = list.findIndex((block) => block.id === targetId);
      if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
         return unchanged(list);
      }

      const next = list.slice();
      const [item] = next.splice(sourceIndex, 1);
      if (item === undefined) return unchanged(list);

      let insertAt = targetIndex;
      if (sourceIndex < targetIndex) insertAt -= 1;
      if (position === 'after') insertAt += 1;
      next.splice(insertAt, 0, item);
      return { blocks: next, changed: true };
   });
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
      case 'repeat':
         return `Repeat (${block.children.length})`;
   }
}
