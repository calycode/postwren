import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, createRepeatBlock, documentIssues, parseDocument } from './ir';
import { applyMergeTags } from './template';
import { renderEmail } from './render';

const padding = { top: 0, right: 24, bottom: 16, left: 24 };

function repeatDocument() {
   return parseDocument({
      version: 1,
      settings: { ...DEFAULT_SETTINGS },
      children: [
         {
            id: 'repeat-1',
            type: 'repeat',
            data: 'posts',
            alias: 'item',
            itemKey: 'slug',
            padding,
            sample: [{ slug: 'sample', title: 'Sample title', url: 'https://example.com/sample' }],
            children: [
               {
                  id: 'heading-1',
                  type: 'heading',
                  level: 2,
                  text: '{{ item.title }}',
                  align: 'left',
                  fontSize: 22,
                  lineHeight: 30,
                  padding,
               },
               {
                  id: 'text-1',
                  type: 'text',
                  text: '{{ itemIndex }} / {{ itemIndex1 }} / {{ item.published | date("YYYY-MM-DD") }}',
                  align: 'left',
                  fontSize: 16,
                  lineHeight: 24,
                  padding,
               },
               {
                  id: 'button-1',
                  type: 'button',
                  text: 'Read {{ itemIndex1 }}',
                  href: '{{ item.url }}',
                  align: 'left',
                  backgroundColor: '#0f766e',
                  textColor: '#ffffff',
                  borderRadius: 6,
                  fontSize: 16,
                  fontWeight: 'bold',
                  padding,
                  innerPaddingX: 24,
                  innerPaddingY: 12,
               },
            ],
         },
      ],
   });
}

const context = {
   subscriber: {
      id: 'sub-1',
      email: 'ada@example.com',
      first_name: 'Ada',
      last_name: null,
      tags: [],
      meta: {},
   },
   campaign: {
      id: 'cmp-1',
      subject: 'Weekly',
      utm_campaign: 'weekly',
      meta: {},
   },
   links: { unsubscribe: 'https://example.com/u/token' },
   data: {
      posts: [
         {
            slug: 'first',
            title: 'First post',
            url: 'https://example.com/first',
            published: '2026-10-01T12:00:00Z',
         },
         {
            slug: 'second',
            title: 'Second post',
            url: 'https://example.com/second',
            published: '2026-10-15T12:00:00Z',
         },
      ],
   },
};

describe('repeat blocks', () => {
   it('parses a repeat block and keeps its sample', () => {
      const doc = repeatDocument();
      expect(documentIssues(doc)).toEqual([]);
      const repeat = doc.children[0];
      expect(repeat?.type).toBe('repeat');
      if (repeat?.type === 'repeat') {
         expect(repeat.sample?.[0]?.title).toBe('Sample title');
      }
   });

   it('creates a valid repeat block from the library', () => {
      const repeat = createRepeatBlock();
      expect(repeat.type).toBe('repeat');
      expect(repeat.data).toBe('items');
      expect(repeat.children.length).toBeGreaterThan(0);
      expect(
         documentIssues({
            version: 1,
            settings: { ...DEFAULT_SETTINGS },
            children: [repeat],
         }),
      ).toEqual([]);
   });

   it('rejects a repeat inside a repeat', () => {
      const nested = repeatDocument();
      const repeat = nested.children[0];
      if (repeat?.type !== 'repeat') throw new Error('unexpected block shape');
      const inner = createRepeatBlock();
      expect(() =>
         parseDocument({
            ...nested,
            children: [{ ...repeat, children: [...repeat.children, inner] }],
         }),
      ).toThrow();
   });

   it('expands one item per object and rewrites ids with the item key', () => {
      const result = applyMergeTags(repeatDocument(), {
         ...context,
         preview: false,
         data: context.data,
      });

      expect(result.children).toHaveLength(6);
      expect(result.children[0]?.id).toBe('heading-1:first');
      expect(result.children[0]?.type === 'heading' && result.children[0].text).toBe('First post');
      expect(result.children[3]?.id).toBe('heading-1:second');
      expect(result.children[3]?.type === 'heading' && result.children[3].text).toBe('Second post');

      const indexText = result.children[1];
      expect(indexText?.type === 'text' && indexText.text).toBe('0 / 1 / 2026-10-01');
      const secondIndex = result.children[4];
      expect(secondIndex?.type === 'text' && secondIndex.text).toBe('1 / 2 / 2026-10-15');

      const firstButton = result.children[2];
      expect(firstButton?.type === 'button' && firstButton.href).toBe('https://example.com/first');
   });

   it('renders each item and keeps the template ids during preview', () => {
      const preview = applyMergeTags(repeatDocument(), {
         ...context,
         preview: true,
      });
      expect(preview.children).toHaveLength(6);
      expect(preview.children[0]?.id).toBe('heading-1');
      expect(preview.children[3]?.id).toBe('heading-1');

      const rendered = renderEmail(
         applyMergeTags(repeatDocument(), { ...context, preview: false }),
      );
      expect(rendered.html).toContain('First post');
      expect(rendered.html).toContain('Second post');
      expect(rendered.text).toContain('First post');
      expect(rendered.text).toContain('Second post');
   });

   it('uses sample items only in preview when real data is missing', () => {
      const preview = applyMergeTags(repeatDocument(), {
         ...context,
         data: {},
         preview: true,
      });
      expect(preview.children).toHaveLength(3);
      expect(preview.children[0]?.type === 'heading' && preview.children[0].text).toBe(
         'Sample title',
      );

      const send = applyMergeTags(repeatDocument(), {
         ...context,
         data: {},
         preview: false,
      });
      expect(send.children).toHaveLength(0);
   });

   it('falls back to the index when an item key is missing or duplicated', () => {
      const result = applyMergeTags(repeatDocument(), {
         ...context,
         preview: false,
         data: {
            posts: [
               { title: 'No key', url: 'https://example.com/a' },
               { slug: 'same', title: 'First same', url: 'https://example.com/b' },
               { slug: 'same', title: 'Second same', url: 'https://example.com/c' },
            ],
         },
      });

      expect(result.children.map((block) => block.id)).toEqual([
         'heading-1:#0',
         'text-1:#0',
         'button-1:#0',
         'heading-1:same',
         'text-1:same',
         'button-1:same',
         'heading-1:#2',
         'text-1:#2',
         'button-1:#2',
      ]);
   });
});
