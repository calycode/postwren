import type { ComponentChildren } from 'preact';
import { Field, Input } from '@mailer/ui';
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
   preview,
}: AudienceFieldProps) {
   const tags = tagsFromQuery(value);
   const exclusion = splitTerms(value).exclude;

   return (
      <div className="grid gap-2">
         <Field
            label="Audience query"
            htmlFor={id}
            error={error}
            hint={
               hint ??
               'Use tag:name to include a tag and -tag:name to exclude one. Leave empty for every active subscriber.'
            }
         >
            <div className="grid gap-2">
               <Input
                  id={id}
                  value={value}
                  disabled={disabled}
                  placeholder="tag:newsletter -tag:internal"
                  aria-invalid={error ? 'true' : undefined}
                  aria-describedby={error ? `${id}-error` : undefined}
                  onInput={(event) => onChange(event.currentTarget.value)}
               />
               <TagPicker
                  id={`${id}-tags`}
                  value={tags}
                  onChange={(next) => onChange(rebuildQuery(next, exclusion))}
                  disabled={disabled}
                  placeholder="Add a tag filter…"
               />
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
                        Will send to <strong>{formatNumber(preview.count)}</strong>{' '}
                        {preview.count === 1 ? 'subscriber' : 'subscribers'}.
                     </p>
                     <p className="text-xs text-muted-foreground">
                        Suppressed subscribers — unsubscribed, bounced, complained, and deleted —
                        are excluded.
                     </p>
                  </>
               ) : null}
            </div>
         )}
      </div>
   );
}
