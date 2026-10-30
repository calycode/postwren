import {
   MAX_METADATA_KEYS,
   MAX_METADATA_VALUE_LENGTH,
   metadataKeyError,
} from '@mailer/shared/metadata';

export type MetadataRow = { key: string; value: string };

export type MetadataRowIssues = {
   rowErrors: (string | undefined)[];
   general?: string;
};

export function metadataToRows(metadata: Record<string, string> | undefined): MetadataRow[] {
   return Object.entries(metadata ?? {}).map(([key, value]) => ({ key, value }));
}

export function validateMetadataRows(rows: MetadataRow[]): MetadataRowIssues {
   const rowErrors: (string | undefined)[] = rows.map(() => undefined);
   const keys = new Map<string, number[]>();

   rows.forEach((row, index) => {
      const key = row.key.trim();

      if (key.length === 0) {
         if (row.value.length > 0) rowErrors[index] = 'Enter a key for this value.';
         return;
      }

      const keyError = metadataKeyError(key);
      if (keyError !== null) rowErrors[index] = keyError;

      if (row.value.length > MAX_METADATA_VALUE_LENGTH) {
         rowErrors[index] = `Value must be at most ${MAX_METADATA_VALUE_LENGTH} characters.`;
      }

      const indexes = keys.get(key) ?? [];
      indexes.push(index);
      keys.set(key, indexes);
   });

   for (const [key, indexes] of keys) {
      if (indexes.length > 1) {
         for (const index of indexes) {
            rowErrors[index] = `"${key}" is used more than once.`;
         }
      }
   }

   const populated = rows.filter((row) => row.key.trim().length > 0).length;
   const general =
      populated > MAX_METADATA_KEYS
         ? `At most ${MAX_METADATA_KEYS} custom fields are allowed.`
         : undefined;

   return { rowErrors, ...(general === undefined ? {} : { general }) };
}

export function rowsToMetadata(rows: MetadataRow[]): Record<string, string> {
   const metadata: Record<string, string> = {};

   for (const row of rows) {
      const key = row.key.trim();
      if (key.length > 0) metadata[key] = row.value;
   }

   return metadata;
}

export function metadataPatchFromRows(
   saved: Record<string, string>,
   rows: MetadataRow[],
): Record<string, string | null> {
   const metadata: Record<string, string | null> = {};
   const current = rowsToMetadata(rows);

   for (const [key, value] of Object.entries(current)) metadata[key] = value;

   for (const key of Object.keys(saved)) {
      if (!(key in current)) metadata[key] = null;
   }

   return metadata;
}
