import type { BlockType } from '@postwren/email/ir';

export type FieldKind =
   'text' | 'textarea' | 'number' | 'range' | 'hex' | 'select' | 'align' | 'spacing' | 'boolean';

export type FieldOption = {
   value: string;
   label: string;
};

export type FieldSpec = {
   key: string;
   label: string;
   kind: FieldKind;
   min?: number;
   max?: number;
   step?: number;
   options?: readonly FieldOption[];
   hint?: string;
   placeholder?: string;
   required?: boolean;
   optional?: boolean;
   numeric?: boolean;
   validate?: 'href' | 'https';
};

export const BLOCK_TYPE_OPTIONS: readonly { type: BlockType; label: string }[] = [
   { type: 'heading', label: 'Heading' },
   { type: 'text', label: 'Text' },
   { type: 'markdown', label: 'Markdown' },
   { type: 'button', label: 'Button' },
   { type: 'image', label: 'Image' },
   { type: 'divider', label: 'Divider' },
   { type: 'spacer', label: 'Spacer' },
   { type: 'columns', label: 'Columns' },
   { type: 'social', label: 'Social' },
   { type: 'list', label: 'List' },
   { type: 'quote', label: 'Quote' },
   { type: 'code', label: 'Code' },
   { type: 'link', label: 'Link' },
   { type: 'avatar', label: 'Avatar' },
   { type: 'gallery', label: 'Gallery' },
   { type: 'table', label: 'Table' },
   { type: 'section', label: 'Section' },
   { type: 'repeat', label: 'Repeat' },
];

export const ALIGN_OPTIONS: readonly FieldOption[] = [
   { value: 'left', label: 'Left' },
   { value: 'center', label: 'Center' },
   { value: 'right', label: 'Right' },
];

export const HEADING_LEVEL_OPTIONS: readonly FieldOption[] = [
   { value: '1', label: 'Heading 1' },
   { value: '2', label: 'Heading 2' },
   { value: '3', label: 'Heading 3' },
];

export const BORDER_RADIUS_OPTIONS: readonly FieldOption[] = [
   { value: '0', label: 'None (0px)' },
   { value: '4', label: '4px' },
   { value: '6', label: '6px' },
   { value: '8', label: '8px' },
   { value: '12', label: '12px' },
   { value: '24', label: '24px' },
   { value: '999', label: 'Pill (999px)' },
];

export const CODE_RADIUS_OPTIONS: readonly FieldOption[] = [
   { value: '0', label: 'None (0px)' },
   { value: '4', label: '4px' },
   { value: '6', label: '6px' },
   { value: '8', label: '8px' },
   { value: '12', label: '12px' },
];

export const FONT_WEIGHT_OPTIONS: readonly FieldOption[] = [
   { value: 'normal', label: 'Normal' },
   { value: 'bold', label: 'Bold' },
];

export const AVATAR_SHAPE_OPTIONS: readonly FieldOption[] = [
   { value: 'circle', label: 'Circle' },
   { value: 'rounded', label: 'Rounded square' },
];

export const FONT_FAMILY_OPTIONS: readonly FieldOption[] = [
   { value: 'ARIAL', label: 'Arial' },
   { value: 'HELVETICA', label: 'Helvetica' },
   { value: 'GEORGIA', label: 'Georgia' },
   { value: 'TIMES', label: 'Times New Roman' },
   { value: 'VERDANA', label: 'Verdana' },
   { value: 'TREBUCHET', label: 'Trebuchet MS' },
];

export const SOCIAL_NETWORK_OPTIONS: readonly FieldOption[] = [
   { value: 'x', label: 'X' },
   { value: 'facebook', label: 'Facebook' },
   { value: 'instagram', label: 'Instagram' },
   { value: 'linkedin', label: 'LinkedIn' },
   { value: 'youtube', label: 'YouTube' },
   { value: 'github', label: 'GitHub' },
   { value: 'website', label: 'Website' },
];

const paddingField: FieldSpec = { key: 'padding', label: 'Padding', kind: 'spacing' };

export const BLOCK_FIELDS: Record<BlockType, readonly FieldSpec[]> = {
   heading: [
      {
         key: 'level',
         label: 'Level',
         kind: 'select',
         options: HEADING_LEVEL_OPTIONS,
         numeric: true,
      },
      { key: 'text', label: 'Text', kind: 'text' },
      { key: 'align', label: 'Alignment', kind: 'align' },
      { key: 'color', label: 'Colour', kind: 'hex', optional: true },
      { key: 'fontSize', label: 'Font size', kind: 'number', min: 8, max: 72 },
      { key: 'lineHeight', label: 'Line height', kind: 'number', min: 8, max: 120 },
      paddingField,
   ],
   text: [
      {
         key: 'text',
         label: 'Text',
         kind: 'textarea',
         hint: 'Supports **bold**, *italic*, `code` and [label](url).',
      },
      { key: 'align', label: 'Alignment', kind: 'align' },
      { key: 'color', label: 'Colour', kind: 'hex', optional: true },
      { key: 'fontSize', label: 'Font size', kind: 'number', min: 8, max: 72 },
      { key: 'lineHeight', label: 'Line height', kind: 'number', min: 8, max: 120 },
      paddingField,
   ],
   markdown: [
      {
         key: 'text',
         label: 'Markdown',
         kind: 'textarea',
         hint: 'Headings (##), **bold**, *italic*, `code`, [links](https://example.com), lists, quotes and fenced code.',
      },
      { key: 'color', label: 'Text colour', kind: 'hex', optional: true },
      { key: 'fontSize', label: 'Font size', kind: 'number', min: 8, max: 72 },
      { key: 'lineHeight', label: 'Line height', kind: 'number', min: 8, max: 120 },
      paddingField,
   ],
   button: [
      { key: 'text', label: 'Label', kind: 'text' },
      {
         key: 'href',
         label: 'Link',
         kind: 'text',
         validate: 'href',
         required: true,
         placeholder: 'https://example.com',
      },
      { key: 'align', label: 'Alignment', kind: 'align' },
      { key: 'backgroundColor', label: 'Background', kind: 'hex' },
      { key: 'textColor', label: 'Text colour', kind: 'hex' },
      {
         key: 'borderRadius',
         label: 'Corner radius',
         kind: 'select',
         options: BORDER_RADIUS_OPTIONS,
         numeric: true,
      },
      { key: 'fontSize', label: 'Font size', kind: 'number', min: 8, max: 72 },
      { key: 'fontWeight', label: 'Font weight', kind: 'select', options: FONT_WEIGHT_OPTIONS },
      { key: 'innerPaddingX', label: 'Inner padding X', kind: 'number', min: 0, max: 96 },
      { key: 'innerPaddingY', label: 'Inner padding Y', kind: 'number', min: 0, max: 96 },
      paddingField,
   ],
   image: [
      {
         key: 'src',
         label: 'Image URL',
         kind: 'text',
         validate: 'https',
         placeholder: 'https://example.com/image.png',
      },
      {
         key: 'alt',
         label: 'Alt text',
         kind: 'text',
         optional: true,
         hint: 'Describe the image for screen readers',
      },
      { key: 'href', label: 'Link (optional)', kind: 'text', validate: 'href' },
      { key: 'width', label: 'Width', kind: 'number', min: 1, max: 600 },
      { key: 'align', label: 'Alignment', kind: 'align' },
      paddingField,
   ],
   divider: [
      { key: 'color', label: 'Colour', kind: 'hex' },
      { key: 'thickness', label: 'Thickness', kind: 'number', min: 0, max: 24 },
      { key: 'widthPercent', label: 'Width %', kind: 'number', min: 10, max: 100 },
      paddingField,
   ],
   spacer: [{ key: 'height', label: 'Height', kind: 'range', min: 0, max: 200 }],
   columns: [paddingField],
   social: [
      { key: 'align', label: 'Alignment', kind: 'align' },
      { key: 'iconSize', label: 'Icon size', kind: 'number', min: 12, max: 48 },
      paddingField,
   ],
   list: [
      {
         key: 'items',
         label: 'Items',
         kind: 'textarea',
         hint: 'One item per line. Supports **bold**, *italic*, code and [label](url).',
      },
      { key: 'ordered', label: 'Numbered list', kind: 'boolean' },
      { key: 'color', label: 'Text colour', kind: 'hex', optional: true },
      { key: 'markerColor', label: 'Marker colour', kind: 'hex', optional: true },
      { key: 'fontSize', label: 'Font size', kind: 'number', min: 8, max: 72 },
      { key: 'lineHeight', label: 'Line height', kind: 'number', min: 8, max: 120 },
      { key: 'gap', label: 'Item spacing', kind: 'number', min: 0, max: 32 },
      paddingField,
   ],
   quote: [
      {
         key: 'text',
         label: 'Quote',
         kind: 'textarea',
         hint: 'Supports **bold**, *italic*, code and [label](url).',
      },
      { key: 'attribution', label: 'Attribution', kind: 'text', optional: true },
      { key: 'borderColor', label: 'Bar colour', kind: 'hex' },
      { key: 'color', label: 'Text colour', kind: 'hex', optional: true },
      { key: 'fontSize', label: 'Font size', kind: 'number', min: 8, max: 72 },
      { key: 'lineHeight', label: 'Line height', kind: 'number', min: 8, max: 120 },
      paddingField,
   ],
   code: [
      { key: 'text', label: 'Code', kind: 'textarea', hint: 'Rendered in a monospace font.' },
      { key: 'backgroundColor', label: 'Background', kind: 'hex' },
      { key: 'textColor', label: 'Text colour', kind: 'hex' },
      { key: 'fontSize', label: 'Font size', kind: 'number', min: 8, max: 72 },
      { key: 'lineHeight', label: 'Line height', kind: 'number', min: 8, max: 120 },
      {
         key: 'borderRadius',
         label: 'Corner radius',
         kind: 'select',
         options: CODE_RADIUS_OPTIONS,
         numeric: true,
      },
      paddingField,
   ],
   link: [
      { key: 'text', label: 'Label', kind: 'text' },
      {
         key: 'href',
         label: 'Link',
         kind: 'text',
         validate: 'href',
         required: true,
         placeholder: 'https://example.com',
      },
      { key: 'align', label: 'Alignment', kind: 'align' },
      { key: 'color', label: 'Colour', kind: 'hex', optional: true },
      { key: 'fontSize', label: 'Font size', kind: 'number', min: 8, max: 72 },
      { key: 'lineHeight', label: 'Line height', kind: 'number', min: 8, max: 120 },
      { key: 'underline', label: 'Underline', kind: 'boolean' },
      paddingField,
   ],
   avatar: [
      {
         key: 'src',
         label: 'Image URL',
         kind: 'text',
         validate: 'https',
         placeholder: 'https://example.com/avatar.png',
      },
      {
         key: 'alt',
         label: 'Alt text',
         kind: 'text',
         optional: true,
         hint: 'Describe the image for screen readers',
      },
      { key: 'size', label: 'Size', kind: 'number', min: 24, max: 96 },
      { key: 'shape', label: 'Shape', kind: 'select', options: AVATAR_SHAPE_OPTIONS },
      { key: 'name', label: 'Name', kind: 'text', optional: true },
      { key: 'caption', label: 'Caption', kind: 'text', optional: true },
      { key: 'href', label: 'Link (optional)', kind: 'text', validate: 'href' },
      { key: 'align', label: 'Alignment', kind: 'align' },
      paddingField,
   ],
   gallery: [{ key: 'gap', label: 'Gap', kind: 'number', min: 0, max: 24 }, paddingField],
   table: [
      {
         key: 'header',
         label: 'Header',
         kind: 'textarea',
         hint: 'Pipe-separated cells. Leave empty for no header row.',
         placeholder: 'Plan | Price | Seats',
      },
      {
         key: 'rows',
         label: 'Rows',
         kind: 'textarea',
         hint: 'One row per line, cells separated by |. Supports [label](url).',
         placeholder: 'Starter | $9 | 1',
      },
      { key: 'headerBackgroundColor', label: 'Header background', kind: 'hex' },
      { key: 'borderColor', label: 'Border colour', kind: 'hex' },
      { key: 'textColor', label: 'Text colour', kind: 'hex' },
      { key: 'fontSize', label: 'Font size', kind: 'number', min: 8, max: 72 },
      { key: 'lineHeight', label: 'Line height', kind: 'number', min: 8, max: 120 },
      { key: 'cellPadding', label: 'Cell padding', kind: 'number', min: 4, max: 24 },
      paddingField,
   ],
   section: [
      { key: 'backgroundColor', label: 'Background', kind: 'hex' },
      { key: 'borderColor', label: 'Border colour', kind: 'hex' },
      { key: 'borderWidth', label: 'Border width', kind: 'number', min: 0, max: 4 },
      {
         key: 'borderRadius',
         label: 'Corner radius',
         kind: 'select',
         options: CODE_RADIUS_OPTIONS,
         numeric: true,
      },
      paddingField,
      { key: 'innerPadding', label: 'Inner padding', kind: 'spacing' },
   ],
   repeat: [paddingField],
};

export const MERGE_TAGS: readonly { path: string; label: string }[] = [
   { path: 'subscriber.id', label: 'Subscriber ID' },
   { path: 'subscriber.email', label: 'Email' },
   { path: 'subscriber.first_name', label: 'First name' },
   { path: 'subscriber.last_name', label: 'Last name' },
   { path: 'subscriber.tags', label: 'Tags' },
   { path: 'campaign.id', label: 'Campaign ID' },
   { path: 'campaign.subject', label: 'Campaign subject' },
   { path: 'campaign.utm_campaign', label: 'UTM campaign' },
   { path: 'automation.id', label: 'Automation ID' },
   { path: 'links.unsubscribe', label: 'Unsubscribe URL' },
   { path: 'links.web', label: 'Web version URL' },
   { path: 'itemIndex', label: 'Item index (0-based)' },
   { path: 'itemIndex1', label: 'Item number (1-based)' },
];
