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

   it('accepts https image sources and locally served http media', () => {
      const image = (src: string) => ({
         id: 'image-1',
         type: 'image',
         src,
         alt: 'Preview',
         width: 600,
         align: 'center',
         padding,
      });

      const local = image('http://localhost:8787/media/photo.png');
      expect(parseDocument(documentOf([local]))).toEqual(documentOf([local]));
      expect(() =>
         parseDocument(documentOf([image('http://127.0.0.1:8787/media/photo.png')])),
      ).not.toThrow();
      expect(() =>
         parseDocument(documentOf([image('https://cdn.example.com/photo.png')])),
      ).not.toThrow();
      expect(() => parseDocument(documentOf([image('http://example.com/photo.png')]))).toThrow(
         DocumentError,
      );
      expect(() => parseDocument(documentOf([image('/media/photo.png')]))).toThrow(DocumentError);
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
         'avatar',
         'gallery',
         'table',
         'section',
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

describe('new block schemas', () => {
   const section = (children: unknown[], overrides: Record<string, unknown> = {}) => ({
      id: 'section-1',
      type: 'section',
      backgroundColor: '#ffffff',
      borderColor: '#e4e4e7',
      borderWidth: 1,
      borderRadius: 8,
      padding,
      innerPadding: padding,
      children,
      ...overrides,
   });

   const avatar = (size: number) => ({
      id: 'avatar-1',
      type: 'avatar',
      src: 'https://example.com/avatar.png',
      alt: 'Avatar',
      size,
      shape: 'circle',
      align: 'center',
      padding,
   });

   const gallery = (count: number) => ({
      id: 'gallery-1',
      type: 'gallery',
      images: Array.from({ length: count }, (_, index) => ({
         src: `https://example.com/${index}.png`,
         alt: `Image ${index}`,
      })),
      gap: 8,
      padding,
   });

   const table = (header: string, rows: string, overrides: Record<string, unknown> = {}) => ({
      id: 'table-1',
      type: 'table',
      header,
      rows,
      headerBackgroundColor: '#f4f4f5',
      borderColor: '#e4e4e7',
      textColor: '#18181b',
      fontSize: 14,
      lineHeight: 20,
      cellPadding: 8,
      padding,
      ...overrides,
   });

   it('accepts leaf children and rejects nested sections or columns', () => {
      expect(() => parseDocument(documentOf([section([textBlock()])]))).not.toThrow();
      expect(() =>
         parseDocument(documentOf([section([section([textBlock({ id: 'inner' })])])])),
      ).toThrow(DocumentError);
      expect(() =>
         parseDocument(
            documentOf([
               section([
                  {
                     id: 'columns-2',
                     type: 'columns',
                     columns: [
                        { widthPercent: 50, blocks: [textBlock({ id: 'a' })] },
                        { widthPercent: 50, blocks: [textBlock({ id: 'b' })] },
                     ],
                     padding,
                  },
               ]),
            ]),
         ),
      ).toThrow(DocumentError);
      expect(() =>
         parseDocument(
            documentOf([
               section(
                  Array.from({ length: 21 }, (_, index) => textBlock({ id: `child-${index}` })),
               ),
            ]),
         ),
      ).toThrow(DocumentError);
   });

   it('counts section children when detecting duplicate ids', () => {
      expect(() =>
         parseDocument(documentOf([section([textBlock({ id: 'same' })], { id: 'same' })])),
      ).toThrow(DocumentError);
   });

   it('bounds the avatar size to 24..96', () => {
      expect(() => parseDocument(documentOf([avatar(24)]))).not.toThrow();
      expect(() => parseDocument(documentOf([avatar(96)]))).not.toThrow();
      expect(() => parseDocument(documentOf([avatar(23)]))).toThrow(DocumentError);
      expect(() => parseDocument(documentOf([avatar(97)]))).toThrow(DocumentError);
   });

   it('requires two to four gallery images', () => {
      expect(() => parseDocument(documentOf([gallery(1)]))).toThrow(DocumentError);
      expect(() => parseDocument(documentOf([gallery(2)]))).not.toThrow();
      expect(() => parseDocument(documentOf([gallery(4)]))).not.toThrow();
      expect(() => parseDocument(documentOf([gallery(5)]))).toThrow(DocumentError);
   });

   it('caps the table at 50 rows and 20 header cells', () => {
      expect(() => parseDocument(documentOf([table('', 'a | b')]))).not.toThrow();
      expect(() => parseDocument(documentOf([table('A | B', 'a | b')]))).not.toThrow();

      const twentyCells = Array.from({ length: 20 }, () => 'a').join(' | ');
      const twentyOneCells = Array.from({ length: 21 }, () => 'a').join(' | ');
      expect(() => parseDocument(documentOf([table(twentyCells, 'a')]))).not.toThrow();
      expect(() => parseDocument(documentOf([table(twentyOneCells, 'a')]))).toThrow(DocumentError);

      const fiftyRows = Array.from({ length: 50 }, () => 'a | b').join('\n');
      const fiftyOneRows = Array.from({ length: 51 }, () => 'a | b').join('\n');
      expect(() => parseDocument(documentOf([table('', fiftyRows)]))).not.toThrow();
      expect(() => parseDocument(documentOf([table('', fiftyOneRows)]))).toThrow(DocumentError);
   });

   it('bounds table cell padding', () => {
      expect(() => parseDocument(documentOf([table('', 'a', { cellPadding: 4 })]))).not.toThrow();
      expect(() => parseDocument(documentOf([table('', 'a', { cellPadding: 24 })]))).not.toThrow();
      expect(() => parseDocument(documentOf([table('', 'a', { cellPadding: 3 })]))).toThrow(
         DocumentError,
      );
      expect(() => parseDocument(documentOf([table('', 'a', { cellPadding: 25 })]))).toThrow(
         DocumentError,
      );
   });
});
