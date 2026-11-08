import { Plus, Trash2 } from 'lucide-react';
import { Button, Input, cn } from '@postwren/ui';
import { MAX_METADATA_KEYS, MAX_METADATA_VALUE_LENGTH } from '@postwren/shared/metadata';
import type { MetadataRow } from '@/lib/metadata';
import { validateMetadataRows } from '@/lib/metadata';

export type MetadataEditorProps = {
   idPrefix: string;
   scope: 'subscriber' | 'campaign' | 'automation';
   rows: MetadataRow[];
   onChange: (rows: MetadataRow[]) => void;
   disabled?: boolean;
   /** Stacks the key and value for narrow sidebars. */
   compact?: boolean;
};

export function MetadataEditor({
   idPrefix,
   scope,
   rows,
   onChange,
   disabled = false,
   compact = false,
}: MetadataEditorProps) {
   const issues = validateMetadataRows(rows);
   const example = scope === 'subscriber' ? 'plan' : scope === 'campaign' ? 'edition' : 'stage';

   function updateRow(index: number, patch: Partial<MetadataRow>): void {
      onChange(rows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));
   }

   function removeRow(index: number): void {
      onChange(rows.filter((_, rowIndex) => rowIndex !== index));
   }

   return (
      <div className="grid gap-3">
         <div className="grid gap-3">
            {rows.length === 0 && (
               <p className="text-xs text-muted-foreground">
                  {scope === 'automation'
                     ? 'No custom fields yet. Add one to use it in send steps.'
                     : 'No custom fields yet. Add one to use it in content and audience filters.'}
               </p>
            )}

            {rows.map((row, index) => {
               const error = issues.rowErrors[index];
               const key = row.key.trim().length > 0 ? row.key.trim() : 'key';

               return (
                  <div
                     key={`${idPrefix}-metadata-${index}`}
                     className="grid gap-1"
                  >
                     <div
                        className={cn(
                           'flex flex-col gap-2',
                           !compact && 'sm:flex-row sm:items-start',
                        )}
                     >
                        <div className={cn('grid gap-1', compact ? 'w-full' : 'sm:w-56')}>
                           <label
                              htmlFor={`${idPrefix}-metadata-key-${index}`}
                              className="sr-only"
                           >
                              Custom field key {index + 1}
                           </label>
                           <Input
                              id={`${idPrefix}-metadata-key-${index}`}
                              value={row.key}
                              placeholder={example}
                              disabled={disabled}
                              autoComplete="off"
                              spellcheck={false}
                              className="font-mono text-xs"
                              aria-invalid={error ? 'true' : undefined}
                              aria-describedby={
                                 error ? `${idPrefix}-metadata-key-${index}-error` : undefined
                              }
                              onInput={(event) =>
                                 updateRow(index, { key: event.currentTarget.value })
                              }
                           />
                        </div>

                        <div className="flex flex-1 items-start gap-2">
                           <label
                              htmlFor={`${idPrefix}-metadata-value-${index}`}
                              className="sr-only"
                           >
                              Custom field value {index + 1}
                           </label>
                           <Input
                              id={`${idPrefix}-metadata-value-${index}`}
                              value={row.value}
                              placeholder="Value"
                              disabled={disabled}
                              autoComplete="off"
                              className="flex-1"
                              onInput={(event) =>
                                 updateRow(index, { value: event.currentTarget.value })
                              }
                           />

                           <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              aria-label={`Remove custom field ${index + 1}`}
                              disabled={disabled}
                              onClick={() => removeRow(index)}
                           >
                              <Trash2 aria-hidden="true" />
                           </Button>
                        </div>
                     </div>

                     {error !== undefined && (
                        <p
                           id={`${idPrefix}-metadata-key-${index}-error`}
                           role="alert"
                           className="text-xs font-medium text-destructive"
                        >
                           {error}
                        </p>
                     )}

                     <p className="text-[11px] text-muted-foreground">
                        Used in content as{' '}
                        <code className="rounded bg-muted px-1 py-0.5">
                           {`{{ ${scope}.meta.${key} }}`}
                        </code>
                     </p>
                  </div>
               );
            })}
         </div>

         {issues.general !== undefined && (
            <p
               role="alert"
               className="text-xs font-medium text-destructive"
            >
               {issues.general}
            </p>
         )}

         <div className="flex flex-wrap items-center gap-3">
            <Button
               type="button"
               variant="outline"
               size="sm"
               disabled={disabled || rows.length >= MAX_METADATA_KEYS}
               onClick={() => onChange([...rows, { key: '', value: '' }])}
            >
               <Plus aria-hidden="true" />
               Add field
            </Button>
            <p className="text-xs text-muted-foreground">
               Lowercase letters, digits and underscores. Up to {MAX_METADATA_KEYS} fields,{' '}
               {MAX_METADATA_VALUE_LENGTH} characters each.
            </p>
         </div>
      </div>
   );
}
