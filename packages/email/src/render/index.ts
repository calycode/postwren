import { FONT_STACKS } from '../ir/types';
import type { Block, ButtonBlock, Document, SocialNetwork, Spacing } from '../ir/types';
import { escapeHtml, inlineToHtml, inlineToText, parseInline } from './markup';

export type ResolveLink = (href: string, linkId: string) => string;

export type RenderOptions = {
   resolveLink?: ResolveLink;
   unsubscribeUrl?: string;
   preheader?: string;
   annotateBlocks?: boolean;
};

export type RenderWarningCode =
   | 'image_missing_alt'
   | 'image_width_mismatch'
   | 'message_too_large'
   | 'low_contrast'
   | 'too_many_links'
   | 'unsubscribe_missing'
   | 'empty_document';

export type RenderWarning = {
   code: RenderWarningCode;
   message: string;
   blockId?: string;
};

export type RenderResult = {
   html: string;
   text: string;
   bytes: number;
   warnings: RenderWarning[];
};

const TABLE_ATTRS = 'role="presentation" cellpadding="0" cellspacing="0" border="0"';

type Context = {
   doc: Document;
   opts: RenderOptions;
   font: string;
   textColor: string;
   contentColor: string;
   linkColor: string;
   warnings: RenderWarning[];
   linkCount: { value: number };
};

function paddingStyle(padding: Spacing): string {
   return `padding:${padding.top}px ${padding.right}px ${padding.bottom}px ${padding.left}px;`;
}

function fontStyle(
   context: Context,
   size = 16,
   lineHeight = 24,
   color = context.textColor,
): string {
   return `font-family:${context.font};font-size:${size}px;line-height:${lineHeight}px;color:${color};`;
}

function resolve(context: Context, href: string, blockId: string): string {
   context.linkCount.value += 1;
   return context.opts.resolveLink ? context.opts.resolveLink(href, blockId) : href;
}

function linkStyle(context: Context): string {
   return `color:${context.linkColor};text-decoration:underline;`;
}

function hexToRgb(hex: string): [number, number, number] {
   const value = Number.parseInt(hex.slice(1), 16);
   return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function channelLuminance(channel: number): number {
   const value = channel / 255;
   return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(hex: string): number {
   const [r, g, b] = hexToRgb(hex);
   return (
      0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b)
   );
}

function contrastRatio(first: string, second: string): number {
   const a = relativeLuminance(first);
   const b = relativeLuminance(second);
   const lighter = Math.max(a, b);
   const darker = Math.min(a, b);
   return (lighter + 0.05) / (darker + 0.05);
}

function warnLowContrast(
   context: Context,
   color: string,
   background: string,
   blockId: string,
): void {
   if (contrastRatio(color, background) < 3) {
      context.warnings.push({
         code: 'low_contrast',
         message: `Text colour ${color} on ${background} has a contrast ratio below 3:1`,
         blockId,
      });
   }
}

function warnInlineLinkContrast(context: Context, text: string, blockId: string): void {
   if (parseInline(text).some((token) => token.type === 'link')) {
      warnLowContrast(context, context.linkColor, context.contentColor, blockId);
   }
}

function renderHeading(context: Context, block: Extract<Block, { type: 'heading' }>): string {
   const color = block.color ?? context.textColor;
   warnLowContrast(context, color, context.contentColor, block.id);
   warnInlineLinkContrast(context, block.text, block.id);
   const inner = inlineToHtml(block.text, {
      link: linkStyle(context),
      resolve: (href) => resolve(context, href, block.id),
   });
   const tag = `h${block.level}`;
   return `<tr><td class="px" align="${block.align}" style="${fontStyle(
      context,
      block.fontSize,
      block.lineHeight,
      color,
   )}${paddingStyle(block.padding)}text-align:${block.align};"><${tag} style="margin:0;font-family:${
      context.font
   };font-size:${block.fontSize}px;line-height:${block.lineHeight}px;color:${color};text-align:${
      block.align
   };">${inner}</${tag}></td></tr>`;
}

function renderText(context: Context, block: Extract<Block, { type: 'text' }>): string {
   const color = block.color ?? context.textColor;
   warnLowContrast(context, color, context.contentColor, block.id);
   warnInlineLinkContrast(context, block.text, block.id);
   const inner = inlineToHtml(block.text, {
      link: linkStyle(context),
      resolve: (href) => resolve(context, href, block.id),
   });
   return `<tr><td class="px" align="${block.align}" style="${fontStyle(
      context,
      block.fontSize,
      block.lineHeight,
      color,
   )}${paddingStyle(block.padding)}text-align:${block.align};">${inner}</td></tr>`;
}

function renderButton(context: Context, block: ButtonBlock): string {
   warnLowContrast(context, block.textColor, block.backgroundColor, block.id);
   const href = escapeHtml(resolve(context, block.href, block.id));
   const label = escapeHtml(block.text);
   const lineHeight = Math.round(block.fontSize * 1.2);
   const height = lineHeight + block.innerPaddingY * 2;
   const width = Math.max(
      80,
      Math.round(block.text.length * block.fontSize * 0.6 + block.innerPaddingX * 2),
   );
   const arcsize = Math.min(50, Math.round((block.borderRadius / height) * 100));
   const hide = block.borderRadius > 0 ? 'mso-hide:all;' : '';

   const vml =
      block.borderRadius > 0
         ? `<!--[if mso]>
<v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${href}" style="height:${height}px;v-text-anchor:middle;width:${width}px;" arcsize="${arcsize}%">
<w:anchorlock/>
<center style="color:${block.textColor};font-family:${context.font};font-size:${block.fontSize}px;font-weight:${block.fontWeight};">${label}</center>
</v:roundrect>
<![endif]-->`
         : '';

   return `<tr><td class="px" align="${block.align}" style="${fontStyle(
      context,
   )}${paddingStyle(block.padding)}">
<table ${TABLE_ATTRS} align="${block.align}"><tbody><tr><td align="center" bgcolor="${
      block.backgroundColor
   }" style="border-radius:${block.borderRadius}px;background-color:${
      block.backgroundColor
   };${fontStyle(context, block.fontSize, lineHeight, block.textColor)}mso-line-height-rule:exactly;">
${vml}
<a href="${href}" style="display:inline-block;padding:${block.innerPaddingY}px ${
      block.innerPaddingX
   }px;background-color:${block.backgroundColor};color:${
      block.textColor
   };border-radius:${block.borderRadius}px;font-family:${context.font};font-size:${
      block.fontSize
   }px;line-height:${lineHeight}px;font-weight:${block.fontWeight};text-decoration:none;${hide}">${label}</a>
</td></tr></tbody></table>
</td></tr>`;
}

function renderImage(context: Context, block: Extract<Block, { type: 'image' }>): string {
   if (block.alt.trim().length === 0) {
      context.warnings.push({
         code: 'image_missing_alt',
         message: 'Image has no alt text',
         blockId: block.id,
      });
   }
   if (block.width > 600) {
      context.warnings.push({
         code: 'image_width_mismatch',
         message: `Image width ${block.width}px exceeds the 600px content width`,
         blockId: block.id,
      });
   }

   const margin =
      block.align === 'center'
         ? 'margin:0 auto;'
         : block.align === 'right'
           ? 'margin-left:auto;'
           : 'margin:0;';
   const image = `<img src="${escapeHtml(block.src)}" alt="${escapeHtml(
      block.alt,
   )}" width="${block.width}" border="0" style="display:block;width:${
      block.width
   }px;height:auto;border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;${margin}">`;

   const content = block.href
      ? `<a href="${escapeHtml(resolve(context, block.href, block.id))}" style="text-decoration:none;">${image}</a>`
      : image;

   return `<tr><td class="px" align="${block.align}" style="${fontStyle(
      context,
   )}${paddingStyle(block.padding)}">${content}</td></tr>`;
}

function renderDivider(context: Context, block: Extract<Block, { type: 'divider' }>): string {
   return `<tr><td class="px" align="center" style="${fontStyle(context)}${paddingStyle(
      block.padding,
   )}">
<table ${TABLE_ATTRS} width="${block.widthPercent}%" align="center" style="width:${
      block.widthPercent
   }%;"><tbody><tr><td height="${block.thickness}" bgcolor="${
      block.color
   }" style="background-color:${block.color};height:${
      block.thickness
   }px;font-size:1px;line-height:1px;mso-line-height-rule:exactly;">&nbsp;</td></tr></tbody></table>
</td></tr>`;
}

function renderSpacer(block: Extract<Block, { type: 'spacer' }>): string {
   return `<tr><td height="${block.height}" style="font-size:1px;line-height:1px;mso-line-height-rule:exactly;">&nbsp;</td></tr>`;
}

function renderColumns(context: Context, block: Extract<Block, { type: 'columns' }>): string {
   const columns = block.columns
      .map((column) => {
         const rows = column.blocks.map((child) => renderBlock(context, child)).join('');
         return `<td class="stack" width="${column.widthPercent}%" valign="top" style="width:${
            column.widthPercent
         }%;${fontStyle(context)}vertical-align:top;">
<table ${TABLE_ATTRS} width="100%" style="width:100%;"><tbody>${rows}</tbody></table>
</td>`;
      })
      .join('');

   return `<tr><td class="px" style="${fontStyle(context)}${paddingStyle(block.padding)}">
<table ${TABLE_ATTRS} width="100%" style="width:100%;"><tbody><tr>${columns}</tr></tbody></table>
</td></tr>`;
}

const SOCIAL_LABELS: Record<SocialNetwork, string> = {
   x: 'X',
   facebook: 'Facebook',
   instagram: 'Instagram',
   linkedin: 'LinkedIn',
   youtube: 'YouTube',
   github: 'GitHub',
   website: 'Website',
};

function renderSocial(context: Context, block: Extract<Block, { type: 'social' }>): string {
   if (block.links.length === 0) return '';
   warnLowContrast(context, context.linkColor, context.contentColor, block.id);

   const cells = block.links
      .map((link) => {
         const href = escapeHtml(resolve(context, link.href, block.id));
         return `<td align="center" style="${fontStyle(
            context,
            block.iconSize,
            block.iconSize + 4,
            context.linkColor,
         )}padding:0 8px;"><a href="${href}" style="color:${
            context.linkColor
         };font-family:${context.font};font-size:${
            block.iconSize
         }px;line-height:${block.iconSize + 4}px;font-weight:bold;text-decoration:none;">${
            SOCIAL_LABELS[link.network]
         }</a></td>`;
      })
      .join('');

   return `<tr><td class="px" align="${block.align}" style="${fontStyle(context)}${paddingStyle(
      block.padding,
   )}">
<table ${TABLE_ATTRS} align="${block.align}"><tbody><tr>${cells}</tr></tbody></table>
</td></tr>`;
}

function renderList(context: Context, block: Extract<Block, { type: 'list' }>): string {
   const color = block.color ?? context.textColor;
   const markerColor = block.markerColor ?? color;
   warnLowContrast(context, color, context.contentColor, block.id);

   const items = block.items
      .split('\n')
      .map((item) => item.trim())
      .filter((item) => item.length > 0);

   if (items.length === 0) return '';

   const rows = items
      .map((item, index) => {
         warnInlineLinkContrast(context, item, block.id);
         const marker = block.ordered ? `${index + 1}.` : '•';
         const bottom = index === items.length - 1 ? 0 : block.gap;
         const inner = inlineToHtml(item, {
            link: linkStyle(context),
            resolve: (href) => resolve(context, href, block.id),
         });

         return `<tr><td width="24" valign="top" style="width:24px;${fontStyle(
            context,
            block.fontSize,
            block.lineHeight,
            markerColor,
         )}padding-bottom:${bottom}px;">${marker}</td><td valign="top" style="${fontStyle(
            context,
            block.fontSize,
            block.lineHeight,
            color,
         )}padding-bottom:${bottom}px;">${inner}</td></tr>`;
      })
      .join('');

   return `<tr><td class="px" style="${fontStyle(context)}${paddingStyle(block.padding)}">
<table ${TABLE_ATTRS} width="100%" style="width:100%;"><tbody>${rows}</tbody></table>
</td></tr>`;
}

function renderQuote(context: Context, block: Extract<Block, { type: 'quote' }>): string {
   const color = block.color ?? context.textColor;
   warnLowContrast(context, color, context.contentColor, block.id);
   warnInlineLinkContrast(context, block.text, block.id);

   const inner = inlineToHtml(block.text, {
      link: linkStyle(context),
      resolve: (href) => resolve(context, href, block.id),
   });
   const attribution = block.attribution?.trim();
   const attributionHtml =
      attribution === undefined || attribution.length === 0
         ? ''
         : `<br><span style="color:${color};font-family:${context.font};font-size:13px;line-height:20px;opacity:0.75;">— ${escapeHtml(
              attribution,
           )}</span>`;

   return `<tr><td class="px" style="${fontStyle(context)}${paddingStyle(block.padding)}">
<table ${TABLE_ATTRS} width="100%" style="width:100%;"><tbody><tr>
<td width="3" bgcolor="${block.borderColor}" style="width:3px;background-color:${
      block.borderColor
   };font-size:1px;line-height:1px;mso-line-height-rule:exactly;">&nbsp;</td>
<td style="${fontStyle(context, block.fontSize, block.lineHeight, color)}padding-left:16px;">${inner}${attributionHtml}</td>
</tr></tbody></table>
</td></tr>`;
}

function renderCode(context: Context, block: Extract<Block, { type: 'code' }>): string {
   warnLowContrast(context, block.textColor, block.backgroundColor, block.id);
   const inner = escapeHtml(block.text).replace(/\n/g, '<br>');

   return `<tr><td class="px" style="${fontStyle(context)}${paddingStyle(block.padding)}">
<table ${TABLE_ATTRS} width="100%" style="width:100%;"><tbody><tr>
<td bgcolor="${block.backgroundColor}" style="background-color:${
      block.backgroundColor
   };border-radius:${block.borderRadius}px;font-family:'Courier New',Courier,monospace;font-size:${
      block.fontSize
   }px;line-height:${block.lineHeight}px;color:${block.textColor};mso-line-height-rule:exactly;padding:16px;">${inner}</td>
</tr></tbody></table>
</td></tr>`;
}

function renderLink(context: Context, block: Extract<Block, { type: 'link' }>): string {
   const color = block.color ?? context.linkColor;
   warnLowContrast(context, color, context.contentColor, block.id);
   const href = escapeHtml(resolve(context, block.href, block.id));

   return `<tr><td class="px" align="${block.align}" style="${fontStyle(
      context,
      block.fontSize,
      block.lineHeight,
      color,
   )}${paddingStyle(block.padding)}text-align:${block.align};"><a href="${href}" style="color:${color};font-family:${
      context.font
   };font-size:${block.fontSize}px;line-height:${block.lineHeight}px;text-decoration:${
      block.underline ? 'underline' : 'none'
   };">${escapeHtml(block.text)}</a></td></tr>`;
}

function renderBlock(context: Context, block: Block): string {
   const html = renderBlockMarkup(context, block);
   if (!context.opts.annotateBlocks || html.length === 0) return html;
   return html.replace('<tr', `<tr data-block-id="${escapeHtml(block.id)}"`);
}

function renderBlockMarkup(context: Context, block: Block): string {
   switch (block.type) {
      case 'heading':
         return renderHeading(context, block);
      case 'text':
         return renderText(context, block);
      case 'button':
         return renderButton(context, block);
      case 'image':
         return renderImage(context, block);
      case 'divider':
         return renderDivider(context, block);
      case 'spacer':
         return renderSpacer(block);
      case 'columns':
         return renderColumns(context, block);
      case 'social':
         return renderSocial(context, block);
      case 'list':
         return renderList(context, block);
      case 'quote':
         return renderQuote(context, block);
      case 'code':
         return renderCode(context, block);
      case 'link':
         return renderLink(context, block);
   }
}

function renderPreheader(text: string): string {
   return `<span style="display:none!important;font-size:1px;line-height:1px;max-height:0;overflow:hidden;mso-hide:all;color:transparent;">${escapeHtml(
      text,
   )}${'&#8203;&nbsp;'.repeat(40)}</span>`;
}

function renderFooter(context: Context, url: string): string {
   const href = escapeHtml(resolve(context, url, 'unsubscribe'));
   return `<tr><td class="px" align="center" style="font-family:${context.font};font-size:12px;line-height:18px;color:#71717a;padding:24px 24px 24px 24px;text-align:center;"><a href="${href}" style="color:#71717a;font-family:${context.font};font-size:12px;line-height:18px;text-decoration:underline;">Unsubscribe</a></td></tr>`;
}

function titleOf(doc: Document): string {
   for (const block of doc.children) {
      if (block.type === 'heading') return inlineToText(block.text);
   }
   return 'Email';
}

function plainTextBlock(block: Block): string[] {
   switch (block.type) {
      case 'heading':
      case 'text':
         return [inlineToText(block.text)];
      case 'button':
         return [`${block.text}: ${block.href}`];
      case 'image':
         return [`[image: ${block.alt}]`];
      case 'divider':
         return ['---'];
      case 'spacer':
         return [];
      case 'columns':
         return block.columns.flatMap((column) => column.blocks.flatMap(plainTextBlock));
      case 'social':
         return block.links.map((link) => `${link.network}: ${link.href}`);
      case 'list':
         return block.items
            .split('\n')
            .map((item) => item.trim())
            .filter((item) => item.length > 0)
            .map((item, index) => `${block.ordered ? `${index + 1}.` : '-'} ${inlineToText(item)}`);
      case 'quote': {
         const attribution = block.attribution?.trim();
         return [
            `> ${inlineToText(block.text)}`,
            ...(attribution === undefined || attribution.length === 0 ? [] : [`— ${attribution}`]),
         ];
      }
      case 'code':
         return [block.text];
      case 'link':
         return [`${block.text}: ${block.href}`];
   }
}

export function renderEmail(doc: Document, opts: RenderOptions = {}): RenderResult {
   const warnings: RenderWarning[] = [];
   const context: Context = {
      doc,
      opts,
      font: FONT_STACKS[doc.settings.fontFamily],
      textColor: doc.settings.textColor,
      contentColor: doc.settings.contentColor,
      linkColor: doc.settings.linkColor,
      warnings,
      linkCount: { value: 0 },
   };

   const rows = doc.children.map((block) => renderBlock(context, block)).join('');
   const footer = opts.unsubscribeUrl ? renderFooter(context, opts.unsubscribeUrl) : '';
   const contentTable = `<table ${TABLE_ATTRS} width="100%" align="center" bgcolor="${
      doc.settings.contentColor
   }" style="width:100%;max-width:600px;background-color:${
      doc.settings.contentColor
   };border-collapse:collapse;"><tbody>${rows}${footer}</tbody></table>`;

   const preheaderText = opts.preheader ?? doc.preheader;
   const preheader = preheaderText ? renderPreheader(preheaderText) : '';

   const html = `<!DOCTYPE html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="x-apple-disable-message-reformatting">
<meta name="format-detection" content="telephone=no,address=no,email=no,date=no,url=no">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${escapeHtml(titleOf(doc))}</title>
<style>body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;}table,td{mso-table-lspace:0pt;mso-table-rspace:0pt;border-collapse:collapse;}img{-ms-interpolation-mode:bicubic;border:0;height:auto;line-height:100%;outline:none;text-decoration:none;}@media (max-width:599px){.stack{display:block!important;width:100%!important;}.px{padding-left:16px!important;padding-right:16px!important;}}</style>
</head>
<body style="margin:0;padding:0;background-color:${doc.settings.backgroundColor};">
${preheader}
<table ${TABLE_ATTRS} width="100%" bgcolor="${
      doc.settings.backgroundColor
   }" style="width:100%;background-color:${
      doc.settings.backgroundColor
   };border-collapse:collapse;"><tbody><tr><td align="center" style="${fontStyle(
      context,
   )}padding:0;">
<!--[if mso]>
<table ${TABLE_ATTRS} width="600" align="center"><tbody><tr><td>
<![endif]-->
${contentTable}
<!--[if mso]>
</td></tr></tbody></table>
<![endif]-->
</td></tr></tbody></table>
</body>
</html>`;

   const text = [
      ...doc.children.flatMap(plainTextBlock).filter((chunk) => chunk.length > 0),
      ...(opts.unsubscribeUrl ? [`Unsubscribe: ${opts.unsubscribeUrl}`] : []),
   ].join('\n\n');

   const bytes = new TextEncoder().encode(html).length;

   if (doc.children.length === 0) {
      warnings.push({ code: 'empty_document', message: 'The document has no blocks' });
   }
   if (context.linkCount.value > 50) {
      warnings.push({
         code: 'too_many_links',
         message: `The message contains ${context.linkCount.value} links`,
      });
   }
   if (!opts.unsubscribeUrl && !JSON.stringify(doc).includes('{{ links.unsubscribe }}')) {
      warnings.push({
         code: 'unsubscribe_missing',
         message: 'No unsubscribe URL or merge tag is present',
      });
   }
   if (bytes > GMAIL_CLIP_BYTES) {
      warnings.push({
         code: 'message_too_large',
         message: `The message is ${bytes} bytes, above the ${GMAIL_CLIP_BYTES} byte Gmail clip`,
      });
   }

   return { html, text, bytes, warnings };
}

export const GMAIL_CLIP_BYTES = 102_400;
