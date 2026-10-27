import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
   DEFAULT_SETTINGS,
   DocumentError,
   createBlock,
   createDocument,
   documentIssues,
   migrateDocument,
   parseDocument,
} from './index';
import type { Block } from './index';

const padding = { top: 0, right: 24, bottom: 16, left: 24 };

function documentOf(
   children: unknown[],
   extra: Record<string, unknown> = {},
): Record<string, unknown> {
   return {
      version: 1,
      settings: { ...DEFAULT_SETTINGS },
      children,
      ...extra,
   };
}

function textBlock(overrides: Record<string, unknown> = {}): Record<string, unknown> {
   return {
      id: 'text-1',
      type: 'text',
      text: 'Hello',
      align: 'left',
      fontSize: 16,
      lineHeight: 24,
      padding,
      ...overrides,
   };
}

describe('ir', () => {
   it('creates a valid starter document with one text block', () => {
      const doc = createDocument();
      expect(doc.version).toBe(1);
      expect(doc.children).toHaveLength(1);
      expect(doc.children[0]?.type).toBe('text');
      expect(parseDocument(doc)).toEqual(doc);
   });

   it('parses a full document and returns it unchanged', () => {
      const input = documentOf([textBlock()], { preheader: 'Preview text' });
      expect(parseDocument(input)).toEqual(input);
   });

   it('parses every render fixture', () => {
      const dir = join(process.cwd(), 'src', 'render', '__fixtures__');
      const names = readdirSync(dir).filter((name) => name.endsWith('.json'));
      expect(names.length).toBeGreaterThan(0);
      for (const name of names) {
         const fixture = JSON.parse(readFileSync(join(dir, name), 'utf8')) as unknown;
         expect(() => parseDocument(fixture), name).not.toThrow();
      }
   });

   it('rejects any version other than 1', () => {
      expect(() => parseDocument(documentOf([textBlock()], { version: 2 }))).toThrow(DocumentError);
   });

   it('rejects colours that are not six digit hex', () => {
      for (const color of ['rgb(0,0,0)', 'oklch(0.5 0.1 20)', 'red', '#fff', '#12345g']) {
         expect(() => parseDocument(documentOf([textBlock({ color })])), color).toThrow(
            DocumentError,
         );
      }
   });

   it('accepts https and mailto hrefs and rejects unsafe or relative ones', () => {
      const button = (href: string) => ({
         id: 'button-1',
         type: 'button',
         text: 'Go',
         href,
         align: 'left',
         backgroundColor: '#0f766e',
         textColor: '#ffffff',
         borderRadius: 6,
         fontSize: 16,
         fontWeight: 'bold',
         padding,
         innerPaddingX: 24,
         innerPaddingY: 12,
      });

      expect(() => parseDocument(documentOf([button('https://example.com/a?b=1')]))).not.toThrow();
      expect(() => parseDocument(documentOf([button('mailto:hi@example.com')]))).not.toThrow();

      for (const href of [
         'javascript:alert(1)',
         'data:text/html,hi',
         '//evil.example',
         '/relative',
         'http://example.com',
      ]) {
         expect(() => parseDocument(documentOf([button(href)])), href).toThrow(DocumentError);
      }
   });

   it('rejects empty and duplicate ids, including across columns', () => {
      expect(() => parseDocument(documentOf([textBlock({ id: '' })]))).toThrow(DocumentError);

      const columns = {
         id: 'columns-1',
         type: 'columns',
         columns: [
            { widthPercent: 50, blocks: [textBlock({ id: 'same' })] },
            { widthPercent: 50, blocks: [textBlock({ id: 'same' })] },
         ],
         padding,
      };
      expect(() => parseDocument(documentOf([columns]))).toThrow(DocumentError);
   });

   it('requires two or three columns whose widths sum to 100', () => {
      const columns = (widths: number[]) => ({
         id: 'columns-1',
         type: 'columns',
         columns: widths.map((widthPercent, index) => ({
            widthPercent,
            blocks: [textBlock({ id: `cell-${index}` })],
         })),
         padding,
      });

      expect(() => parseDocument(documentOf([columns([100])]))).toThrow(DocumentError);
      expect(() => parseDocument(documentOf([columns([50, 50])]))).not.toThrow();
      expect(() => parseDocument(documentOf([columns([33, 33, 34])]))).not.toThrow();
      expect(() => parseDocument(documentOf([columns([25, 25, 25, 25])]))).toThrow(DocumentError);
      expect(() => parseDocument(documentOf([columns([40, 50])]))).toThrow(DocumentError);
   });

   it('rejects nested columns', () => {
      const nested = {
         id: 'columns-1',
         type: 'columns',
         columns: [
            {
               widthPercent: 50,
               blocks: [
                  {
                     id: 'columns-2',
                     type: 'columns',
                     columns: [
                        { widthPercent: 50, blocks: [textBlock({ id: 'a' })] },
                        { widthPercent: 50, blocks: [textBlock({ id: 'b' })] },
                     ],
                     padding,
                  },
               ],
            },
            { widthPercent: 50, blocks: [textBlock({ id: 'c' })] },
         ],
         padding,
      };
      expect(() => parseDocument(documentOf([nested]))).toThrow(DocumentError);
   });

   it('enforces numeric bounds', () => {
      const cases: unknown[] = [
         textBlock({ padding: { top: 97, right: 0, bottom: 0, left: 0 } }),
         textBlock({ fontSize: 7 }),
         textBlock({ fontSize: 73 }),
         textBlock({ lineHeight: 7 }),
         textBlock({ lineHeight: 121 }),
         { id: 'spacer-1', type: 'spacer', height: 201 },
         {
            id: 'image-1',
            type: 'image',
            src: 'https://example.com/a.png',
            alt: 'a',
            width: 601,
            align: 'center',
            padding,
         },
         {
            id: 'divider-1',
            type: 'divider',
            color: '#e4e4e7',
            thickness: 1,
            widthPercent: 9,
            padding,
         },
         {
            id: 'social-1',
            type: 'social',
            links: [{ network: 'website', href: 'https://example.com' }],
            align: 'center',
            iconSize: 11,
            padding,
         },
         {
            id: 'button-1',
            type: 'button',
            text: 'Go',
            href: 'https://example.com',
            align: 'left',
            backgroundColor: '#0f766e',
            textColor: '#ffffff',
            borderRadius: 5,
            fontSize: 16,
            fontWeight: 'bold',
            padding,
            innerPaddingX: 24,
            innerPaddingY: 12,
         },
      ];

      for (const block of cases) {
         expect(() => parseDocument(documentOf([block])), JSON.stringify(block)).toThrow(
            DocumentError,
         );
      }
   });

   it('limits the preheader to 200 characters', () => {
      expect(() =>
         parseDocument(documentOf([textBlock()], { preheader: 'a'.repeat(201) })),
      ).toThrow(DocumentError);
      expect(() =>
         parseDocument(documentOf([textBlock()], { preheader: 'a'.repeat(200) })),
      ).not.toThrow();
   });

   it('rejects unknown keys anywhere in the document', () => {
      expect(() => parseDocument(documentOf([textBlock({ extra: true })]))).toThrow(DocumentError);
      expect(() => parseDocument({ ...documentOf([textBlock()]), extra: true })).toThrow(
         DocumentError,
      );
   });

   it('reports readable issues through DocumentError', () => {
      try {
         parseDocument(documentOf([textBlock({ fontSize: 7 })]));
         expect.unreachable();
      } catch (error) {
         expect(error).toBeInstanceOf(DocumentError);
         expect((error as DocumentError).issues.join('\n')).toContain('fontSize');
      }
   });

   it('reports issues without throwing', () => {
      expect(documentIssues(createDocument())).toEqual([]);
      expect(documentIssues({ nope: true }).length).toBeGreaterThan(0);
      expect(documentIssues(null).length).toBeGreaterThan(0);
   });

   it('migrates a v1 document and rejects unknown versions', () => {
      const doc = createDocument();
      expect(migrateDocument(doc)).toEqual(doc);
      expect(() => migrateDocument(documentOf([textBlock()], { version: 7 }))).toThrow(
         DocumentError,
      );
   });

   it('creates a valid block of every type with unique ids', () => {
      const types = [
         'heading',
         'text',
         'button',
         'image',
         'divider',
         'spacer',
         'columns',
         'social',
      ] as const;
      const blocks: Block[] = types.map((type) => createBlock(type));
      const ids = blocks.map((block) => block.id);
      expect(new Set(ids).size).toBe(types.length);
      for (const block of blocks) {
         expect(() => parseDocument(documentOf([block])), block.type).not.toThrow();
      }
      const columns = blocks.find((block) => block.type === 'columns');
      expect(columns?.type).toBe('columns');
      const nestedIds = JSON.stringify(columns).match(/"id":"[^"]+"/g) ?? [];
      expect(new Set(nestedIds).size).toBe(nestedIds.length);
   });
});
