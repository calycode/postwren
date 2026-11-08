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
   };
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
]);

const FILTERS = new Set(['default', 'upper', 'lower', 'trim', 'date']);
const TAG = /\{\{([\s\S]*?)\}\}/g;
const FILTER_SYNTAX =
   /^([a-zA-Z_][a-zA-Z0-9_]*)\s*(?:\(\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)')\s*\))?$/;
const META_KEY = /^[a-z][a-z0-9_]{0,63}$/;
const SUBSCRIBER_META_PREFIX = 'subscriber.meta.';
const CAMPAIGN_META_PREFIX = 'campaign.meta.';
const AUTOMATION_META_PREFIX = 'automation.meta.';

type Filter = { name: string; arg?: string };
type Parsed = { path: string; filters: Filter[] } | { error: string };

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
   if (!PATHS.has(path) && metaKeyOf(path) === null) {
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

function readPath(ctx: MergeContext, path: string): string {
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
         if (!/^-?\d+(?:\.\d+)?$/.test(trimmed)) return value;
         return formatDate(Number(trimmed), filter.arg ?? '');
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
      default:
         return;
   }
}

export function applyMergeTags(doc: Document, ctx: MergeContext): Document {
   const clone = JSON.parse(JSON.stringify(doc)) as Document;
   for (const block of clone.children) {
      applyToBlock(block, ctx);
   }
   return clone;
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
