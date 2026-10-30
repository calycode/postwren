import type { Column, Spacing } from '@postwren/email/ir';
import { validateTemplate } from '@postwren/email/template';

export const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export const IR_BOUNDS = {
   fontSize: { min: 8, max: 72 },
   lineHeight: { min: 8, max: 120 },
   spacing: { min: 0, max: 96 },
   imageWidth: { min: 1, max: 600 },
   dividerThickness: { min: 0, max: 24 },
   dividerWidth: { min: 10, max: 100 },
   spacerHeight: { min: 0, max: 200 },
   socialIconSize: { min: 12, max: 48 },
   innerPadding: { min: 0, max: 96 },
   columnWidth: { min: 1, max: 99 },
} as const;

export function isHexColor(value: string): boolean {
   return HEX_COLOR.test(value);
}

export function normaliseHex(value: string, fallback: string): string {
   const trimmed = value.trim();
   return HEX_COLOR.test(trimmed) ? trimmed : fallback;
}

export function clampNumber(value: number, min: number, max: number, fallback = min): number {
   if (!Number.isFinite(value)) return Math.round(fallback);
   return Math.min(max, Math.max(min, Math.round(value)));
}

export function parseNumber(value: string, min: number, max: number, fallback = min): number {
   const trimmed = value.trim();
   if (trimmed.length === 0) return Math.round(fallback);
   const numeric = Number(trimmed);
   return clampNumber(numeric, min, max, fallback);
}

export function clampSpacing(spacing: Spacing): Spacing {
   const { min, max } = IR_BOUNDS.spacing;
   return {
      top: clampNumber(spacing.top, min, max),
      right: clampNumber(spacing.right, min, max),
      bottom: clampNumber(spacing.bottom, min, max),
      left: clampNumber(spacing.left, min, max),
   };
}

export function distributeColumnWidths(
   columns: Column[],
   index: number,
   widthPercent: number,
): Column[] {
   const target = columns[index];
   if (!target || columns.length === 0) return columns;

   const others = columns.length - 1;
   const { min, max } = IR_BOUNDS.columnWidth;
   const edited = clampNumber(widthPercent, min, Math.min(max, 100 - others), target.widthPercent);
   const remaining = 100 - edited;
   const base = Math.floor(remaining / others);
   const extra = remaining - base * others;

   let seen = 0;
   return columns.map((column, columnIndex) => {
      if (columnIndex === index) {
         return { ...column, widthPercent: edited };
      }
      const widthPercentForColumn = base + (seen < extra ? 1 : 0);
      seen += 1;
      return { ...column, widthPercent: widthPercentForColumn };
   });
}

function isHttpsUrl(value: string): boolean {
   try {
      const url = new URL(value.trim());
      return url.protocol === 'https:' && url.hostname.length > 0;
   } catch {
      return false;
   }
}

function isLocalDevUrl(value: string): boolean {
   try {
      const url = new URL(value.trim());
      if (url.protocol !== 'http:') return false;
      return url.hostname === 'localhost' || url.hostname === '127.0.0.1';
   } catch {
      return false;
   }
}

function isStaticHref(value: string): boolean {
   if (value.startsWith('mailto:')) {
      const address = value.slice('mailto:'.length).split('?')[0] ?? '';
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address);
   }
   return isHttpsUrl(value);
}

export function isHttpsUrlValue(value: string): boolean {
   return isHttpsUrl(value) || isLocalDevUrl(value);
}

export function hrefIssue(value: string): string | undefined {
   const trimmed = value.trim();
   if (trimmed.length === 0) return 'Link is required';

   const tags = trimmed.match(/\{\{[\s\S]*?\}\}/g);
   if (!tags) {
      return isStaticHref(trimmed) ? undefined : 'Use an https:// or mailto: link';
   }

   const validation = validateTemplate(trimmed);
   if (!validation.ok) return validation.errors[0] ?? 'Invalid merge tag';
   if (/^\{\{[\s\S]*?\}\}$/.test(trimmed)) return undefined;

   const replaced = trimmed.replace(/\{\{[\s\S]*?\}\}/g, 'merge');
   return isStaticHref(replaced) ? undefined : 'Use an https:// or mailto: link';
}

export function imageSrcIssue(value: string): string | undefined {
   if (value.trim().length === 0) return 'Image URL is required';
   return isHttpsUrl(value) || isLocalDevUrl(value) ? undefined : 'Use an absolute https URL';
}

export function insertAtCaret(
   value: string,
   insertion: string,
   start: number,
   end: number,
): { value: string; caret: number } {
   const from = Math.max(0, Math.min(start, value.length));
   const to = Math.max(from, Math.min(end, value.length));
   return {
      value: value.slice(0, from) + insertion + value.slice(to),
      caret: from + insertion.length,
   };
}

export function mergeTagInsertion(path: string): string {
   return `{{ ${path} }}`;
}

export function unsubscribeInsertion(kind: 'text' | 'href'): string {
   return kind === 'href'
      ? mergeTagInsertion('links.unsubscribe')
      : '[Unsubscribe]({{ links.unsubscribe }})';
}
