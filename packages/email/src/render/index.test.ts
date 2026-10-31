import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { parseDocument } from '../ir/index';
import type { Block, Document, ImageBlock, TextBlock, ButtonBlock } from '../ir/index';
import { GMAIL_CLIP_BYTES, renderEmail } from './index';
import type { RenderResult } from './index';

const fixturesDir = join(process.cwd(), 'src', 'render', '__fixtures__');

function fixture(name: string): Document {
   return parseDocument(
      JSON.parse(readFileSync(join(fixturesDir, `${name}.json`), 'utf8')) as unknown,
   );
}

function allFixtures(): Array<[string, Document]> {
   return readdirSync(fixturesDir)
      .filter((name) => name.endsWith('.json'))
      .map((name) => [name.replace(/\.json$/, ''), fixture(name.replace(/\.json$/, ''))]);
}

function stripConditionals(html: string): string {
   return html.replace(/<!--\[if mso\]>[\s\S]*?<!\[endif\]-->/g, '');
}

function openingTags(html: string): string[] {
   return html.match(/<[a-zA-Z][a-zA-Z0-9:-]*\b[^>]*>/g) ?? [];
}

function tagName(tag: string): string {
   return /^<([a-zA-Z][a-zA-Z0-9:-]*)/.exec(tag)?.[1] ?? '';
}

function attributeValue(tag: string, name: string): string | undefined {
   return new RegExp(`\\b${name}="([^"]*)"`).exec(tag)?.[1];
}

const ALLOWED = new Set([
   'table',
   'tbody',
   'tr',
   'td',
   'a',
   'img',
   'span',
   'strong',
   'em',
   'br',
   'h1',
   'h2',
   'h3',
   'code',
   'html',
   'head',
   'body',
   'meta',
   'title',
   'style',
]);

const FORBIDDEN = [
   'div',
   'p',
   'section',
   'article',
   'header',
   'footer',
   'nav',
   'main',
   'ul',
   'ol',
   'li',
   'form',
   'input',
   'button',
   'svg',
   'video',
   'canvas',
   'iframe',
   'script',
   'link',
];

const BANNED_STYLES = [
   'flex',
   'grid',
   'position:',
   'box-shadow',
   'transform',
   'oklch',
   'rgb(',
   'hsl(',
   'var(',
];

function collectBlockIds(blocks: Block[]): string[] {
   const ids: string[] = [];
   for (const block of blocks) {
      ids.push(block.id);
      if (block.type === 'columns') {
         for (const column of block.columns) {
            ids.push(...collectBlockIds(column.blocks));
         }
      } else if (block.type === 'section') {
         ids.push(...collectBlockIds(block.children));
      }
   }
   return ids;
}

function codes(result: RenderResult): string[] {
   return result.warnings.map((warning) => warning.code);
}

describe('renderEmail', () => {
   describe.each(allFixtures())('invariants for %s', (_name, document) => {
      const html = renderEmail(document).html;
      const stripped = stripConditionals(html);
      const tags = openingTags(stripped);

      it('uses only the allowed element names', () => {
         const found = new Set(tags.map(tagName));
         for (const tag of found) {
            expect(ALLOWED.has(tag), `unexpected element <${tag}>`).toBe(true);
         }
      });

      it('never emits a forbidden element', () => {
         const found = new Set(tags.map(tagName));
         for (const forbidden of FORBIDDEN) {
            expect(found.has(forbidden), `forbidden element <${forbidden}>`).toBe(false);
         }
      });

      it('gives every table the presentation attributes', () => {
         for (const tag of tags.filter((candidate) => tagName(candidate) === 'table')) {
            expect(tag).toContain('role="presentation"');
            expect(tag).toContain('cellpadding="0"');
            expect(tag).toContain('cellspacing="0"');
            expect(tag).toContain('border="0"');
         }
      });

      it('inlines font styles on every non-spacer cell', () => {
         for (const tag of tags.filter((candidate) => tagName(candidate) === 'td')) {
            const style = attributeValue(tag, 'style') ?? '';
            if (style.includes('font-size:1px;line-height:1px')) continue;
            expect(style, tag).toContain('font-family:');
            expect(style, tag).toContain('font-size:');
            expect(style, tag).toContain('line-height:');
            expect(style, tag).toContain('color:');
         }
      });

      it('never uses a banned inline style', () => {
         const styles = [...stripped.matchAll(/style="([^"]*)"/g)].map((match) => match[1] ?? '');
         for (const style of styles) {
            for (const banned of BANNED_STYLES) {
               expect(style.toLowerCase(), `banned "${banned}" in ${style}`).not.toContain(banned);
            }
         }
      });

      it('allows max-width only on the fluid root content table', () => {
         const withMaxWidth = tags.filter((tag) =>
            (attributeValue(tag, 'style') ?? '').toLowerCase().includes('max-width'),
         );
         expect(withMaxWidth).toHaveLength(1);

         const [root] = withMaxWidth;
         expect(tagName(root ?? '')).toBe('table');
         const style = attributeValue(root ?? '', 'style') ?? '';
         expect(style).toContain('width:100%');
         expect(style).toContain('max-width:600px');
         expect(attributeValue(root ?? '', 'bgcolor')).toBeDefined();
      });

      it('gives every image its accessible presentation attributes', () => {
         const images = tags.filter((tag) => tagName(tag) === 'img');
         for (const tag of images) {
            expect(attributeValue(tag, 'alt')).toBeDefined();
            expect(attributeValue(tag, 'width')).toBeDefined();
            expect(attributeValue(tag, 'border')).toBe('0');
            const style = attributeValue(tag, 'style') ?? '';
            const height = attributeValue(tag, 'height');
            expect(style).toContain('display:block');
            if (height === undefined) {
               expect(style).toContain('height:auto');
            } else {
               expect(style).toContain(`height:${height}px`);
            }
            expect(style).toContain('-ms-interpolation-mode:bicubic');
         }
      });

      it('only emits absolute https or mailto links', () => {
         const anchors = tags.filter((tag) => tagName(tag) === 'a');
         for (const tag of anchors) {
            const href = attributeValue(tag, 'href') ?? '';
            expect(/^https:\/\//.test(href) || /^mailto:/.test(href), href).toBe(true);
         }
      });

      it('wraps the fixed width content table in a ghost table', () => {
         expect(html).toMatch(
            /<!--\[if mso\]>[\s\S]*?<table[\s\S]*?width="600"[\s\S]*?<!\[endif\]-->/,
         );
      });

      it('builds the full width backdrop with a centred 600px content table', () => {
         expect(html).toMatch(
            /<table[^>]*width="100%"[^>]*bgcolor="#[0-9a-fA-F]{6}"[^>]*background-color:#[0-9a-fA-F]{6}/,
         );
         expect(html).toMatch(/<table[^>]*width="600"[^>]*align="center"/);
      });

      it('includes the required head metadata and one style block', () => {
         expect(html).toMatch(/<meta charset="utf-8">/);
         expect(html).toContain('name="viewport"');
         expect(html).toContain('x-apple-disable-message-reformatting');
         expect(html).toContain('name="format-detection"');
         expect(html).toContain('name="color-scheme"');
         expect(html).toMatch(/<title>.*<\/title>/);
         expect(html.match(/<style>/g)).toHaveLength(1);
         expect(html).toContain('mso-table-lspace');
         expect(html).toContain('mso-table-rspace');
         expect(html).toContain('@media (max-width:599px)');
         expect(html).toContain('.stack');
         expect(html).toContain('.px');
      });
   });

   describe.each([
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
      'markdown',
      'composed',
   ])('golden output for %s', (name) => {
      it('matches the snapshot', () => {
         expect(renderEmail(fixture(name)).html).toMatchSnapshot();
      });
   });

   it('is deterministic', () => {
      const document = fixture('composed');
      const first = renderEmail(document);
      const second = renderEmail(document);
      expect(first.html).toBe(second.html);
      expect(first.text).toBe(second.text);
      expect(first.bytes).toBe(second.bytes);
      expect(first.warnings).toEqual(second.warnings);
   });

   it('counts UTF-8 bytes of the html', () => {
      const result = renderEmail(fixture('composed'));
      expect(result.bytes).toBe(new TextEncoder().encode(result.html).length);
   });

   it('renders plain text with links, buttons, images and flattened columns', () => {
      const result = renderEmail(fixture('composed'), {
         unsubscribeUrl: 'https://example.com/unsubscribe',
      });

      expect(result.text).toContain('A composed message');
      expect(result.text).toContain('Read more in our notes (https://example.com/notes).');
      expect(result.text).toContain('Open the notes: https://example.com/open');
      expect(result.text).toContain('[image: Cover]');
      expect(result.text).toContain('First column');
      expect(result.text).toContain('Second column');
      expect(result.text).toContain('x: https://x.com/example');
      expect(result.text).toContain('linkedin: https://linkedin.com/company/example');
      expect(result.text).toContain('Unsubscribe: https://example.com/unsubscribe');
      expect(result.text).not.toContain('**');
      expect(result.text).not.toContain('](');
   });

   it('escapes inline html except for the supported markup', () => {
      const document = fixture('text');
      const block = document.children[0] as TextBlock;
      block.text = '<script>alert(1)</script> **bold** *italic* [link](https://example.com/x)';
      const html = renderEmail(document).html;
      expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
      expect(html).toContain('<strong>bold</strong>');
      expect(html).toContain('<em>italic</em>');
      expect(html).toContain('<a href="https://example.com/x"');
      expect(html).not.toContain('<script>');
   });

   it('resolves every emitted link with its block id', () => {
      const document = fixture('composed');
      for (const block of document.children) {
         if (block.type === 'image') block.href = 'https://example.com/image-target';
      }
      const calls: Array<[string, string]> = [];
      const result = renderEmail(document, {
         resolveLink: (href, linkId) => {
            calls.push([href, linkId]);
            return `https://track.example/${linkId}?u=${encodeURIComponent(href)}`;
         },
      });

      expect(calls).toHaveLength(5);
      expect(calls.map(([, id]) => id)).toEqual([
         'composed-text',
         'composed-button',
         'composed-image',
         'composed-social',
         'composed-social',
      ]);

      const anchors = (stripConditionals(result.html).match(/<a\b[^>]*>/g) ?? []).map(
         (tag) => attributeValue(tag, 'href') ?? '',
      );
      expect(anchors).toHaveLength(5);
      for (const href of anchors) {
         expect(href.startsWith('https://track.example/')).toBe(true);
      }
   });

   it('resolves the unsubscribe footer link too', () => {
      const resolveLink = vi.fn(
         (href: string, linkId: string) => `https://track.example/${linkId}`,
      );
      const result = renderEmail(fixture('heading'), {
         unsubscribeUrl: 'https://example.com/u',
         resolveLink,
      });
      expect(resolveLink).toHaveBeenCalledWith('https://example.com/u', 'unsubscribe');
      expect(result.html).toContain('https://track.example/unsubscribe');
   });

   it('adds VML and hides the html button only when the radius is positive', () => {
      const rounded = fixture('button');
      expect(renderEmail(rounded).html).toContain('<v:roundrect');
      expect(renderEmail(rounded).html).toContain('mso-hide:all');

      const square = fixture('button');
      (square.children[0] as ButtonBlock).borderRadius = 0;
      const html = renderEmail(square).html;
      expect(html).not.toContain('<v:roundrect');
      expect(html).not.toContain('mso-hide:all');
   });

   it('renders the preheader hidden and lets options override it', () => {
      const html = renderEmail(fixture('composed'), { preheader: 'Overridden preview' }).html;
      expect(html).toContain('mso-hide:all');
      expect(html).toContain('Overridden preview');
      expect(html).not.toContain('Everything in one message');
      expect(html).toContain('&#8203;');
   });

   it('renders a spacer with the legacy-safe cell markup', () => {
      const html = renderEmail(fixture('spacer')).html;
      expect(html).toContain(
         '<td height="32" style="font-size:1px;line-height:1px;mso-line-height-rule:exactly;">&nbsp;</td>',
      );
   });

   it('renders a divider as a filled table row', () => {
      const html = renderEmail(fixture('divider')).html;
      expect(html).toContain('bgcolor="#e4e4e7"');
      expect(html).toContain('width="80%"');
      expect(html).not.toContain('border-top');
   });

   it('stacks column cells', () => {
      const html = renderEmail(fixture('columns')).html;
      expect(html).toContain('class="stack"');
      expect(html).toContain('width="50%"');
   });

   it('makes the root table fluid at the mobile breakpoint and keeps the MSO ghost at 600', () => {
      const html = renderEmail(fixture('composed')).html;
      const tags = openingTags(stripConditionals(html));
      const root = tags.find(
         (tag) => tagName(tag) === 'table' && attributeValue(tag, 'bgcolor') === '#ffffff',
      );

      expect(root).toBeDefined();
      expect(attributeValue(root ?? '', 'width')).toBe('100%');
      const style = attributeValue(root ?? '', 'style') ?? '';
      expect(style).toContain('width:100%');
      expect(style).toContain('max-width:600px');

      expect(html).toMatch(
         /<!--\[if mso\]>[\s\S]*?<table[^>]*width="600"[^>]*>[\s\S]*?<!\[endif\]-->/,
      );
      expect(html).toContain('.stack{display:block!important;width:100%!important;}');

      const maxWidthTags = [...html.matchAll(/<[a-zA-Z][^>]*\bmax-width[^>]*>/g)];
      expect(maxWidthTags).toHaveLength(1);
   });

   it('annotates every block exactly once when asked', () => {
      const document = fixture('composed');
      const expected = collectBlockIds(document.children).sort();

      const annotated = renderEmail(document, { annotateBlocks: true }).html;
      const found = [...annotated.matchAll(/data-block-id="([^"]+)"/g)]
         .map((match) => match[1] ?? '')
         .sort();

      expect(found).toEqual(expected);
      expect(new Set(found).size).toBe(expected.length);

      const plain = renderEmail(document).html;
      expect(plain).not.toContain('data-block-id');
   });

   it('renders the unsubscribe footer link exactly once', () => {
      const html = renderEmail(fixture('composed'), {
         unsubscribeUrl: 'https://example.com/unsubscribe',
      }).html;
      const footerLinks = [
         ...stripConditionals(html).matchAll(
            /<a href="https:\/\/example\.com\/unsubscribe"[^>]*>Unsubscribe<\/a>/g,
         ),
      ];

      expect(footerLinks).toHaveLength(1);
   });

   it('warns when an image has no alt text', () => {
      const document = fixture('image');
      (document.children[0] as ImageBlock).alt = '';
      expect(codes(renderEmail(document))).toContain('image_missing_alt');
   });

   it('warns when an image is wider than the content width', () => {
      const document = fixture('image');
      (document.children[0] as ImageBlock).width = 601;
      expect(codes(renderEmail(document))).toContain('image_width_mismatch');
   });

   it('warns when the message exceeds the Gmail clip', () => {
      const document = fixture('text');
      (document.children[0] as TextBlock).text = 'a'.repeat(GMAIL_CLIP_BYTES + 1);
      const result = renderEmail(document);
      expect(result.bytes).toBeGreaterThan(GMAIL_CLIP_BYTES);
      expect(codes(result)).toContain('message_too_large');
   });

   it('warns on low contrast text', () => {
      const document = fixture('text');
      (document.children[0] as TextBlock).color = '#ffffff';
      const result = renderEmail(document);
      expect(codes(result)).toContain('low_contrast');
      expect(result.warnings.find((warning) => warning.code === 'low_contrast')?.blockId).toBe(
         'text-1',
      );
   });

   it('warns when there are too many links', () => {
      const document = fixture('text');
      (document.children[0] as TextBlock).text = Array.from(
         { length: 51 },
         (_, index) => `[link ${index}](https://example.com/${index})`,
      ).join(' ');
      expect(codes(renderEmail(document))).toContain('too_many_links');
   });

   it('warns when no unsubscribe path exists', () => {
      expect(codes(renderEmail(fixture('heading')))).toContain('unsubscribe_missing');
      expect(
         codes(renderEmail(fixture('heading'), { unsubscribeUrl: 'https://example.com/u' })),
      ).not.toContain('unsubscribe_missing');

      const withTag = fixture('text');
      (withTag.children[0] as TextBlock).text = 'Unsubscribe at {{ links.unsubscribe }}';
      expect(codes(renderEmail(withTag))).not.toContain('unsubscribe_missing');
   });

   it('warns on an empty document', () => {
      const document = fixture('heading');
      document.children = [];
      expect(codes(renderEmail(document))).toContain('empty_document');
   });
});

describe('extended blocks', () => {
   it('renders an unordered list with a marker per item and keeps inline links', () => {
      const html = renderEmail(fixture('list')).html;

      expect(html.match(/•/g)).toHaveLength(3);
      expect(html).toContain('https://example.com/story');
   });

   it('numbers an ordered list', () => {
      const doc = fixture('list');
      const list = doc.children[0];
      if (list?.type !== 'list') throw new Error('unexpected fixture shape');

      const html = renderEmail({ ...doc, children: [{ ...list, ordered: true }] }).html;

      expect(html).toContain('>1.<');
      expect(html).toContain('>3.<');
   });

   it('renders a quote bar and attribution', () => {
      const html = renderEmail(fixture('quote')).html;

      expect(html).toContain('width="3"');
      expect(html).toContain('— Someone Wise');
   });

   it('renders code in a monospace stack, keeps line breaks and escapes markup', () => {
      const doc = fixture('code');
      const block = doc.children[0];
      if (block?.type !== 'code') throw new Error('unexpected fixture shape');

      const html = renderEmail({
         ...doc,
         children: [{ ...block, text: '<script>alert(1)</script>' }],
      }).html;

      expect(html).toContain("'Courier New'");
      expect(html).toContain('&lt;script&gt;');
      expect(html).not.toContain('<script>');
      expect(renderEmail(fixture('code')).html).toContain('OTP-4821<br>Expires in 10 minutes');
   });

   it('routes a link block through resolveLink with the block id', () => {
      const calls: Array<[string, string]> = [];

      const html = renderEmail(fixture('link'), {
         resolveLink: (href, id) => {
            calls.push([href, id]);
            return `https://track.test/${id}`;
         },
      }).html;

      expect(calls).toEqual([['https://example.com/more', 'link-1']]);
      expect(html).toContain('https://track.test/link-1');
   });

   it('stacks columns only below the content width', () => {
      const html = renderEmail(fixture('columns')).html;

      expect(html).toContain('@media (max-width:599px)');
      expect(html).toContain('.stack{display:block!important;width:100%!important;}');
   });
});

describe('new blocks', () => {
   it('renders a section as a bordered nested table with annotated children', () => {
      const doc = fixture('section');
      const html = renderEmail(doc, { annotateBlocks: true }).html;

      expect(html).toContain('bgcolor="#f9fafb"');
      expect(html).toContain('border:2px solid #e4e4e7');
      expect(html).toContain('data-block-id="section-1-text"');
      expect(html).toContain('data-block-id="section-1"');
   });

   it('omits the section border declaration when the width is zero', () => {
      const doc = fixture('section');
      const section = doc.children[0];
      if (section?.type !== 'section') throw new Error('unexpected fixture shape');

      const html = renderEmail({
         ...doc,
         children: [{ ...section, borderWidth: 0 }],
      }).html;

      expect(html).not.toContain('border:0px');
      expect(html).not.toContain('border:2px solid');
   });

   it('rounds the avatar radius per shape and keeps square dimensions', () => {
      const doc = fixture('avatar');
      const avatar = doc.children[0];
      if (avatar?.type !== 'avatar') throw new Error('unexpected fixture shape');

      const circle = renderEmail(doc).html;
      expect(circle).toContain('width="64"');
      expect(circle).toContain('height="64"');
      expect(circle).toContain('border-radius:50%');

      const rounded = renderEmail({
         ...doc,
         children: [{ ...avatar, shape: 'rounded' }],
      }).html;
      expect(rounded).toContain('border-radius:8px');
      expect(rounded).not.toContain('border-radius:50%');
   });

   it('renders one gallery cell per image with even widths and trailing gaps', () => {
      const html = renderEmail(fixture('gallery')).html;
      const cells = html.match(/<td class="stack"[^>]*>/g) ?? [];

      expect(cells).toHaveLength(2);
      expect(cells[0]).toContain('width="50%"');
      expect(cells[1]).toContain('width="50%"');
      expect(cells[0]).toContain('padding-right:8px');
      expect(cells[1]).not.toContain('padding-right');
      expect(html).toContain('https://example.com/gallery/second');
   });

   it('parses table headers and trims cells around pipes', () => {
      const doc = fixture('table');
      const table = doc.children[0];
      if (table?.type !== 'table') throw new Error('unexpected fixture shape');

      const html = renderEmail({
         ...doc,
         children: [
            {
               ...table,
               rows: '  Starter  |  $9  | 1\n\n Pro | $29 | 5 ',
            },
         ],
      }).html;

      expect(html).toContain('>Plan</td>');
      expect(html).toContain('>Starter</td>');
      expect(html).toContain('>$9</td>');
      expect(html).toContain('>Pro</td>');
      expect(html).toContain('font-weight:bold');
   });

   it('keeps inline links inside table cells and routes them through resolveLink', () => {
      const doc = fixture('table');
      const table = doc.children[0];
      if (table?.type !== 'table') throw new Error('unexpected fixture shape');

      const calls: Array<[string, string]> = [];
      const html = renderEmail(
         {
            ...doc,
            children: [{ ...table, header: '', rows: 'Docs | [Guide](https://example.com/guide)' }],
         },
         {
            resolveLink: (href, id) => {
               calls.push([href, id]);
               return `https://track.test/${id}`;
            },
         },
      ).html;

      expect(calls).toEqual([['https://example.com/guide', 'table-1']]);
      expect(html).toContain('https://track.test/table-1');
   });

   it('renders inline code in a text block and strips backticks from plain text', () => {
      const doc = fixture('text');
      const block = doc.children[0];
      if (block?.type !== 'text') throw new Error('unexpected fixture shape');

      const result = renderEmail({
         ...doc,
         children: [{ ...block, text: 'Run `pnpm test` first.' }],
      });

      expect(result.html).toContain('<code style=');
      expect(result.html).toContain('>pnpm test</code>');
      expect(result.text).toContain('Run pnpm test first.');
      expect(result.text).not.toContain('`');
   });

   it('leaves an unmatched backtick as literal text', () => {
      const doc = fixture('text');
      const block = doc.children[0];
      if (block?.type !== 'text') throw new Error('unexpected fixture shape');

      const result = renderEmail({
         ...doc,
         children: [{ ...block, text: 'A stray `tick stays' }],
      });

      expect(result.html).toContain('A stray `tick stays');
      expect(result.html).not.toContain('<code');
      expect(result.text).toContain('A stray `tick stays');
   });

   it('renders markdown headings, lists, quotes, code and dividers', () => {
      const result = renderEmail(fixture('markdown'));

      expect(result.html).toContain('<h2');
      expect(result.html).toContain('<h3');
      expect(result.html).toContain('>•<');
      expect(result.html).toContain('>1.<');
      expect(result.html).toContain('width="3"');
      expect(result.html).toContain("'Courier New'");
      expect(result.html).toContain('background-color:#e4e4e7');
      expect(result.html).toContain('<strong>bold</strong>');
      expect(result.html).toContain('<code style=');
      expect(result.text).toContain('Hello, this is my email template');
      expect(result.text).toContain('- First item');
      expect(result.text).toContain('1. One');
      expect(result.text).toContain('> A quote worth repeating.');
      expect(result.text).toContain('await resend.emails.send({});');
      expect(result.text).not.toContain('##');
   });

   it('keeps an empty markdown block selectable in the editor', () => {
      const document = fixture('markdown');
      const block = document.children[0];
      if (block?.type !== 'markdown') throw new Error('unexpected fixture shape');
      block.text = '   ';

      const html = renderEmail(document, { annotateBlocks: true }).html;

      expect(html).toContain('data-block-id="markdown-1"');
      expect(html).toContain('&nbsp;');
   });

   it('escapes raw html in markdown and routes links through resolveLink', () => {
      const document = fixture('markdown');
      const block = document.children[0];
      if (block?.type !== 'markdown') throw new Error('unexpected fixture shape');

      const calls: Array<[string, string]> = [];
      const result = renderEmail(
         {
            ...document,
            children: [
               {
                  ...block,
                  text: 'A <script>alert(1)</script> paragraph with [a link](https://example.com/x).',
               },
            ],
         },
         {
            resolveLink: (href, id) => {
               calls.push([href, id]);
               return `https://track.test/${id}`;
            },
         },
      );

      expect(result.html).toContain('&lt;script&gt;');
      expect(result.html).not.toContain('<script>');
      expect(result.html).toContain('https://track.test/markdown-1');
      expect(calls).toEqual([['https://example.com/x', 'markdown-1']]);
   });
});
