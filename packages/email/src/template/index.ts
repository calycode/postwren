import type { Block, Document } from '../ir/types';

export type MergeContext = {
   subscriber: {
      id: string;
      email: string;
      first_name: string | null;
      last_name: string | null;
      tags: string[];
      meta: Record<string, string>;
   };
   campaign: {
      id: string;
      subject: string;
      utm_campaign: string;
      meta: Record<string, string>;
   };
   automation?: {
      id: string;
      meta: Record<string, string>;
   };
   links: {
      unsubscribe: string;
      web?: string;
   };
   /** Structured campaign data, keyed by repeat block `data`. */
   data?: Record<string, unknown>;
   /** Preview uses repeat samples when real data is absent; a send never does. */
   preview?: boolean;
   /** Scope for one repeated item. Set during expansion. */
   item?: Record<string, unknown>;
   itemIndex?: number;
};

export type TemplateValidation = {
   ok: boolean;
   errors: string[];
};

const PATHS = new Set([
   'subscriber.id',
   'subscriber.email',
   'subscriber.first_name',
   'subscriber.last_name',
   'subscriber.tags',
   'campaign.id',
   'campaign.subject',
   'campaign.utm_campaign',
   'automation.id',
   'links.unsubscribe',
   'links.web',
   'itemIndex',
   'itemIndex1',
]);

const FILTERS = new Set(['default', 'upper', 'lower', 'trim', 'date']);
const TAG = /\{\{([\s\S]*?)\}\}/g;
const FILTER_SYNTAX =
   /^([a-zA-Z_][a-zA-Z0-9_]*)\s*(?:\(\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)')\s*\))?$/;
const META_KEY = /^[a-z][a-z0-9_]{0,63}$/;
const SUBSCRIBER_META_PREFIX = 'subscriber.meta.';
const CAMPAIGN_META_PREFIX = 'campaign.meta.';
const AUTOMATION_META_PREFIX = 'automation.meta.';
const ITEM_PREFIX = 'item.';

type Filter = { name: string; arg?: string };
type Parsed = { path: string; filters: Filter[] } | { error: string };

function itemKeyOf(path: string): string | null {
   if (!path.startsWith(ITEM_PREFIX)) return null;
   const key = path.slice(ITEM_PREFIX.length);
   return META_KEY.test(key) ? key : null;
}

function metaKeyOf(path: string): string | null {
   if (path.startsWith(SUBSCRIBER_META_PREFIX)) {
      const key = path.slice(SUBSCRIBER_META_PREFIX.length);
      return META_KEY.test(key) ? key : null;
   }
   if (path.startsWith(CAMPAIGN_META_PREFIX)) {
      const key = path.slice(CAMPAIGN_META_PREFIX.length);
      return META_KEY.test(key) ? key : null;
   }
   if (path.startsWith(AUTOMATION_META_PREFIX)) {
      const key = path.slice(AUTOMATION_META_PREFIX.length);
      return META_KEY.test(key) ? key : null;
   }
   return null;
}

function unescapeArgument(value: string): string {
   return value.replace(/\\(["'\\])/g, '$1');
}

function parseExpression(expression: string): Parsed {
   const segments = expression.split('|').map((segment) => segment.trim());
   const path = segments[0] ?? '';

   if (path.length === 0) return { error: 'Missing merge path' };
   if (!PATHS.has(path) && metaKeyOf(path) === null && itemKeyOf(path) === null) {
      return { error: `Unknown merge path "${path}"` };
   }

   const filters: Filter[] = [];
   for (const segment of segments.slice(1)) {
      if (segment.length === 0) return { error: 'Empty filter in merge expression' };

      const match = FILTER_SYNTAX.exec(segment);
      if (!match) return { error: `Malformed filter "${segment}"` };

      const name = match[1] ?? '';
      if (!FILTERS.has(name)) return { error: `Unknown filter "${name}"` };

      const raw = match[2] ?? match[3];
      const arg = raw === undefined ? undefined : unescapeArgument(raw);

      if ((name === 'default' || name === 'date') && arg === undefined) {
         return { error: `Filter "${name}" requires an argument` };
      }
      if ((name === 'upper' || name === 'lower' || name === 'trim') && arg !== undefined) {
         return { error: `Filter "${name}" does not take an argument` };
      }

      filters.push(arg === undefined ? { name } : { name, arg });
   }

   return { path, filters };
}

function scalarString(value: unknown): string {
   if (typeof value === 'string') return value;
   if (typeof value === 'number' && Number.isFinite(value)) return String(value);
   if (typeof value === 'boolean') return value ? 'true' : 'false';
   return '';
}

function readPath(ctx: MergeContext, path: string): string {
   if (path.startsWith(ITEM_PREFIX)) {
      return scalarString(ctx.item?.[path.slice(ITEM_PREFIX.length)]);
   }
   if (path.startsWith(SUBSCRIBER_META_PREFIX)) {
      return ctx.subscriber.meta[path.slice(SUBSCRIBER_META_PREFIX.length)] ?? '';
   }
   if (path.startsWith(CAMPAIGN_META_PREFIX)) {
      const key = path.slice(CAMPAIGN_META_PREFIX.length);
      return ctx.campaign.meta[key] ?? ctx.automation?.meta[key] ?? '';
   }
   if (path.startsWith(AUTOMATION_META_PREFIX)) {
      return ctx.automation?.meta[path.slice(AUTOMATION_META_PREFIX.length)] ?? '';
   }

   switch (path) {
      case 'subscriber.id':
         return ctx.subscriber.id;
      case 'subscriber.email':
         return ctx.subscriber.email;
      case 'subscriber.first_name':
         return ctx.subscriber.first_name ?? '';
      case 'subscriber.last_name':
         return ctx.subscriber.last_name ?? '';
      case 'subscriber.tags':
         return ctx.subscriber.tags.join(', ');
      case 'campaign.id':
         return ctx.campaign.id;
      case 'campaign.subject':
         return ctx.campaign.subject;
      case 'campaign.utm_campaign':
         return ctx.campaign.utm_campaign;
      case 'automation.id':
         return ctx.automation?.id ?? '';
      case 'links.unsubscribe':
         return ctx.links.unsubscribe;
      case 'links.web':
         return ctx.links.web ?? '';
      case 'itemIndex':
         return ctx.itemIndex === undefined ? '' : String(ctx.itemIndex);
      case 'itemIndex1':
         return ctx.itemIndex === undefined ? '' : String(ctx.itemIndex + 1);
      default:
         return '';
   }
}

function formatDate(seconds: number, format: string): string {
   const date = new Date(seconds * 1000);
   if (Number.isNaN(date.getTime())) return String(seconds);

   const values: Record<string, string> = {
      YYYY: String(date.getUTCFullYear()).padStart(4, '0'),
      MM: String(date.getUTCMonth() + 1).padStart(2, '0'),
      DD: String(date.getUTCDate()).padStart(2, '0'),
      HH: String(date.getUTCHours()).padStart(2, '0'),
      mm: String(date.getUTCMinutes()).padStart(2, '0'),
   };

   return format.replace(/YYYY|MM|DD|HH|mm/g, (token) => values[token] ?? token);
}

function applyFilter(value: string, filter: Filter): string {
   switch (filter.name) {
      case 'default':
         return value.length === 0 ? (filter.arg ?? '') : value;
      case 'upper':
         return value.toUpperCase();
      case 'lower':
         return value.toLowerCase();
      case 'trim':
         return value.trim();
      case 'date': {
         const trimmed = value.trim();
         if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) {
            return formatDate(Number(trimmed), filter.arg ?? '');
         }
         const parsed = Date.parse(trimmed);
         return Number.isNaN(parsed) ? value : formatDate(parsed / 1000, filter.arg ?? '');
      }
      default:
         return value;
   }
}

function evaluate(parsed: Extract<Parsed, { path: string }>, ctx: MergeContext): string {
   let value = readPath(ctx, parsed.path);
   for (const filter of parsed.filters) {
      value = applyFilter(value, filter);
   }
   return value;
}

function escapeHtml(value: string): string {
   return value
      .replace(/&(?!(?:[a-zA-Z][a-zA-Z0-9]*|#\d+|#x[0-9a-fA-F]+);)/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
}

function substituteText(value: string, ctx: MergeContext): string {
   return value.replace(TAG, (whole, expression: string) => {
      const parsed = parseExpression(expression);
      if ('error' in parsed) throw new Error(`Invalid merge tag ${whole}: ${parsed.error}`);
      return escapeHtml(evaluate(parsed, ctx));
   });
}

function isHttpsUrl(value: string): boolean {
   try {
      const url = new URL(value);
      return url.protocol === 'https:' && url.hostname.length > 0;
   } catch {
      return false;
   }
}

function substituteHref(value: string, ctx: MergeContext): string {
   let changed = false;
   const substituted = value.replace(TAG, (whole, expression: string) => {
      const parsed = parseExpression(expression);
      if ('error' in parsed) throw new Error(`Invalid merge tag ${whole}: ${parsed.error}`);
      changed = true;
      return encodeURI(evaluate(parsed, ctx));
   });

   if (changed && !isHttpsUrl(substituted)) {
      throw new Error(`Merged href is not an absolute https URL: ${substituted}`);
   }

   return substituted;
}

function applyToBlock(block: Block, ctx: MergeContext): void {
   switch (block.type) {
      case 'heading':
         block.text = substituteText(block.text, ctx);
         return;
      case 'text':
      case 'markdown':
         block.text = substituteText(block.text, ctx);
         return;
      case 'button':
         block.text = substituteText(block.text, ctx);
         block.href = substituteHref(block.href, ctx);
         return;
      case 'image':
         block.alt = substituteText(block.alt, ctx);
         if (block.href !== undefined) block.href = substituteHref(block.href, ctx);
         return;
      case 'columns':
         for (const column of block.columns) {
            for (const child of column.blocks) applyToBlock(child, ctx);
         }
         return;
      case 'list':
         block.items = substituteText(block.items, ctx);
         return;
      case 'quote':
         block.text = substituteText(block.text, ctx);
         if (block.attribution !== undefined) {
            block.attribution = substituteText(block.attribution, ctx);
         }
         return;
      case 'code':
         block.text = substituteText(block.text, ctx);
         return;
      case 'link':
         block.text = substituteText(block.text, ctx);
         block.href = substituteHref(block.href, ctx);
         return;
      case 'avatar':
         if (block.name !== undefined) block.name = substituteText(block.name, ctx);
         if (block.caption !== undefined) block.caption = substituteText(block.caption, ctx);
         if (block.href !== undefined) block.href = substituteHref(block.href, ctx);
         return;
      case 'gallery':
         for (const image of block.images) {
            image.alt = substituteText(image.alt, ctx);
            if (image.href !== undefined) image.href = substituteHref(image.href, ctx);
         }
         return;
      case 'table':
         block.header = substituteText(block.header, ctx);
         block.rows = substituteText(block.rows, ctx);
         return;
      case 'section':
         for (const child of block.children) applyToBlock(child, ctx);
         return;
      case 'repeat':
         // A repeat should have been expanded before this point. Rendering its
         // children once is the safe fallback for a hand-written document.
         for (const child of block.children) applyToBlock(child, ctx);
         return;
      default:
         return;
   }
}

function recordOf(value: unknown): Record<string, unknown> | null {
   return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
}

function reidBlock(block: Block, suffix: string): Block {
   const copy = JSON.parse(JSON.stringify(block)) as Block;
   const rename = (candidate: Block): Block => {
      const next = { ...candidate, id: `${candidate.id}:${suffix}` } as Block;
      if (next.type === 'columns') {
         next.columns = next.columns.map((column) => ({
            ...column,
            blocks: column.blocks.map((child) => rename(child) as typeof child),
         }));
      } else if (next.type === 'section' || next.type === 'repeat') {
         next.children = next.children.map(rename);
      }
      return next;
   };
   return rename(copy);
}

function expandRepeat(block: Extract<Block, { type: 'repeat' }>, ctx: MergeContext): Block[] {
   const configured = ctx.data?.[block.data];
   const source = Array.isArray(configured)
      ? configured
      : ctx.preview === true
        ? (block.sample ?? [])
        : [];

   const seen = new Set<string>();
   const expanded: Block[] = [];

   for (let index = 0; index < source.length && index < 50; index += 1) {
      const item = recordOf(source[index]);
      if (item === null) continue;

      let suffix = block.itemKey === undefined ? '' : scalarString(item[block.itemKey]);
      if (suffix.length === 0 || seen.has(suffix)) suffix = `#${index}`;
      while (seen.has(suffix)) suffix = `${suffix}_`;
      seen.add(suffix);

      const itemCtx: MergeContext = { ...ctx, item, itemIndex: index };
      for (const child of block.children) {
         // The editor keeps the template ids so a canvas click selects the
         // source block. Real sends use unique ids per item for analytics.
         const rewritten =
            ctx.preview === true
               ? (JSON.parse(JSON.stringify(child)) as Block)
               : reidBlock(child, suffix);
         applyToBlock(rewritten, itemCtx);
         expanded.push(rewritten);
      }
   }

   return expanded;
}

export function applyMergeTags(doc: Document, ctx: MergeContext): Document {
   const clone = JSON.parse(JSON.stringify(doc)) as Document;
   const children: Block[] = [];

   for (const block of clone.children) {
      if (block.type === 'repeat') {
         children.push(...expandRepeat(block, ctx));
         continue;
      }
      applyToBlock(block, ctx);
      children.push(block);
   }

   return { ...clone, children };
}

export function validateTemplate(text: string): TemplateValidation {
   const errors: string[] = [];

   for (const match of text.matchAll(TAG)) {
      const expression = match[1] ?? '';
      const parsed = parseExpression(expression);
      if ('error' in parsed) errors.push(parsed.error);
   }

   const withoutTags = text.replace(TAG, '');
   if (withoutTags.includes('{{') || withoutTags.includes('}}')) {
      errors.push('Unbalanced braces in template');
   }

   return { ok: errors.length === 0, errors };
}

export function findMergeTags(text: string): string[] {
   const found: string[] = [];
   for (const match of text.matchAll(TAG)) {
      const expression = (match[1] ?? '').trim();
      if (!found.includes(expression)) found.push(expression);
   }
   return found;
}
