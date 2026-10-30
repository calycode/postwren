export type CompiledAudience = { sql: string; params: string[] };

export type MetaTerm = { key: string; value: string };

export type ParsedAudienceQuery = {
   include: string[];
   exclude: string[];
   metaInclude: MetaTerm[];
   metaExclude: MetaTerm[];
};

const MAX_TERMS_PER_SIDE = 10;
const MAX_TAG_LENGTH = 64;
const MAX_METADATA_VALUE_LENGTH = 1024;
const TAG_PATTERN = /^[a-z0-9._-]+$/;
const METADATA_KEY_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;
const SUPPRESSION = "s.status = 'subscribed' AND s.deleted_at IS NULL";

const EXISTS_TEMPLATE =
   'EXISTS (SELECT 1 FROM subscriber_tags st JOIN tags t ON t.id = st.tag_id WHERE st.subscriber_id = s.id AND t.name = ?)';
const NOT_EXISTS_TEMPLATE =
   'NOT EXISTS (SELECT 1 FROM subscriber_tags st JOIN tags t ON t.id = st.tag_id WHERE st.subscriber_id = s.id AND t.name = ?)';
const META_EXISTS_TEMPLATE =
   'EXISTS (SELECT 1 FROM subscriber_metadata sm WHERE sm.subscriber_id = s.id AND sm.key = ? AND sm.value = ?)';
const META_NOT_EXISTS_TEMPLATE =
   'NOT EXISTS (SELECT 1 FROM subscriber_metadata sm WHERE sm.subscriber_id = s.id AND sm.key = ? AND sm.value = ?)';

export class AudienceError extends Error {
   constructor(message?: string) {
      super(message);
      this.name = 'AudienceError';
   }
}

function normaliseTag(value: string): string {
   const normalised = value.trim().toLowerCase().replace(/\s+/g, ' ');
   if (normalised.length === 0) {
      throw new AudienceError('Tag name is required');
   }
   if (normalised.length > MAX_TAG_LENGTH) {
      throw new AudienceError(`Tag name must be at most ${MAX_TAG_LENGTH} characters`);
   }
   if (!TAG_PATTERN.test(normalised)) {
      throw new AudienceError(`Invalid tag name: ${value}`);
   }
   return normalised;
}

function normaliseMetaKey(value: string): string {
   if (value.length === 0) {
      throw new AudienceError('Metadata key is required');
   }
   if (!METADATA_KEY_PATTERN.test(value)) {
      throw new AudienceError(`Invalid metadata key: ${value}`);
   }
   return value;
}

function normaliseMetaValue(value: string): string {
   if (value.length === 0) {
      throw new AudienceError('Metadata value is required');
   }
   if (value.length > MAX_METADATA_VALUE_LENGTH) {
      throw new AudienceError(
         `Metadata value must be at most ${MAX_METADATA_VALUE_LENGTH} characters`,
      );
   }
   for (const character of value) {
      const code = character.charCodeAt(0);
      if (code < 32 || code === 127) {
         throw new AudienceError('Metadata value contains control characters');
      }
   }
   return value;
}

function parseMetaTerm(body: string, term: string): MetaTerm {
   const separator = body.indexOf('=');
   if (separator === -1) {
      throw new AudienceError(`Expected "meta:key=value", got "${term}"`);
   }

   return {
      key: normaliseMetaKey(body.slice(0, separator)),
      value: normaliseMetaValue(body.slice(separator + 1)),
   };
}

export function parseAudienceQuery(query: string): ParsedAudienceQuery {
   const include: string[] = [];
   const exclude: string[] = [];
   const metaInclude: MetaTerm[] = [];
   const metaExclude: MetaTerm[] = [];
   const seenTags = new Set<string>();
   const seenMeta = new Set<string>();

   for (const term of query.trim().split(/\s+/)) {
      if (term.length === 0) continue;

      const negated = term.startsWith('-');
      const body = negated ? term.slice(1) : term;
      const separator = body.indexOf(':');

      if (separator === -1) {
         throw new AudienceError(`Expected "tag:name", got "${term}"`);
      }

      const operator = body.slice(0, separator).toLowerCase();

      if (operator === 'tag') {
         const tag = normaliseTag(body.slice(separator + 1));

         if (seenTags.has(tag)) {
            throw new AudienceError(`Duplicate tag "${tag}"`);
         }
         seenTags.add(tag);

         if (negated) exclude.push(tag);
         else include.push(tag);
         continue;
      }

      if (operator === 'meta') {
         const meta = parseMetaTerm(body.slice(separator + 1), term);
         const identity = `${meta.key}=${meta.value}`;

         if (seenMeta.has(identity)) {
            throw new AudienceError(`Duplicate metadata term "${identity}"`);
         }
         seenMeta.add(identity);

         if (negated) metaExclude.push(meta);
         else metaInclude.push(meta);
         continue;
      }

      throw new AudienceError(`Unknown operator "${operator}"`);
   }

   if (include.length > MAX_TERMS_PER_SIDE) {
      throw new AudienceError(`At most ${MAX_TERMS_PER_SIDE} include tags are allowed`);
   }
   if (exclude.length > MAX_TERMS_PER_SIDE) {
      throw new AudienceError(`At most ${MAX_TERMS_PER_SIDE} exclude tags are allowed`);
   }
   if (metaInclude.length > MAX_TERMS_PER_SIDE) {
      throw new AudienceError(`At most ${MAX_TERMS_PER_SIDE} include metadata terms are allowed`);
   }
   if (metaExclude.length > MAX_TERMS_PER_SIDE) {
      throw new AudienceError(`At most ${MAX_TERMS_PER_SIDE} exclude metadata terms are allowed`);
   }

   return { include, exclude, metaInclude, metaExclude };
}

export function compileAudience(query: string): CompiledAudience {
   const { include, exclude, metaInclude, metaExclude } = parseAudienceQuery(query);

   const clauses = [SUPPRESSION];
   const params: string[] = [];

   for (const tag of include) {
      clauses.push(EXISTS_TEMPLATE);
      params.push(tag);
   }

   for (const term of metaInclude) {
      clauses.push(META_EXISTS_TEMPLATE);
      params.push(term.key, term.value);
   }

   for (const tag of exclude) {
      clauses.push(NOT_EXISTS_TEMPLATE);
      params.push(tag);
   }

   for (const term of metaExclude) {
      clauses.push(META_NOT_EXISTS_TEMPLATE);
      params.push(term.key, term.value);
   }

   return { sql: clauses.join(' AND '), params };
}
