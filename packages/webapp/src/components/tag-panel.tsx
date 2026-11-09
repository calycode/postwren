import { useEffect, useState } from 'react';
import { Save, Tag as TagIcon } from 'lucide-react';
import { Alert, AlertDescription, Button, Field, Input } from '@postwren/ui';
import { DetailPanel } from '@/components/detail-panel';
import { update as updateTag } from '@/lib/api/tags';
import { ApiError } from '@/lib/api/client';
import type { Tag } from '@/lib/api/types';
import { errorMessage, fieldErrorsFrom } from '@/lib/form-errors';
import type { FieldErrors } from '@/lib/form-errors';
import { formatNumber, pluralise } from '@/lib/format';

export function TagPanel({
   tag,
   onClose,
   onSaved,
   onDeleted,
}: {
   tag: Tag;
   onClose: () => void;
   onSaved: (tag: Tag) => void;
   onDeleted: (tag: Tag) => void;
}) {
   const [name, setName] = useState(tag.name);
   const [saving, setSaving] = useState(false);
   const [error, setError] = useState<string | null>(null);
   const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

   useEffect(() => {
      setName(tag.name);
      setError(null);
      setFieldErrors({});
   }, [tag]);

   async function submit(event: Event) {
      event.preventDefault();
      setError(null);
      setFieldErrors({});

      const next = name.trim();
      if (next.length === 0) {
         setFieldErrors({ name: 'Enter a tag name.' });
         return;
      }

      setSaving(true);
      try {
         onSaved(await updateTag(tag.id, next));
      } catch (cause) {
         setError(errorMessage(cause, 'Could not rename the tag'));
         setFieldErrors(cause instanceof ApiError ? fieldErrorsFrom(cause.details) : {});
      } finally {
         setSaving(false);
      }
   }

   const dirty = name !== tag.name;

   return (
      <DetailPanel
         label={`Tag ${tag.name}`}
         closeLabel="Close tag panel"
         rowKey={tag.id}
         onClose={onClose}
         header={
            <>
               <span className="flex size-10 shrink-0 items-center justify-center rounded-full border border-border bg-accent text-accent-foreground">
                  <TagIcon
                     className="size-4"
                     aria-hidden="true"
                  />
               </span>
               <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{tag.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                     {pluralise(tag.subscriber_count ?? 0, 'subscriber')}
                  </p>
               </div>
            </>
         }
      >
         <form
            className="grid min-w-0 gap-5"
            onSubmit={(event) => void submit(event)}
            noValidate
         >
            <section className="grid min-w-0 gap-3">
               <h2 className="text-sm font-semibold">Details</h2>
               <Field
                  label="Name"
                  htmlFor="tag-panel-name"
                  error={fieldErrors.name}
                  required
               >
                  <Input
                     id="tag-panel-name"
                     value={name}
                     disabled={saving}
                     aria-invalid={fieldErrors.name ? 'true' : undefined}
                     aria-describedby={fieldErrors.name ? 'tag-panel-name-error' : undefined}
                     onInput={(event) => setName(event.currentTarget.value)}
                  />
               </Field>
               <p className="text-xs text-muted-foreground">
                  Renaming rewrites the campaign audiences and automation tag steps that reference
                  this tag, so saved filters keep matching.
               </p>
            </section>

            <dl className="grid grid-cols-3 gap-2 rounded-lg border border-border p-3">
               <div className="grid gap-0.5">
                  <dt className="text-[11px] text-muted-foreground">Subscribers</dt>
                  <dd className="text-base font-medium">
                     {formatNumber(tag.subscriber_count ?? 0)}
                  </dd>
               </div>
               <div className="grid gap-0.5">
                  <dt className="text-[11px] text-muted-foreground">Campaigns</dt>
                  <dd className="text-base font-medium">{formatNumber(tag.campaign_count ?? 0)}</dd>
               </div>
               <div className="grid gap-0.5">
                  <dt className="text-[11px] text-muted-foreground">Automations</dt>
                  <dd className="text-base font-medium">
                     {formatNumber(tag.automation_count ?? 0)}
                  </dd>
               </div>
            </dl>

            {error !== null && (
               <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
               </Alert>
            )}

            <div className="flex items-center justify-between gap-2">
               <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-destructive"
                  disabled={saving}
                  onClick={() => onDeleted(tag)}
               >
                  Delete
               </Button>
               <Button
                  type="submit"
                  size="sm"
                  disabled={saving || !dirty}
               >
                  <Save aria-hidden="true" />
                  {saving ? 'Saving…' : 'Save changes'}
               </Button>
            </div>
         </form>
      </DetailPanel>
   );
}
