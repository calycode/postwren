import { describe, expect, it } from 'vitest';
import type {
   Block,
   Column,
   ColumnsBlock,
   Document,
   HeadingBlock,
   TextBlock,
} from '@mailer/email/ir';
import { defaultSettings } from '@mailer/email/ir';
import {
   blockLabel,
   duplicateBlock,
   findBlock,
   flattenBlocks,
   insertAfter,
   insertBlock,
   moveBlock,
   normaliseColumns,
   removeBlock,
   updateBlock,
   updateSettings,
} from './document-ops';

const padding = { top: 0, right: 0, bottom: 0, left: 0 };

function textBlock(id: string, text = 'Hello'): TextBlock {
   return {
      id,
      type: 'text',
      text,
      align: 'left',
      fontSize: 16,
      lineHeight: 24,
      padding,
   };
}

function headingBlock(id: string, text = 'Title'): HeadingBlock {
   return {
      id,
      type: 'heading',
      level: 1,
      text,
      align: 'left',
      fontSize: 32,
      lineHeight: 40,
      padding,
   };
}

function columnsBlock(id: string, columns: Column[]): ColumnsBlock {
   return {
      id,
      type: 'columns',
      columns,
      padding,
   };
}

function documentOf(children: Block[]): Document {
   return {
      version: 1,
      settings: defaultSettings(),
      children,
   };
}

function snapshot(doc: Document): Document {
   return JSON.parse(JSON.stringify(doc)) as Document;
}

describe('document-ops', () => {
   it('inserts a block at the requested index without mutating the document', () => {
      const doc = documentOf([textBlock('a'), textBlock('c')]);
      const before = snapshot(doc);
      const inserted = textBlock('b');

      const result = insertBlock(doc, inserted, 1);

      expect(result.children.map((block) => block.id)).toEqual(['a', 'b', 'c']);
      expect(result.children[1]).toBe(inserted);
      expect(doc).toEqual(before);
      expect(result).not.toBe(doc);
   });

   it('inserts a block directly after a top-level or nested block', () => {
      const doc = documentOf([
         textBlock('a'),
         textBlock('b'),
         columnsBlock('cols', [{ widthPercent: 100, blocks: [textBlock('nested')] }]),
      ]);

      const topLevel = insertAfter(doc, 'a', textBlock('after-a'));
      expect(topLevel.children.map((block) => block.id)).toEqual(['a', 'after-a', 'b', 'cols']);

      const nested = insertAfter(doc, 'nested', textBlock('after-nested'));
      const cols = nested.children[2];
      expect(cols?.type).toBe('columns');
      if (cols?.type === 'columns') {
         expect(cols.columns[0]?.blocks.map((block) => block.id)).toEqual([
            'nested',
            'after-nested',
         ]);
      }

      expect(doc.children.map((block) => block.id)).toEqual(['a', 'b', 'cols']);
   });

   it('appends a block when the insertion anchor is missing', () => {
      const doc = documentOf([textBlock('a')]);
      const result = insertAfter(doc, 'missing', textBlock('b'));

      expect(result.children.map((block) => block.id)).toEqual(['a', 'b']);
   });

   it('duplicates a block after itself with fresh ids', () => {
      const doc = documentOf([textBlock('a'), textBlock('b')]);
      const result = duplicateBlock(doc, 'a');

      expect(result.children).toHaveLength(3);
      expect(result.children[0]?.id).toBe('a');
      const copy = result.children[1];
      expect(copy?.id).not.toBe('a');
      expect(copy?.type).toBe('text');
      expect(copy?.id).toMatch(/^text-/);
      expect(result.children[2]?.id).toBe('b');
      expect(doc.children).toHaveLength(2);
   });

   it('duplicates a nested columns block with unique child ids', () => {
      const doc = documentOf([
         columnsBlock('cols', [
            { widthPercent: 50, blocks: [textBlock('left')] },
            { widthPercent: 50, blocks: [textBlock('right')] },
         ]),
      ]);

      const result = duplicateBlock(doc, 'cols');
      const copy = result.children[1];
      expect(copy?.type).toBe('columns');
      if (copy?.type === 'columns') {
         expect(copy.id).not.toBe('cols');
         expect(copy.columns[0]?.blocks[0]?.id).not.toBe('left');
         expect(copy.columns[1]?.blocks[0]?.id).not.toBe('right');
      }

      const ids = flattenBlocks(result).map((block) => block.id);
      expect(new Set(ids).size).toBe(ids.length);
   });

   it('uses a caller supplied id when duplicating', () => {
      const doc = documentOf([textBlock('a')]);
      const result = duplicateBlock(doc, 'a', 'a-copy');

      expect(result.children.map((block) => block.id)).toEqual(['a', 'a-copy']);
   });

   it('returns the same document when duplicating an unknown id', () => {
      const doc = documentOf([textBlock('a')]);
      expect(duplicateBlock(doc, 'missing')).toBe(doc);
   });

   it('appends a block by default and clamps out of range positions', () => {
      const doc = documentOf([textBlock('a')]);

      expect(insertBlock(doc, textBlock('b')).children.map((block) => block.id)).toEqual([
         'a',
         'b',
      ]);
      expect(insertBlock(doc, textBlock('b'), 99).children.map((block) => block.id)).toEqual([
         'a',
         'b',
      ]);
      expect(insertBlock(doc, textBlock('b'), -4).children.map((block) => block.id)).toEqual([
         'b',
         'a',
      ]);
   });

   it('removes top-level and column children by id', () => {
      const doc = documentOf([
         textBlock('a'),
         columnsBlock('cols', [
            { widthPercent: 50, blocks: [textBlock('b'), textBlock('c')] },
            { widthPercent: 50, blocks: [textBlock('d')] },
         ]),
      ]);

      const topLevel = removeBlock(doc, 'a');
      expect(topLevel.children.map((block) => block.id)).toEqual(['cols']);
      expect(doc.children).toHaveLength(2);

      const nested = removeBlock(doc, 'c');
      const cols = nested.children[1];
      expect(cols?.type).toBe('columns');
      if (cols?.type === 'columns') {
         expect(cols.columns[0]?.blocks.map((block) => block.id)).toEqual(['b']);
         expect(cols.columns[1]?.blocks.map((block) => block.id)).toEqual(['d']);
      }
      expect(flattenBlocks(doc).map((block) => block.id)).toContain('c');
   });

   it('returns the same document when removing an unknown id', () => {
      const doc = documentOf([textBlock('a')]);
      const result = removeBlock(doc, 'missing');

      expect(result).toBe(doc);
      expect(result).toEqual(doc);
   });

   it('moves blocks up and down and treats boundaries as no-ops', () => {
      const doc = documentOf([textBlock('a'), textBlock('b'), textBlock('c')]);

      expect(moveBlock(doc, 'b', -1).children.map((block) => block.id)).toEqual(['b', 'a', 'c']);
      expect(moveBlock(doc, 'b', 1).children.map((block) => block.id)).toEqual(['a', 'c', 'b']);
      expect(moveBlock(doc, 'a', -1)).toBe(doc);
      expect(moveBlock(doc, 'c', 1)).toBe(doc);
      expect(moveBlock(doc, 'missing', 1)).toBe(doc);
   });

   it('moves column children within their own column only', () => {
      const doc = documentOf([
         columnsBlock('cols', [
            { widthPercent: 50, blocks: [textBlock('a'), textBlock('b')] },
            { widthPercent: 50, blocks: [textBlock('c')] },
         ]),
      ]);

      const result = moveBlock(doc, 'b', -1);
      const cols = result.children[0];
      expect(cols?.type).toBe('columns');
      if (cols?.type === 'columns') {
         expect(cols.columns[0]?.blocks.map((block) => block.id)).toEqual(['b', 'a']);
         expect(cols.columns[1]?.blocks.map((block) => block.id)).toEqual(['c']);
      }

      expect(moveBlock(doc, 'c', -1).children).toEqual(doc.children);
   });

   it('updates top-level and nested blocks while preserving ids', () => {
      const doc = documentOf([
         headingBlock('h'),
         columnsBlock('cols', [{ widthPercent: 100, blocks: [textBlock('a')] }]),
      ]);

      const updated = updateBlock(doc, 'a', { text: 'Changed' });
      const nested = findBlock(updated, 'a');
      expect(nested?.type).toBe('text');
      if (nested?.type === 'text') expect(nested.text).toBe('Changed');
      expect(doc.children[1]).not.toBe(updated.children[1]);

      const attemptedIdChange = updateBlock(doc, 'h', {
         id: 'hacked',
         text: 'New',
      } as Partial<Block>);
      const heading = attemptedIdChange.children[0];
      expect(heading?.id).toBe('h');
      expect(heading?.type).toBe('heading');
      if (heading?.type === 'heading') expect(heading.text).toBe('New');
   });

   it('returns the same document when updating an unknown id', () => {
      const doc = documentOf([textBlock('a')]);
      expect(updateBlock(doc, 'missing', { text: 'x' })).toBe(doc);
   });

   it('updates settings without touching blocks', () => {
      const doc = documentOf([textBlock('a')]);
      const result = updateSettings(doc, { textColor: '#112233', fontFamily: 'GEORGIA' });

      expect(result.settings.textColor).toBe('#112233');
      expect(result.settings.fontFamily).toBe('GEORGIA');
      expect(result.children).toBe(doc.children);
      expect(doc.settings.textColor).not.toBe('#112233');
   });

   it('finds blocks by id and returns null for unknown ids', () => {
      const doc = documentOf([
         columnsBlock('cols', [{ widthPercent: 100, blocks: [textBlock('nested')] }]),
      ]);

      expect(findBlock(doc, 'cols')?.id).toBe('cols');
      expect(findBlock(doc, 'nested')?.id).toBe('nested');
      expect(findBlock(doc, 'missing')).toBeNull();
   });

   it('flattens blocks in visual order, including column children', () => {
      const doc = documentOf([
         headingBlock('a'),
         columnsBlock('cols', [
            { widthPercent: 50, blocks: [textBlock('b'), textBlock('c')] },
            { widthPercent: 50, blocks: [textBlock('d')] },
         ]),
         textBlock('e'),
      ]);

      expect(flattenBlocks(doc).map((block) => block.id)).toEqual([
         'a',
         'cols',
         'b',
         'c',
         'd',
         'e',
      ]);
   });

   it('labels every block type', () => {
      const labels = [
         blockLabel(headingBlock('h')),
         blockLabel(textBlock('t')),
         blockLabel({
            id: 'b',
            type: 'button',
            text: 'Go',
            href: 'https://example.com',
            align: 'left',
            backgroundColor: '#000000',
            textColor: '#ffffff',
            borderRadius: 6,
            fontSize: 16,
            fontWeight: 'bold',
            padding,
            innerPaddingX: 24,
            innerPaddingY: 12,
         }),
         blockLabel({
            id: 'i',
            type: 'image',
            src: 'https://example.com/a.png',
            alt: 'A',
            width: 100,
            align: 'center',
            padding,
         }),
         blockLabel({
            id: 'd',
            type: 'divider',
            color: '#000000',
            thickness: 1,
            widthPercent: 100,
            padding,
         }),
         blockLabel({ id: 's', type: 'spacer', height: 10 }),
         blockLabel(
            columnsBlock('c', [
               { widthPercent: 50, blocks: [] },
               { widthPercent: 50, blocks: [] },
            ]),
         ),
         blockLabel({
            id: 'so',
            type: 'social',
            links: [],
            align: 'center',
            iconSize: 24,
            padding,
         }),
      ];

      expect(labels).toEqual([
         'Heading 1',
         'Text',
         'Button',
         'Image',
         'Divider',
         'Spacer',
         'Columns (2)',
         'Social',
      ]);
   });
});

describe('normaliseColumns', () => {
   it('defaults two columns to 50/50', () => {
      const result = normaliseColumns([
         { widthPercent: 0, blocks: [] },
         { widthPercent: 0, blocks: [] },
      ]);

      expect(result.map((column) => column.widthPercent)).toEqual([50, 50]);
   });

   it('defaults three columns to 33/34/33', () => {
      const result = normaliseColumns([
         { widthPercent: 0, blocks: [] },
         { widthPercent: 0, blocks: [] },
         { widthPercent: 0, blocks: [] },
      ]);

      expect(result.map((column) => column.widthPercent)).toEqual([33, 34, 33]);
   });

   it('lets the remaining columns absorb a width edit and totals exactly 100', () => {
      const two = normaliseColumns([
         { widthPercent: 70, blocks: [] },
         { widthPercent: 50, blocks: [] },
      ]);
      expect(two.map((column) => column.widthPercent)).toEqual([70, 30]);

      const three = normaliseColumns([
         { widthPercent: 40, blocks: [] },
         { widthPercent: 20, blocks: [] },
         { widthPercent: 20, blocks: [] },
      ]);
      expect(three.map((column) => column.widthPercent)).toEqual([40, 30, 30]);
   });

   it('leaves widths that already total 100 unchanged', () => {
      const result = normaliseColumns([
         { widthPercent: 40, blocks: [] },
         { widthPercent: 20, blocks: [] },
         { widthPercent: 40, blocks: [] },
      ]);
      expect(result.map((column) => column.widthPercent)).toEqual([40, 20, 40]);
   });

   it('returns integer percentages that sum to 100', () => {
      const result = normaliseColumns([
         { widthPercent: 33.7, blocks: [] },
         { widthPercent: 33.3, blocks: [] },
         { widthPercent: 33, blocks: [] },
      ]);

      expect(result.every((column) => Number.isInteger(column.widthPercent))).toBe(true);
      expect(result.reduce((sum, column) => sum + column.widthPercent, 0)).toBe(100);
   });

   it('keeps blocks untouched while normalising widths', () => {
      const blocks = [textBlock('a')];
      const result = normaliseColumns([
         { widthPercent: 80, blocks },
         { widthPercent: 80, blocks: [] },
      ]);

      expect(result[0]?.blocks).toBe(blocks);
   });
});
