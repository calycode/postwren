import { describe, expect, it } from 'vitest';
import type { Document } from '@mailer/email/ir';
import { defaultSettings, parseDocument } from '@mailer/email/ir';
import { flattenBlocks } from './document-ops';
import { BLOCK_PATTERNS } from './patterns';

function documentOf(children: Document['children']): Document {
   return {
      version: 1,
      settings: defaultSettings(),
      children,
   };
}

describe('BLOCK_PATTERNS', () => {
   it('exposes four named patterns', () => {
      expect(BLOCK_PATTERNS.map((pattern) => pattern.id)).toEqual([
         'feature',
         'stats',
         'testimonial',
         'article',
      ]);
   });

   describe.each(BLOCK_PATTERNS.map((pattern) => [pattern.label, pattern] as const))(
      '%s pattern',
      (_label, pattern) => {
         it('parses through parseDocument', () => {
            const doc = documentOf(pattern.build());
            expect(() => parseDocument(doc)).not.toThrow();
         });

         it('builds blocks with unique ids, including nested children', () => {
            const doc = documentOf(pattern.build());
            const ids = flattenBlocks(doc).map((block) => block.id);

            expect(ids.length).toBeGreaterThan(0);
            expect(new Set(ids).size).toBe(ids.length);
         });

         it('builds fresh ids on every call', () => {
            const first = flattenBlocks(documentOf(pattern.build())).map((block) => block.id);
            const second = flattenBlocks(documentOf(pattern.build())).map((block) => block.id);

            expect(first.some((id) => second.includes(id))).toBe(false);
         });
      },
   );

   it('builds three stat columns of two blocks each', () => {
      const stats = BLOCK_PATTERNS.find((pattern) => pattern.id === 'stats');
      if (!stats) throw new Error('missing stats pattern');

      const [columns] = stats.build();
      expect(columns?.type).toBe('columns');
      if (columns?.type === 'columns') {
         expect(columns.columns).toHaveLength(3);
         expect(columns.columns.every((column) => column.blocks.length === 2)).toBe(true);
         expect(columns.columns.reduce((sum, column) => sum + column.widthPercent, 0)).toBe(100);
      }
   });
});
