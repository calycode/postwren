import { z } from 'zod';
import { DEFAULT_SETTINGS, FONT_STACKS, IR_VERSION } from './types';
import type {
   AvatarBlock,
   Block,
   BlockType,
   ButtonBlock,
   CodeBlock,
   ColumnsBlock,
   DividerBlock,
   Document,
   DocumentSettings,
   FontKey,
   GalleryBlock,
   HeadingBlock,
   ImageBlock,
   LinkBlock,
   ListBlock,
   MarkdownBlock,
   QuoteBlock,
   SectionBlock,
   SocialBlock,
   SpacerBlock,
   Spacing,
   TableBlock,
   TextBlock,
} from './types';

const HEX = /^#[0-9a-fA-F]{6}$/;

function isHttpsUrl(value: string): boolean {
   try {
      const url = new URL(value);
      return url.protocol === 'https:' && url.hostname.length > 0;
   } catch {
      return false;
   }
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);

function isAllowedImageUrl(value: string): boolean {
   try {
      const url = new URL(value);
      if (url.hostname.length === 0) return false;
      if (url.protocol === 'https:') return true;
      return url.protocol === 'http:' && LOCAL_HOSTS.has(url.hostname);
   } catch {
      return false;
   }
}

function isAllowedHref(value: string): boolean {
   if (value.startsWith('mailto:')) {
      const address = value.slice('mailto:'.length).split('?')[0] ?? '';
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address);
   }
   return isHttpsUrl(value);
}

function isAllowedHrefOrTemplate(value: string): boolean {
   const tags = value.match(/\{\{[\s\S]*?\}\}/g);
   if (!tags) return isAllowedHref(value);
   if (/^\{\{[\s\S]*?\}\}$/.test(value.trim())) return true;
   return isAllowedHref(value.replace(/\{\{[\s\S]*?\}\}/g, 'merge'));
}

export const hexSchema = z.string().regex(HEX, 'Expected a six digit hex colour');
const httpsUrlSchema = z
   .string()
   .refine(isAllowedImageUrl, 'Expected an absolute https URL (http is allowed for localhost)');
const hrefSchema = z
   .string()
   .refine(isAllowedHrefOrTemplate, 'Expected an absolute https or mailto URL');

const alignSchema = z.enum(['left', 'center', 'right']);
const fontKeySchema = z.enum(Object.keys(FONT_STACKS) as [FontKey, ...FontKey[]]);

const bounded = (max: number) => z.number().int().min(0).max(max);

export const spacingSchema = z
   .object({
      top: bounded(96),
      right: bounded(96),
      bottom: bounded(96),
      left: bounded(96),
   })
   .strict();

export const settingsSchema = z
   .object({
      width: z.literal(600),
      backgroundColor: hexSchema,
      contentColor: hexSchema,
      textColor: hexSchema,
      linkColor: hexSchema,
      fontFamily: fontKeySchema,
   })
   .strict();

const idSchema = z.string().min(1);

export const headingBlockSchema = z
   .object({
      id: idSchema,
      type: z.literal('heading'),
      level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
      text: z.string(),
      align: alignSchema,
      color: hexSchema.optional(),
      fontSize: z.number().int().min(8).max(72),
      lineHeight: z.number().int().min(8).max(120),
      padding: spacingSchema,
   })
   .strict();

export const textBlockSchema = z
   .object({
      id: idSchema,
      type: z.literal('text'),
      text: z.string(),
      align: alignSchema,
      color: hexSchema.optional(),
      fontSize: z.number().int().min(8).max(72),
      lineHeight: z.number().int().min(8).max(120),
      padding: spacingSchema,
   })
   .strict();

const borderRadiusSchema = z.union([
   z.literal(0),
   z.literal(4),
   z.literal(6),
   z.literal(8),
   z.literal(12),
   z.literal(24),
   z.literal(999),
]);

export const buttonBlockSchema = z
   .object({
      id: idSchema,
      type: z.literal('button'),
      text: z.string(),
      href: hrefSchema,
      align: alignSchema,
      backgroundColor: hexSchema,
      textColor: hexSchema,
      borderRadius: borderRadiusSchema,
      fontSize: z.number().int().min(8).max(72),
      fontWeight: z.enum(['normal', 'bold']),
      padding: spacingSchema,
      innerPaddingX: z.number().int().min(0),
      innerPaddingY: z.number().int().min(0),
   })
   .strict();

export const imageBlockSchema = z
   .object({
      id: idSchema,
      type: z.literal('image'),
      src: httpsUrlSchema,
      alt: z.string(),
      href: hrefSchema.optional(),
      width: z.number().int().min(1).max(600),
      align: alignSchema,
      padding: spacingSchema,
   })
   .strict();

export const dividerBlockSchema = z
   .object({
      id: idSchema,
      type: z.literal('divider'),
      color: hexSchema,
      thickness: z.number().int().min(0),
      widthPercent: z.number().int().min(10).max(100),
      padding: spacingSchema,
   })
   .strict();

export const spacerBlockSchema = z
   .object({
      id: idSchema,
      type: z.literal('spacer'),
      height: z.number().int().min(0).max(200),
   })
   .strict();

const socialNetworkSchema = z.enum([
   'x',
   'facebook',
   'instagram',
   'linkedin',
   'youtube',
   'github',
   'website',
]);

export const socialBlockSchema = z
   .object({
      id: idSchema,
      type: z.literal('social'),
      links: z.array(
         z
            .object({
               network: socialNetworkSchema,
               href: hrefSchema,
            })
            .strict(),
      ),
      align: alignSchema,
      iconSize: z.number().int().min(12).max(48),
      padding: spacingSchema,
   })
   .strict();

export const listBlockSchema = z
   .object({
      id: idSchema,
      type: z.literal('list'),
      items: z.string().max(5000),
      ordered: z.boolean(),
      markerColor: hexSchema.optional(),
      color: hexSchema.optional(),
      fontSize: z.number().int().min(8).max(72),
      lineHeight: z.number().int().min(8).max(120),
      gap: z.number().int().min(0).max(32),
      padding: spacingSchema,
   })
   .strict();

export const quoteBlockSchema = z
   .object({
      id: idSchema,
      type: z.literal('quote'),
      text: z.string().min(1).max(5000),
      attribution: z.string().max(200).optional(),
      borderColor: hexSchema,
      color: hexSchema.optional(),
      fontSize: z.number().int().min(8).max(72),
      lineHeight: z.number().int().min(8).max(120),
      padding: spacingSchema,
   })
   .strict();

export const codeBlockSchema = z
   .object({
      id: idSchema,
      type: z.literal('code'),
      text: z.string().min(1).max(5000),
      backgroundColor: hexSchema,
      textColor: hexSchema,
      fontSize: z.number().int().min(8).max(72),
      lineHeight: z.number().int().min(8).max(120),
      borderRadius: z.union([
         z.literal(0),
         z.literal(4),
         z.literal(6),
         z.literal(8),
         z.literal(12),
      ]),
      padding: spacingSchema,
   })
   .strict();

export const linkBlockSchema = z
   .object({
      id: idSchema,
      type: z.literal('link'),
      text: z.string().min(1).max(500),
      href: hrefSchema,
      align: alignSchema,
      color: hexSchema.optional(),
      fontSize: z.number().int().min(8).max(72),
      lineHeight: z.number().int().min(8).max(120),
      underline: z.boolean(),
      padding: spacingSchema,
   })
   .strict();

export const markdownBlockSchema = z
   .object({
      id: idSchema,
      type: z.literal('markdown'),
      text: z.string().min(1).max(20_000),
      color: hexSchema.optional(),
      fontSize: z.number().int().min(8).max(72),
      lineHeight: z.number().int().min(8).max(120),
      padding: spacingSchema,
   })
   .strict();

export const avatarBlockSchema = z
   .object({
      id: idSchema,
      type: z.literal('avatar'),
      src: httpsUrlSchema,
      alt: z.string().max(500),
      size: z.number().int().min(24).max(96),
      shape: z.enum(['circle', 'rounded']),
      name: z.string().max(200).optional(),
      caption: z.string().max(300).optional(),
      href: hrefSchema.optional(),
      align: alignSchema,
      padding: spacingSchema,
   })
   .strict();

export const galleryImageSchema = z
   .object({
      src: httpsUrlSchema,
      alt: z.string().max(500),
      href: hrefSchema.optional(),
   })
   .strict();

export const galleryBlockSchema = z
   .object({
      id: idSchema,
      type: z.literal('gallery'),
      images: z.array(galleryImageSchema).min(2).max(4),
      gap: z.number().int().min(0).max(24),
      padding: spacingSchema,
   })
   .strict();

function tableCells(value: string): string[] {
   return value
      .split('|')
      .map((cell) => cell.trim())
      .filter((cell) => cell.length > 0);
}

export const tableBlockSchema = z
   .object({
      id: idSchema,
      type: z.literal('table'),
      header: z
         .string()
         .max(2000)
         .refine((value) => tableCells(value).length <= 20, {
            message: 'Header may have at most 20 cells',
         }),
      rows: z
         .string()
         .max(20_000)
         .refine(
            (value) => value.split('\n').filter((line) => line.trim().length > 0).length <= 50,
            { message: 'Table may have at most 50 rows' },
         ),
      headerBackgroundColor: hexSchema,
      borderColor: hexSchema,
      textColor: hexSchema,
      fontSize: z.number().int().min(8).max(72),
      lineHeight: z.number().int().min(8).max(120),
      cellPadding: z.number().int().min(4).max(24),
      padding: spacingSchema,
   })
   .strict();

export const leafBlockSchema = z.discriminatedUnion('type', [
   headingBlockSchema,
   textBlockSchema,
   buttonBlockSchema,
   imageBlockSchema,
   dividerBlockSchema,
   spacerBlockSchema,
   socialBlockSchema,
   listBlockSchema,
   quoteBlockSchema,
   codeBlockSchema,
   linkBlockSchema,
   markdownBlockSchema,
   avatarBlockSchema,
   galleryBlockSchema,
   tableBlockSchema,
]);

export const columnSchema = z
   .object({
      widthPercent: z.number().min(0).max(100),
      blocks: z.array(leafBlockSchema),
   })
   .strict();

export const columnsBlockSchema = z
   .object({
      id: idSchema,
      type: z.literal('columns'),
      columns: z
         .array(columnSchema)
         .min(2)
         .max(3)
         .refine(
            (columns) =>
               Math.abs(columns.reduce((sum, column) => sum + column.widthPercent, 0) - 100) < 1e-6,
            { message: 'Column widths must sum to 100' },
         ),
      padding: spacingSchema,
   })
   .strict();

export const sectionBlockSchema = z
   .object({
      id: idSchema,
      type: z.literal('section'),
      backgroundColor: hexSchema,
      borderColor: hexSchema,
      borderWidth: z.number().int().min(0).max(4),
      borderRadius: z.union([
         z.literal(0),
         z.literal(4),
         z.literal(6),
         z.literal(8),
         z.literal(12),
      ]),
      padding: spacingSchema,
      innerPadding: spacingSchema,
      children: z.array(leafBlockSchema).max(20),
   })
   .strict();

export const blockSchema = z.union([columnsBlockSchema, sectionBlockSchema, leafBlockSchema]);

function blockIds(block: z.infer<typeof blockSchema>): string[] {
   const ids = [block.id];
   if (block.type === 'columns') {
      for (const column of block.columns) {
         for (const child of column.blocks) {
            ids.push(...blockIds(child));
         }
      }
   } else if (block.type === 'section') {
      for (const child of block.children) {
         ids.push(...blockIds(child));
      }
   }
   return ids;
}

export const documentSchema = z
   .object({
      version: z.literal(IR_VERSION),
      settings: settingsSchema,
      preheader: z.string().max(200).optional(),
      children: z.array(blockSchema),
   })
   .strict()
   .superRefine((document, ctx) => {
      const seen = new Set<string>();
      for (const block of document.children) {
         for (const id of blockIds(block)) {
            if (seen.has(id)) {
               ctx.addIssue({
                  code: z.ZodIssueCode.custom,
                  message: `Duplicate block id "${id}"`,
                  path: ['children'],
               });
            }
            seen.add(id);
         }
      }
   });

export type DocumentSchema = z.infer<typeof documentSchema>;

function randomId(type: BlockType): string {
   return `${type}-${crypto.randomUUID()}`;
}

const defaultPadding = (): Spacing => ({ top: 16, right: 24, bottom: 8, left: 24 });

export function createHeadingBlock(): HeadingBlock {
   return {
      id: randomId('heading'),
      type: 'heading',
      level: 1,
      text: 'Heading',
      align: 'left',
      fontSize: 32,
      lineHeight: 40,
      padding: defaultPadding(),
   };
}

export function createTextBlock(text = 'Write something…'): TextBlock {
   return {
      id: randomId('text'),
      type: 'text',
      text,
      align: 'left',
      fontSize: 16,
      lineHeight: 24,
      padding: defaultPadding(),
   };
}

export function createButtonBlock(): ButtonBlock {
   return {
      id: randomId('button'),
      type: 'button',
      text: 'Click here',
      href: 'https://example.com',
      align: 'left',
      backgroundColor: '#0f766e',
      textColor: '#ffffff',
      borderRadius: 6,
      fontSize: 16,
      fontWeight: 'bold',
      padding: defaultPadding(),
      innerPaddingX: 24,
      innerPaddingY: 12,
   };
}

export function createImageBlock(): ImageBlock {
   return {
      id: randomId('image'),
      type: 'image',
      src: 'https://example.com/image.png',
      alt: '',
      width: 600,
      align: 'center',
      padding: defaultPadding(),
   };
}

export function createDividerBlock(): DividerBlock {
   return {
      id: randomId('divider'),
      type: 'divider',
      color: '#e4e4e7',
      thickness: 1,
      widthPercent: 100,
      padding: defaultPadding(),
   };
}

export function createSpacerBlock(): SpacerBlock {
   return {
      id: randomId('spacer'),
      type: 'spacer',
      height: 24,
   };
}

export function createColumnsBlock(): ColumnsBlock {
   return {
      id: randomId('columns'),
      type: 'columns',
      columns: [
         { widthPercent: 50, blocks: [createTextBlock('Left column')] },
         { widthPercent: 50, blocks: [createTextBlock('Right column')] },
      ],
      padding: defaultPadding(),
   };
}

export function createSocialBlock(): SocialBlock {
   return {
      id: randomId('social'),
      type: 'social',
      links: [{ network: 'website', href: 'https://example.com' }],
      align: 'center',
      iconSize: 24,
      padding: defaultPadding(),
   };
}

export function createListBlock(): ListBlock {
   return {
      id: randomId('list'),
      type: 'list',
      items: 'First item\nSecond item\nThird item',
      ordered: false,
      fontSize: 16,
      lineHeight: 24,
      gap: 8,
      padding: defaultPadding(),
   };
}

export function createQuoteBlock(): QuoteBlock {
   return {
      id: randomId('quote'),
      type: 'quote',
      text: 'The best time to send is when your reader is ready to read.',
      borderColor: '#0f766e',
      fontSize: 18,
      lineHeight: 28,
      padding: { top: 16, right: 24, bottom: 8, left: 24 },
   };
}

export function createCodeBlock(): CodeBlock {
   return {
      id: randomId('code'),
      type: 'code',
      text: '123456',
      backgroundColor: '#f4f4f5',
      textColor: '#18181b',
      fontSize: 16,
      lineHeight: 24,
      borderRadius: 6,
      padding: defaultPadding(),
   };
}

export function createLinkBlock(): LinkBlock {
   return {
      id: randomId('link'),
      type: 'link',
      text: 'Read more',
      href: 'https://example.com',
      align: 'left',
      fontSize: 16,
      lineHeight: 24,
      underline: true,
      padding: defaultPadding(),
   };
}

export function createMarkdownBlock(): MarkdownBlock {
   return {
      id: randomId('markdown'),
      type: 'markdown',
      text: '## Hello, this is my email template\n\nThis is meant to be rendered as a paragraph.\n\n- First item\n- Second item\n\n`inline code` and [a link](https://example.com) work too.',
      fontSize: 16,
      lineHeight: 24,
      padding: defaultPadding(),
   };
}

export function createAvatarBlock(): AvatarBlock {
   return {
      id: randomId('avatar'),
      type: 'avatar',
      src: 'https://example.com/avatar.png',
      alt: 'Avatar',
      size: 48,
      shape: 'circle',
      name: 'Ada Lovelace',
      caption: 'Customer',
      align: 'center',
      padding: defaultPadding(),
   };
}

export function createGalleryBlock(): GalleryBlock {
   return {
      id: randomId('gallery'),
      type: 'gallery',
      images: [
         { src: 'https://example.com/gallery-1.png', alt: 'Gallery image 1' },
         { src: 'https://example.com/gallery-2.png', alt: 'Gallery image 2' },
      ],
      gap: 8,
      padding: defaultPadding(),
   };
}

export function createTableBlock(): TableBlock {
   return {
      id: randomId('table'),
      type: 'table',
      header: 'Plan | Price | Seats',
      rows: 'Starter | $9 | 1\nPro | $29 | 5\nTeam | $79 | 20',
      headerBackgroundColor: '#f4f4f5',
      borderColor: '#e4e4e7',
      textColor: '#18181b',
      fontSize: 14,
      lineHeight: 20,
      cellPadding: 8,
      padding: defaultPadding(),
   };
}

export function createSectionBlock(): SectionBlock {
   return {
      id: randomId('section'),
      type: 'section',
      backgroundColor: '#f9fafb',
      borderColor: '#e4e4e7',
      borderWidth: 1,
      borderRadius: 8,
      padding: defaultPadding(),
      innerPadding: { top: 16, right: 16, bottom: 16, left: 16 },
      children: [createTextBlock('Add content to this section.')],
   };
}

export function createBlock(type: BlockType): Block {
   switch (type) {
      case 'heading':
         return createHeadingBlock();
      case 'text':
         return createTextBlock();
      case 'button':
         return createButtonBlock();
      case 'image':
         return createImageBlock();
      case 'divider':
         return createDividerBlock();
      case 'spacer':
         return createSpacerBlock();
      case 'columns':
         return createColumnsBlock();
      case 'social':
         return createSocialBlock();
      case 'list':
         return createListBlock();
      case 'quote':
         return createQuoteBlock();
      case 'code':
         return createCodeBlock();
      case 'link':
         return createLinkBlock();
      case 'markdown':
         return createMarkdownBlock();
      case 'avatar':
         return createAvatarBlock();
      case 'gallery':
         return createGalleryBlock();
      case 'table':
         return createTableBlock();
      case 'section':
         return createSectionBlock();
   }
}

export function defaultSettings(): DocumentSettings {
   return { ...DEFAULT_SETTINGS };
}

export function starterDocument(): Document {
   return {
      version: IR_VERSION,
      settings: defaultSettings(),
      children: [createTextBlock()],
   };
}
