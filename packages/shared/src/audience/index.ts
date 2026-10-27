export type CompiledAudience = { sql: string; params: string[] };

const MAX_TERMS_PER_SIDE = 10;
const MAX_TAG_LENGTH = 64;
const TAG_PATTERN = /^[a-z0-9._-]+$/;
const SUPPRESSION = "s.status = 'subscribed' AND s.deleted_at IS NULL";

const EXISTS_TEMPLATE =
   'EXISTS (SELECT 1 FROM subscriber_tags st JOIN tags t ON t.id = st.tag_id WHERE st.subscriber_id = s.id AND t.name = ?)';
const NOT_EXISTS_TEMPLATE =
   'NOT EXISTS (SELECT 1 FROM subscriber_tags st JOIN tags t ON t.id = st.tag_id WHERE st.subscriber_id = s.id AND t.name = ?)';

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

export function parseAudienceQuery(query: string): { include: string[]; exclude: string[] } {
   const include: string[] = [];
   const exclude: string[] = [];
   const seen = new Set<string>();

   for (const term of query.trim().split(/\s+/)) {
      if (term.length === 0) continue;

      const negated = term.startsWith('-');
      const body = negated ? term.slice(1) : term;
      const separator = body.indexOf(':');

      if (separator === -1) {
         throw new AudienceError(`Expected "tag:name", got "${term}"`);
      }

      const operator = body.slice(0, separator).toLowerCase();
      if (operator !== 'tag') {
         throw new AudienceError(`Unknown operator "${operator}"`);
      }

      const tag = normaliseTag(body.slice(separator + 1));

      if (seen.has(tag)) {
         throw new AudienceError(`Duplicate tag "${tag}"`);
      }
      seen.add(tag);

      if (negated) {
         exclude.push(tag);
      } else {
         include.push(tag);
      }
   }

   if (include.length > MAX_TERMS_PER_SIDE) {
      throw new AudienceError(`At most ${MAX_TERMS_PER_SIDE} include tags are allowed`);
   }
   if (exclude.length > MAX_TERMS_PER_SIDE) {
      throw new AudienceError(`At most ${MAX_TERMS_PER_SIDE} exclude tags are allowed`);
   }

   return { include, exclude };
}

export function compileAudience(query: string): CompiledAudience {
   const { include, exclude } = parseAudienceQuery(query);

   const clauses = [
      SUPPRESSION,
      ...include.map(() => EXISTS_TEMPLATE),
      ...exclude.map(() => NOT_EXISTS_TEMPLATE),
   ];

   return {
      sql: clauses.join(' AND '),
      params: [...include, ...exclude],
   };
}
