import type { ComponentChildren } from 'preact';
import { Field, Input, Tooltip } from '@postwren/ui';
import { Info } from 'lucide-react';
import { TagPicker } from '@/components/tag-picker';
import type { Tag } from '@/lib/api/types';
import { formatNumber } from '@/lib/format';
import type { AudiencePreviewState } from './use-audience-preview';

export type AudienceFieldProps = {
   id: string;
   value: string;
   onChange: (value: string) => void;
   error?: string;
   disabled?: boolean;
   hint?: ComponentChildren;
   label?: ComponentChildren;
   preview?: AudiencePreviewState;
};

function splitTerms(query: string): { include: string[]; exclude: string[] } {
   const include: string[] = [];
   const exclude: string[] = [];

   for (const term of query.trim().split(/\s+/)) {
      if (term.length === 0) continue;
      const negated = term.startsWith('-');
      const body = negated ? term.slice(1) : term;
      if (!body.toLowerCase().startsWith('tag:')) continue;
      const name = body.slice(4);
      if (name.length === 0) continue;
      if (negated) exclude.push(`-tag:${name}`);
      else include.push(name);
   }

   return { include, exclude };
}

function tagsFromQuery(query: string): Tag[] {
   const seen = new Set<string>();
   const tags: Tag[] = [];

   for (const name of splitTerms(query).include) {
      if (seen.has(name)) continue;
      seen.add(name);
      tags.push({ id: name, name, subscriber_count: 0 });
   }

   return tags;
}

function rebuildQuery(tags: Tag[], exclude: string[]): string {
   return [...tags.map((tag) => `tag:${tag.name}`), ...exclude].join(' ');
}

export function AudienceField({
   id,
   value,
   onChange,
   error,
   disabled = false,
   hint,
   label,
   preview,
}: AudienceFieldProps) {
   const tags = tagsFromQuery(value);
   const terms = splitTerms(value);
   const exclusion = terms.exclude;
   const advanced = value.includes('meta:') || exclusion.length > 0;

   return (
      <div className="grid gap-2">
         <Field
            label={
               <span className="inline-flex items-center gap-1.5">
                  {label ?? 'Audience'}
                  <Tooltip
                     content="The tag picker and the query are the same filter, shown two ways. Use the picker for include tags; use the query when you also need to exclude tags or filter on custom fields."
                     tabIndex={0}
                     aria-label="How the audience filter works"
                  >
                     <Info
                        className="size-3.5 text-muted-foreground"
                        aria-hidden="true"
                     />
                  </Tooltip>
               </span>
            }
            htmlFor={id}
            error={error}
            hint={hint ?? 'Leave this empty to send to every active subscriber.'}
         >
            <div className="grid gap-2">
               <div className="grid gap-1">
                  <span className="text-xs font-medium text-muted-foreground">Include tags</span>
                  <TagPicker
                     id={`${id}-tags`}
                     value={tags}
                     onChange={(next) => onChange(rebuildQuery(next, exclusion))}
                     disabled={disabled}
                     placeholder="Add a tag to include…"
                  />
               </div>

               <details
                  open={advanced ? true : undefined}
                  className="rounded-md border border-border px-3 py-2"
               >
                  <summary className="cursor-pointer list-none text-xs font-medium [&::-webkit-details-marker]:hidden">
                     Advanced: edit the query directly
                  </summary>
                  <div className="mt-2 grid gap-1.5">
                     <Input
                        id={id}
                        value={value}
                        disabled={disabled}
                        aria-label="Audience query"
                        placeholder="tag:newsletter -tag:internal meta:plan=pro"
                        aria-invalid={error ? 'true' : undefined}
                        aria-describedby={error ? `${id}-error` : undefined}
                        onInput={(event) => onChange(event.currentTarget.value)}
                     />
                     <p className="text-xs leading-relaxed text-muted-foreground">
                        <code className="rounded bg-muted px-1 py-0.5">tag:newsletter</code>{' '}
                        includes a tag,{' '}
                        <code className="rounded bg-muted px-1 py-0.5">-tag:internal</code> excludes
                        one, and <code className="rounded bg-muted px-1 py-0.5">meta:plan=pro</code>{' '}
                        filters on a custom field.
                     </p>
                  </div>
               </details>
            </div>
         </Field>

         {preview !== undefined && (
            <div
               className="grid gap-1"
               aria-live="polite"
            >
               {preview.error !== null ? (
                  <p
                     role="status"
                     className="text-xs text-destructive"
                  >
                     {preview.error}
                  </p>
               ) : preview.loading ? (
                  <p
                     role="status"
                     className="text-xs text-muted-foreground"
                  >
                     Checking audience…
                  </p>
               ) : preview.count !== null ? (
                  <>
                     <p
                        role="status"
                        className="text-sm text-foreground"
                     >
                        Matches <strong>{formatNumber(preview.count)}</strong>{' '}
                        {preview.count === 1 ? 'subscriber' : 'subscribers'}.
                     </p>
                     <p className="text-xs text-muted-foreground">
                        Suppressed subscribers (unsubscribed, bounced, complained and deleted) are
                        excluded.
                     </p>
                  </>
               ) : null}
            </div>
         )}
      </div>
   );
}
