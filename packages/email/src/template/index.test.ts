import { describe, expect, it } from 'vitest';
import { createBlock, createDocument, parseDocument } from '../ir/index';
import type { ButtonBlock, Document, ImageBlock, TextBlock } from '../ir/index';
import { applyMergeTags, findMergeTags, validateTemplate } from './index';
import type { MergeContext } from './index';

const context: MergeContext = {
   subscriber: {
      id: 'sub-1',
      email: 'ada@example.com',
      first_name: '<script>Ada</script>',
      last_name: null,
      tags: ['vip', 'beta'],
      meta: {
         plan: 'Pro',
         signup_date: '1717242600',
         note: '<b>VIP</b>',
         referral_url: 'https://example.com/?a=1&b=2',
      },
   },
   campaign: {
      id: 'camp-1',
      subject: 'Spring news',
      utm_campaign: 'spring',
      meta: { edition: 'spring' },
   },
   links: {
      unsubscribe: 'https://example.com/u?token=abc&x=1',
      web: 'https://example.com/p/camp-1',
   },
};

const padding = { top: 0, right: 24, bottom: 16, left: 24 };

function documentWith(overrides: {
   heading?: string;
   text?: string;
   buttonText?: string;
   buttonHref?: string;
   imageAlt?: string;
   imageHref?: string;
}): Document {
   return parseDocument({
      version: 1,
      settings: {
         width: 600,
         backgroundColor: '#f4f4f5',
         contentColor: '#ffffff',
         textColor: '#18181b',
         linkColor: '#0f766e',
         fontFamily: 'HELVETICA',
      },
      children: [
         {
            id: 'heading-1',
            type: 'heading',
            level: 1,
            text: overrides.heading ?? 'Heading',
            align: 'left',
            fontSize: 32,
            lineHeight: 40,
            padding,
         },
         {
            id: 'text-1',
            type: 'text',
            text: overrides.text ?? 'Text',
            align: 'left',
            fontSize: 16,
            lineHeight: 24,
            padding,
         },
         {
            id: 'button-1',
            type: 'button',
            text: overrides.buttonText ?? 'Go',
            href: overrides.buttonHref ?? 'https://example.com/go',
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
         {
            id: 'image-1',
            type: 'image',
            src: 'https://example.com/image.png',
            alt: overrides.imageAlt ?? 'An image',
            ...(overrides.imageHref === undefined ? {} : { href: overrides.imageHref }),
            width: 600,
            align: 'center',
            padding,
         },
      ],
   });
}

describe('applyMergeTags', () => {
   it('substitutes every allowed path', () => {
      const document = documentWith({
         heading: '{{ subscriber.id }}',
         text: '{{ subscriber.email }}|{{ subscriber.first_name }}|{{ subscriber.last_name }}|{{ subscriber.tags }}|{{ campaign.id }}|{{ campaign.subject }}|{{ campaign.utm_campaign }}|{{ links.unsubscribe }}',
      });
      const result = applyMergeTags(document, context);
      expect((result.children[0] as { text: string }).text).toBe('sub-1');
      expect((result.children[1] as TextBlock).text).toBe(
         'ada@example.com|&lt;script&gt;Ada&lt;/script&gt;||vip, beta|camp-1|Spring news|spring|https://example.com/u?token=abc&amp;x=1',
      );
   });

   it('substitutes merge tags inside markdown content', () => {
      const markdown = createBlock('markdown');
      if (markdown.type !== 'markdown') throw new Error('unexpected block shape');
      markdown.text = '## Hi {{ subscriber.first_name }}\n\n{{ campaign.subject }}';

      const result = applyMergeTags({ ...createDocument(), children: [markdown] }, context);

      expect((result.children[0] as { text: string }).text).toBe(
         '## Hi &lt;script&gt;Ada&lt;/script&gt;\n\nSpring news',
      );
   });

   it('substitutes button text, button href, image alt and image href', () => {
      const document = documentWith({
         buttonText: 'Hi {{ subscriber.first_name }}',
         buttonHref:
            'https://example.com/click?u={{ subscriber.email }}&c={{ campaign.utm_campaign }}',
         imageAlt: '{{ campaign.subject }}',
         imageHref: '{{ links.unsubscribe }}',
      });
      const result = applyMergeTags(document, context);
      const button = result.children[2] as ButtonBlock;
      const image = result.children[3] as ImageBlock;
      expect(button.text).toBe('Hi &lt;script&gt;Ada&lt;/script&gt;');
      expect(button.href).toBe('https://example.com/click?u=ada@example.com&c=spring');
      expect(image.alt).toBe('Spring news');
      expect(image.href).toBe('https://example.com/u?token=abc&x=1');
   });

   it('substitutes the web version link', () => {
      const document = documentWith({ buttonHref: '{{ links.web }}' });
      const result = applyMergeTags(document, context);
      const button = result.children[2] as ButtonBlock;
      expect(button.href).toBe('https://example.com/p/camp-1');
   });

   it('does not html escape links.unsubscribe inside an href', () => {
      const document = documentWith({ buttonHref: '{{ links.unsubscribe }}' });
      const result = applyMergeTags(document, context);
      const button = result.children[2] as ButtonBlock;
      expect(button.href).toBe('https://example.com/u?token=abc&x=1');
      expect(button.href).not.toContain('&amp;');
   });

   it('applies filters and chains them left to right', () => {
      const document = documentWith({
         text: '{{ subscriber.first_name | trim | upper }}|{{ campaign.subject | lower }}|{{ campaign.utm_campaign | default("none") }}|{{ subscriber.last_name | default("friend") | upper }}',
      });
      const result = applyMergeTags(document, context);
      expect((result.children[1] as TextBlock).text).toBe(
         '&lt;SCRIPT&gt;ADA&lt;/SCRIPT&gt;|spring news|spring|FRIEND',
      );
   });

   it('renders null before filters so default can take over', () => {
      const document = documentWith({ text: '{{ subscriber.last_name | default("guest") }}' });
      expect((applyMergeTags(document, context).children[1] as TextBlock).text).toBe('guest');
   });

   it('formats unix seconds as a utc date', () => {
      const document = documentWith({
         text: '{{ campaign.id }}',
      });
      const withDate: MergeContext = {
         ...context,
         campaign: { ...context.campaign, id: '0' },
      };
      (document.children[1] as TextBlock).text =
         '{{ campaign.utm_campaign | date("YYYY-MM-DD HH:mm") }}';
      (withDate.campaign as { utm_campaign: string }).utm_campaign = '1717242600';
      expect((applyMergeTags(document, withDate).children[1] as TextBlock).text).toBe(
         '2024-06-01 11:50',
      );
   });

   it('passes non numeric date input through unchanged', () => {
      const document = documentWith({ text: '{{ campaign.subject | date("YYYY") }}' });
      expect((applyMergeTags(document, context).children[1] as TextBlock).text).toBe('Spring news');
   });

   it('escapes html in substituted text but not in hrefs', () => {
      const document = documentWith({ text: '{{ subscriber.first_name }}' });
      const result = applyMergeTags(document, context);
      const text = (result.children[1] as TextBlock).text;
      expect(text).toBe('&lt;script&gt;Ada&lt;/script&gt;');
      expect(text).not.toContain('<script>');
   });

   it('recurses into columns', () => {
      const document = createDocument();
      const columns = createBlock('columns');
      if (columns.type === 'columns') {
         const inner = columns.columns[0]?.blocks[0];
         if (inner?.type === 'text') inner.text = '{{ subscriber.email }}';
      }
      document.children = [columns];
      expect(JSON.stringify(applyMergeTags(document, context))).toContain('ada@example.com');
   });

   it('does not mutate the input document', () => {
      const document = documentWith({ text: '{{ subscriber.email }}' });
      const before = JSON.stringify(document);
      applyMergeTags(document, context);
      expect(JSON.stringify(document)).toBe(before);
   });

   it('rejects a merged href that is not an absolute https url', () => {
      const document = documentWith({ buttonHref: '{{ subscriber.first_name }}' });
      expect(() => applyMergeTags(document, context)).toThrow(/https/);
   });
});

describe('custom metadata merge tags', () => {
   it('substitutes subscriber and campaign metadata by key', () => {
      const document = documentWith({
         text: '{{ subscriber.meta.plan }}|{{ campaign.meta.edition }}',
      });
      expect((applyMergeTags(document, context).children[1] as TextBlock).text).toBe('Pro|spring');
   });

   it('renders a missing key as an empty string and lets default take over', () => {
      const document = documentWith({
         text: '{{ subscriber.meta.missing }}|{{ subscriber.meta.missing | default("friend") }}',
      });
      expect((applyMergeTags(document, context).children[1] as TextBlock).text).toBe('|friend');
   });

   it('applies filters to metadata values', () => {
      const document = documentWith({
         text: '{{ subscriber.meta.plan | upper }}|{{ subscriber.meta.plan | lower }}|{{ subscriber.meta.note }}',
      });
      expect((applyMergeTags(document, context).children[1] as TextBlock).text).toBe(
         'PRO|pro|&lt;b&gt;VIP&lt;/b&gt;',
      );
   });

   it('formats a metadata timestamp with the date filter', () => {
      const document = documentWith({
         text: '{{ subscriber.meta.signup_date | date("YYYY-MM-DD") }}',
      });
      expect((applyMergeTags(document, context).children[1] as TextBlock).text).toBe('2024-06-01');
   });

   it('keeps an https metadata value intact inside an href', () => {
      const document = documentWith({ buttonHref: '{{ subscriber.meta.referral_url }}' });
      const button = applyMergeTags(document, context).children[2] as ButtonBlock;
      expect(button.href).toBe('https://example.com/?a=1&b=2');
   });

   it('rejects a metadata href that is not an absolute https url', () => {
      const document = documentWith({ buttonHref: '{{ subscriber.meta.note }}' });
      expect(() => applyMergeTags(document, context)).toThrow(/https/);
   });

   it('validates dynamic metadata paths and their keys', () => {
      expect(validateTemplate('{{ subscriber.meta.plan }}').ok).toBe(true);
      expect(validateTemplate('{{ campaign.meta.edition | upper }}').ok).toBe(true);
      expect(validateTemplate('{{ subscriber.meta.Plan }}').ok).toBe(false);
      expect(validateTemplate('{{ subscriber.meta. }}').ok).toBe(false);
      expect(validateTemplate('{{ campaign.meta.1plan }}').ok).toBe(false);
   });

   it('reports dynamic metadata tags from findMergeTags', () => {
      expect(
         findMergeTags(
            '{{ subscriber.meta.plan }} {{ campaign.meta.edition | default("x") }} {{ subscriber.meta.plan }}',
         ),
      ).toEqual(['subscriber.meta.plan', 'campaign.meta.edition | default("x")']);
   });
});

describe('validateTemplate', () => {
   it('accepts known paths and filters', () => {
      expect(validateTemplate('Hi {{ subscriber.first_name | default("there") | upper }}')).toEqual(
         {
            ok: true,
            errors: [],
         },
      );
   });

   it('reports unknown paths', () => {
      const result = validateTemplate('{{ subscriber.nickname }}');
      expect(result.ok).toBe(false);
      expect(result.errors.join('\n')).toContain('subscriber.nickname');
   });

   it('reports unknown filters', () => {
      const result = validateTemplate('{{ subscriber.email | shout }}');
      expect(result.ok).toBe(false);
      expect(result.errors.join('\n')).toContain('shout');
   });

   it('reports malformed filters', () => {
      expect(validateTemplate('{{ subscriber.email | default }}').ok).toBe(false);
      expect(validateTemplate('{{ subscriber.email | upper("x") }}').ok).toBe(false);
      expect(validateTemplate('{{ subscriber.email | }}').ok).toBe(false);
      expect(validateTemplate('{{ }}').ok).toBe(false);
      expect(validateTemplate('{{ subscriber.email | default("x" }}').ok).toBe(false);
   });

   it('reports unbalanced braces', () => {
      const result = validateTemplate('Hello {{ subscriber.email');
      expect(result.ok).toBe(false);
      expect(result.errors.join('\n').toLowerCase()).toContain('unbalanced');
   });
});

describe('findMergeTags', () => {
   it('returns unique expressions in order of appearance', () => {
      expect(
         findMergeTags(
            '{{ subscriber.email }} {{ campaign.id }} {{ subscriber.email | upper }} {{ subscriber.email }}',
         ),
      ).toEqual(['subscriber.email', 'campaign.id', 'subscriber.email | upper']);
   });

   it('returns an empty list when there are no tags', () => {
      expect(findMergeTags('no tags here')).toEqual([]);
   });
});

describe('merge tags in extended blocks', () => {
   it('substitutes list items, quote text, attribution, code and link fields', () => {
      const doc = parseDocument({
         version: 1,
         settings: {
            width: 600,
            backgroundColor: '#f4f4f5',
            contentColor: '#ffffff',
            textColor: '#18181b',
            linkColor: '#0f766e',
            fontFamily: 'HELVETICA',
         },
         children: [
            {
               id: 'list-merge',
               type: 'list',
               items: 'Hi {{ subscriber.first_name | trim }}\nYour subject: {{ campaign.subject }}',
               ordered: false,
               fontSize: 16,
               lineHeight: 24,
               gap: 8,
               padding: { top: 0, right: 24, bottom: 16, left: 24 },
            },
            {
               id: 'quote-merge',
               type: 'quote',
               text: 'Sent to {{ subscriber.email }}',
               attribution: '{{ campaign.subject }}',
               borderColor: '#0f766e',
               fontSize: 18,
               lineHeight: 28,
               padding: { top: 8, right: 24, bottom: 16, left: 24 },
            },
            {
               id: 'code-merge',
               type: 'code',
               text: 'TOKEN-{{ subscriber.id }}',
               backgroundColor: '#f4f4f5',
               textColor: '#18181b',
               fontSize: 16,
               lineHeight: 24,
               borderRadius: 6,
               padding: { top: 0, right: 24, bottom: 16, left: 24 },
            },
            {
               id: 'link-merge',
               type: 'link',
               text: 'Unsubscribe',
               href: '{{ links.unsubscribe }}',
               align: 'center',
               fontSize: 16,
               lineHeight: 24,
               underline: true,
               padding: { top: 0, right: 24, bottom: 16, left: 24 },
            },
         ],
      });

      const merged = applyMergeTags(doc, context);
      const [list, quote, code, link] = merged.children;

      expect(list?.type === 'list' ? list.items : '').toContain('Ada');
      expect(list?.type === 'list' ? list.items : '').toContain('Spring news');
      expect(quote?.type === 'quote' ? quote.text : '').toContain('ada@example.com');
      expect(quote?.type === 'quote' ? quote.attribution : '').toBe('Spring news');
      expect(code?.type === 'code' ? code.text : '').toBe('TOKEN-sub-1');
      expect(link?.type === 'link' ? link.href : '').toBe('https://example.com/u?token=abc&x=1');
   });
});

describe('merge tags in new blocks', () => {
   it('substitutes section children, avatar fields, gallery alt and table cells', () => {
      const doc = parseDocument({
         version: 1,
         settings: {
            width: 600,
            backgroundColor: '#f4f4f5',
            contentColor: '#ffffff',
            textColor: '#18181b',
            linkColor: '#0f766e',
            fontFamily: 'HELVETICA',
         },
         children: [
            {
               id: 'section-merge',
               type: 'section',
               backgroundColor: '#ffffff',
               borderColor: '#e4e4e7',
               borderWidth: 1,
               borderRadius: 8,
               padding,
               innerPadding: padding,
               children: [
                  {
                     id: 'section-text',
                     type: 'text',
                     text: 'Hi {{ subscriber.first_name }}',
                     align: 'left',
                     fontSize: 16,
                     lineHeight: 24,
                     padding,
                  },
               ],
            },
            {
               id: 'avatar-merge',
               type: 'avatar',
               src: 'https://example.com/avatar.png',
               alt: 'Avatar',
               size: 48,
               shape: 'circle',
               name: '{{ subscriber.email }}',
               caption: '{{ campaign.subject }}',
               href: '{{ links.unsubscribe }}',
               align: 'center',
               padding,
            },
            {
               id: 'gallery-merge',
               type: 'gallery',
               images: [
                  { src: 'https://example.com/one.png', alt: '{{ campaign.subject }}' },
                  {
                     src: 'https://example.com/two.png',
                     alt: 'Second',
                     href: '{{ links.unsubscribe }}',
                  },
               ],
               gap: 8,
               padding,
            },
            {
               id: 'table-merge',
               type: 'table',
               header: '{{ campaign.subject }} | Seats',
               rows: '{{ subscriber.email }} | 3',
               headerBackgroundColor: '#f4f4f5',
               borderColor: '#e4e4e7',
               textColor: '#18181b',
               fontSize: 14,
               lineHeight: 20,
               cellPadding: 8,
               padding,
            },
         ],
      });

      const merged = applyMergeTags(doc, context);
      const [section, avatar, gallery, table] = merged.children;

      const sectionText = section?.type === 'section' ? section.children[0] : undefined;
      expect(sectionText?.type === 'text' ? sectionText.text : '').toBe(
         'Hi &lt;script&gt;Ada&lt;/script&gt;',
      );

      expect(avatar?.type === 'avatar' ? avatar.name : '').toBe('ada@example.com');
      expect(avatar?.type === 'avatar' ? avatar.caption : '').toBe('Spring news');
      expect(avatar?.type === 'avatar' ? avatar.href : '').toBe(
         'https://example.com/u?token=abc&x=1',
      );

      expect(gallery?.type === 'gallery' ? gallery.images[0]?.alt : '').toBe('Spring news');
      expect(gallery?.type === 'gallery' ? gallery.images[1]?.href : '').toBe(
         'https://example.com/u?token=abc&x=1',
      );

      expect(table?.type === 'table' ? table.header : '').toBe('Spring news | Seats');
      expect(table?.type === 'table' ? table.rows : '').toBe('ada@example.com | 3');
   });
});
