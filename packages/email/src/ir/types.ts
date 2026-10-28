export const IR_VERSION = 1 as const;

export type Hex = string;
export type Align = 'left' | 'center' | 'right';
export type FontKey = 'ARIAL' | 'HELVETICA' | 'GEORGIA' | 'TIMES' | 'VERDANA' | 'TREBUCHET';

export type Spacing = {
   top: number;
   right: number;
   bottom: number;
   left: number;
};

export type DocumentSettings = {
   width: 600;
   backgroundColor: Hex;
   contentColor: Hex;
   textColor: Hex;
   linkColor: Hex;
   fontFamily: FontKey;
};

type BlockBase = {
   id: string;
};

export type HeadingBlock = BlockBase & {
   type: 'heading';
   level: 1 | 2 | 3;
   text: string;
   align: Align;
   color?: Hex;
   fontSize: number;
   lineHeight: number;
   padding: Spacing;
};

export type TextBlock = BlockBase & {
   type: 'text';
   text: string;
   align: Align;
   color?: Hex;
   fontSize: number;
   lineHeight: number;
   padding: Spacing;
};

export type ButtonBlock = BlockBase & {
   type: 'button';
   text: string;
   href: string;
   align: Align;
   backgroundColor: Hex;
   textColor: Hex;
   borderRadius: 0 | 4 | 6 | 8 | 12 | 24 | 999;
   fontSize: number;
   fontWeight: 'normal' | 'bold';
   padding: Spacing;
   innerPaddingX: number;
   innerPaddingY: number;
};

export type ImageBlock = BlockBase & {
   type: 'image';
   src: string;
   alt: string;
   href?: string;
   width: number;
   align: Align;
   padding: Spacing;
};

export type DividerBlock = BlockBase & {
   type: 'divider';
   color: Hex;
   thickness: number;
   widthPercent: number;
   padding: Spacing;
};

export type SpacerBlock = BlockBase & {
   type: 'spacer';
   height: number;
};

export type Column = {
   widthPercent: number;
   blocks: LeafBlock[];
};

export type ColumnsBlock = BlockBase & {
   type: 'columns';
   columns: Column[];
   padding: Spacing;
};

export type SocialNetwork =
   'x' | 'facebook' | 'instagram' | 'linkedin' | 'youtube' | 'github' | 'website';

export type SocialLink = {
   network: SocialNetwork;
   href: string;
};

export type SocialBlock = BlockBase & {
   type: 'social';
   links: SocialLink[];
   align: Align;
   iconSize: number;
   padding: Spacing;
};

export type ListBlock = BlockBase & {
   type: 'list';
   items: string;
   ordered: boolean;
   markerColor?: Hex;
   color?: Hex;
   fontSize: number;
   lineHeight: number;
   gap: number;
   padding: Spacing;
};

export type QuoteBlock = BlockBase & {
   type: 'quote';
   text: string;
   attribution?: string;
   borderColor: Hex;
   color?: Hex;
   fontSize: number;
   lineHeight: number;
   padding: Spacing;
};

export type CodeBlock = BlockBase & {
   type: 'code';
   text: string;
   backgroundColor: Hex;
   textColor: Hex;
   fontSize: number;
   lineHeight: number;
   borderRadius: 0 | 4 | 6 | 8 | 12;
   padding: Spacing;
};

export type LinkBlock = BlockBase & {
   type: 'link';
   text: string;
   href: string;
   align: Align;
   color?: Hex;
   fontSize: number;
   lineHeight: number;
   underline: boolean;
   padding: Spacing;
};

export type AvatarBlock = BlockBase & {
   type: 'avatar';
   src: string;
   alt: string;
   size: number;
   shape: 'circle' | 'rounded';
   name?: string;
   caption?: string;
   href?: string;
   align: Align;
   padding: Spacing;
};

export type GalleryImage = {
   src: string;
   alt: string;
   href?: string;
};

export type GalleryBlock = BlockBase & {
   type: 'gallery';
   images: GalleryImage[];
   gap: number;
   padding: Spacing;
};

export type TableBlock = BlockBase & {
   type: 'table';
   header: string;
   rows: string;
   headerBackgroundColor: Hex;
   borderColor: Hex;
   textColor: Hex;
   fontSize: number;
   lineHeight: number;
   cellPadding: number;
   padding: Spacing;
};

export type LeafBlock =
   | HeadingBlock
   | TextBlock
   | ButtonBlock
   | ImageBlock
   | DividerBlock
   | SpacerBlock
   | SocialBlock
   | ListBlock
   | QuoteBlock
   | CodeBlock
   | LinkBlock
   | AvatarBlock
   | GalleryBlock
   | TableBlock;

export type SectionChild = LeafBlock;

export type SectionBlock = BlockBase & {
   type: 'section';
   backgroundColor: Hex;
   borderColor: Hex;
   borderWidth: number;
   borderRadius: 0 | 4 | 6 | 8 | 12;
   padding: Spacing;
   innerPadding: Spacing;
   children: SectionChild[];
};

export type Block = LeafBlock | ColumnsBlock | SectionBlock;

export type BlockType = Block['type'];

export type Document = {
   version: typeof IR_VERSION;
   settings: DocumentSettings;
   preheader?: string;
   children: Block[];
};

export const FONT_STACKS: Record<FontKey, string> = {
   ARIAL: "Arial, 'Helvetica Neue', Helvetica, sans-serif",
   HELVETICA: "'Helvetica Neue', Helvetica, Arial, sans-serif",
   GEORGIA: "Georgia, 'Times New Roman', Times, serif",
   TIMES: "'Times New Roman', Times, serif",
   VERDANA: 'Verdana, Geneva, sans-serif',
   TREBUCHET: "'Trebuchet MS', Tahoma, sans-serif",
};

export const DEFAULT_SETTINGS: DocumentSettings = {
   width: 600,
   backgroundColor: '#f4f4f5',
   contentColor: '#ffffff',
   textColor: '#18181b',
   linkColor: '#0f766e',
   fontFamily: 'HELVETICA',
};

export const ZERO_SPACING: Spacing = { top: 0, right: 0, bottom: 0, left: 0 };
