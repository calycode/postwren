import type { Block, Column, Document, DocumentSettings } from '@mailer/email/ir';

export type BlockPatch = Partial<Block>;

type ListResult = {
   blocks: Block[];
   changed: boolean;
};

function flattenList(blocks: Block[]): Block[] {
   const flat: Block[] = [];
   for (const block of blocks) {
      flat.push(block);
      if (block.type === 'columns') {
         for (const column of block.columns) {
            flat.push(...flattenList(column.blocks));
         }
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
            return { ...column, blocks: result.blocks };
         });
         if (columnChanged) {
            changed = true;
            return { ...block, columns };
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
            return { ...column, blocks: result.blocks };
         });
         if (columnChanged) {
            changed = true;
            next.push({ ...block, columns });
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
      if (block.type !== 'columns') return block;

      let columnChanged = false;
      const columns = block.columns.map((column) => {
         const result = moveInList(column.blocks, id, delta);
         if (!result.changed) return column;
         columnChanged = true;
         return { ...column, blocks: result.blocks };
      });

      if (!columnChanged) return block;
      changed = true;
      return { ...block, columns };
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
      if (candidate.type !== 'columns') return candidate;

      let columnChanged = false;
      const columns = candidate.columns.map((column) => {
         const result = insertAfterInList(column.blocks, id, block);
         if (!result.changed) return column;
         columnChanged = true;
         return { ...column, blocks: result.blocks };
      });

      if (!columnChanged) return candidate;
      changed = true;
      return { ...candidate, columns };
   });

   return changed ? { blocks: next, changed } : { blocks, changed };
}

export function insertAfter(doc: Document, id: string, block: Block): Document {
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
            blocks: column.blocks.map(cloneWithNewIds),
         })),
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
      if (candidate.type !== 'columns') return candidate;

      let columnChanged = false;
      const columns = candidate.columns.map((column) => {
         const result = duplicateInList(column.blocks, id, newId);
         if (!result.changed) return column;
         columnChanged = true;
         return { ...column, blocks: result.blocks };
      });

      if (!columnChanged) return candidate;
      changed = true;
      return { ...candidate, columns };
   });

   return changed ? { blocks: next, changed } : { blocks, changed };
}

export function duplicateBlock(doc: Document, id: string, newId?: string): Document {
   const result = duplicateInList(doc.children, id, newId);
   return result.changed ? { ...doc, children: result.blocks } : doc;
}

export function removeBlock(doc: Document, id: string): Document {
   const result = removeFromList(doc.children, id);
   return result.changed ? { ...doc, children: result.blocks } : doc;
}

export function moveBlock(doc: Document, id: string, delta: -1 | 1): Document {
   const result = moveInList(doc.children, id, delta);
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
   }
}
