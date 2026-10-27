import { z } from 'zod';
import { DEFAULT_SETTINGS, FONT_STACKS, IR_VERSION } from './types';
import type { Block, BlockType, Document, DocumentSettings, FontKey, Spacing } from './types';

const HEX = /^#[0-9a-fA-F]{6}$/;

function isHttpsUrl(value: string): boolean {
   try {
      const url = new URL(value);
      return url.protocol === 'https:' && url.hostname.length > 0;
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
const httpsUrlSchema = z.string().refine(isHttpsUrl, 'Expected an absolute https URL');
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

export const leafBlockSchema = z.discriminatedUnion('type', [
   headingBlockSchema,
   textBlockSchema,
   buttonBlockSchema,
   imageBlockSchema,
   dividerBlockSchema,
   spacerBlockSchema,
   socialBlockSchema,
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

export const blockSchema = z.union([columnsBlockSchema, leafBlockSchema]);

function blockIds(block: z.infer<typeof blockSchema>): string[] {
   const ids = [block.id];
   if (block.type === 'columns') {
      for (const column of block.columns) {
         for (const child of column.blocks) {
            ids.push(...blockIds(child));
         }
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

const defaultPadding = (): Spacing => ({ top: 0, right: 24, bottom: 16, left: 24 });

export function createHeadingBlock(): Block {
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

export function createTextBlock(text = 'Write something…'): Block {
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

export function createButtonBlock(): Block {
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

export function createImageBlock(): Block {
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

export function createDividerBlock(): Block {
   return {
      id: randomId('divider'),
      type: 'divider',
      color: '#e4e4e7',
      thickness: 1,
      widthPercent: 100,
      padding: defaultPadding(),
   };
}

export function createSpacerBlock(): Block {
   return {
      id: randomId('spacer'),
      type: 'spacer',
      height: 24,
   };
}

export function createColumnsBlock(): Block {
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

export function createSocialBlock(): Block {
   return {
      id: randomId('social'),
      type: 'social',
      links: [{ network: 'website', href: 'https://example.com' }],
      align: 'center',
      iconSize: 24,
      padding: defaultPadding(),
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
