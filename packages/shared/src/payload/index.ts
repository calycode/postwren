/**
 * Structured campaign data, used by repeat blocks. The shape is deliberately
 * shallow: a map of named lists of flat items. No nested objects, expressions or
 * arbitrary JSON in v1.
 */

export const PAYLOAD_MAX_BYTES = 128 * 1024;
export const PAYLOAD_MAX_COLLECTIONS = 10;
export const PAYLOAD_MAX_ITEMS = 50;
export const PAYLOAD_MAX_ITEM_KEYS = 50;
export const PAYLOAD_MAX_STRING = 4000;

export type PayloadScalar = string | number | boolean | null;
export type PayloadItem = Record<string, PayloadScalar>;
export type PayloadData = Record<string, PayloadItem[]>;

export type PayloadResult = { ok: true; data: PayloadData } | { ok: false; errors: string[] };

const KEY = /^[a-z][a-z0-9_]{0,63}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
   return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function scalarError(value: unknown): string | null {
   if (value === null) return null;
   if (typeof value === 'boolean') return null;
   if (typeof value === 'number') return Number.isFinite(value) ? null : 'Numbers must be finite';
   if (typeof value === 'string') {
      return value.length <= PAYLOAD_MAX_STRING
         ? null
         : `Strings must be at most ${PAYLOAD_MAX_STRING} characters`;
   }
   return 'Values must be a string, number, boolean or null';
}

export function parsePayload(value: unknown): PayloadResult {
   if (!isRecord(value)) return { ok: false, errors: ['Data must be a JSON object'] };

   let bytes = 0;
   try {
      bytes = new TextEncoder().encode(JSON.stringify(value)).length;
   } catch {
      return { ok: false, errors: ['Data must be serialisable'] };
   }
   if (bytes > PAYLOAD_MAX_BYTES) {
      return { ok: false, errors: [`Data must be at most ${PAYLOAD_MAX_BYTES} bytes`] };
   }

   const errors: string[] = [];
   const data: PayloadData = {};
   const collections = Object.entries(value);

   if (collections.length > PAYLOAD_MAX_COLLECTIONS) {
      errors.push(`At most ${PAYLOAD_MAX_COLLECTIONS} data collections are allowed`);
   }

   for (const [key, collection] of collections) {
      if (!KEY.test(key)) {
         errors.push(`Invalid collection key "${key}"`);
         continue;
      }
      if (!Array.isArray(collection)) {
         errors.push(`"${key}" must be an array of objects`);
         continue;
      }
      if (collection.length > PAYLOAD_MAX_ITEMS) {
         errors.push(`"${key}" may contain at most ${PAYLOAD_MAX_ITEMS} items`);
      }

      const items: PayloadItem[] = [];
      for (const [index, item] of collection.entries()) {
         if (!isRecord(item)) {
            errors.push(`"${key}[${index}]" must be an object`);
            continue;
         }
         const keys = Object.keys(item);
         if (keys.length > PAYLOAD_MAX_ITEM_KEYS) {
            errors.push(`"${key}[${index}]" may have at most ${PAYLOAD_MAX_ITEM_KEYS} fields`);
         }

         const output: PayloadItem = {};
         for (const [itemKey, itemValue] of Object.entries(item)) {
            if (!KEY.test(itemKey)) {
               errors.push(`Invalid field "${key}[${index}].${itemKey}"`);
               continue;
            }
            const issue = scalarError(itemValue);
            if (issue !== null) {
               errors.push(`"${key}[${index}].${itemKey}": ${issue}`);
               continue;
            }
            output[itemKey] = itemValue as PayloadScalar;
         }
         items.push(output);
      }
      data[key] = items;
   }

   return errors.length > 0 ? { ok: false, errors } : { ok: true, data };
}

/** Best-effort read of a stored payload; a corrupt row renders as empty data. */
export function parsePayloadJson(value: string | null | undefined): PayloadData {
   if (value === null || value === undefined || value.trim().length === 0) return {};
   try {
      const parsed: unknown = JSON.parse(value);
      const result = parsePayload(parsed);
      return result.ok ? result.data : {};
   } catch {
      return {};
   }
}
