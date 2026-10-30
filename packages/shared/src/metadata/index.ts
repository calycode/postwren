import { z } from 'zod';

export const METADATA_KEY_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;
export const MAX_METADATA_KEYS = 50;
export const MAX_METADATA_VALUE_LENGTH = 1024;
export const RESERVED_METADATA_KEYS = [
   'id',
   'email',
   'first_name',
   'last_name',
   'status',
   'tags',
] as const;

export type MetadataRecord = Record<string, string>;
export type MetadataPatch = Record<string, string | null>;

function isReserved(key: string): boolean {
   return (RESERVED_METADATA_KEYS as readonly string[]).includes(key);
}

export function metadataKeyError(key: string): string | null {
   if (key.length === 0) return 'Metadata keys are required';
   if (!METADATA_KEY_PATTERN.test(key)) {
      return `Invalid metadata key "${key}": use lowercase letters, digits and underscores, starting with a letter`;
   }
   if (isReserved(key)) {
      return `"${key}" is reserved and cannot be used as a metadata key`;
   }
   return null;
}

export function metadataErrors(metadata: Record<string, unknown>): string[] {
   const errors: string[] = [];
   const keys = Object.keys(metadata);

   if (keys.length > MAX_METADATA_KEYS) {
      errors.push(`At most ${MAX_METADATA_KEYS} metadata keys are allowed`);
   }

   for (const key of keys) {
      const keyError = metadataKeyError(key);
      if (keyError !== null) errors.push(keyError);

      const value = metadata[key];
      if (typeof value === 'string' && value.length > MAX_METADATA_VALUE_LENGTH) {
         errors.push(
            `Metadata value for "${key}" must be at most ${MAX_METADATA_VALUE_LENGTH} characters`,
         );
      }
   }

   return errors;
}

function keySchema() {
   return z.string().superRefine((key, ctx) => {
      const error = metadataKeyError(key);
      if (error !== null) {
         ctx.addIssue({ code: z.ZodIssueCode.custom, message: error });
      }
   });
}

function valueSchema(): z.ZodString {
   return z
      .string()
      .max(
         MAX_METADATA_VALUE_LENGTH,
         `Metadata values must be at most ${MAX_METADATA_VALUE_LENGTH} characters`,
      );
}

function keyCountIssue(value: Record<string, unknown>, ctx: z.RefinementCtx): void {
   if (Object.keys(value).length > MAX_METADATA_KEYS) {
      ctx.addIssue({
         code: z.ZodIssueCode.custom,
         message: `At most ${MAX_METADATA_KEYS} metadata keys are allowed`,
      });
   }
}

export const metadataRecord = z
   .record(keySchema(), valueSchema())
   .superRefine((value, ctx) => keyCountIssue(value, ctx));

export const metadataPatch = z
   .record(keySchema(), valueSchema().nullable())
   .superRefine((value, ctx) => keyCountIssue(value, ctx));

export function parseMetadataJson(value: string | null | undefined): MetadataRecord {
   if (value === null || value === undefined || value.length === 0) return {};

   try {
      const parsed: unknown = JSON.parse(value);
      return recordOfStrings(parsed);
   } catch {
      return {};
   }
}

export function serialiseMetadata(metadata: MetadataRecord): string {
   return JSON.stringify(metadata);
}

export function recordOfStrings(value: unknown): MetadataRecord {
   if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};

   const record: MetadataRecord = {};
   for (const [key, entry] of Object.entries(value)) {
      if (typeof entry === 'string') record[key] = entry;
   }
   return record;
}

export function mergeMetadata(current: MetadataRecord, patch: MetadataPatch): MetadataRecord {
   const merged: MetadataRecord = { ...current };

   for (const [key, value] of Object.entries(patch)) {
      if (value === null) {
         delete merged[key];
      } else {
         merged[key] = value;
      }
   }

   return merged;
}
