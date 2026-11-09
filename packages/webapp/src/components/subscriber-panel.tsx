import { useEffect, useState } from 'react';
import { Activity, Mail, MousePointerClick, Save, Tag as TagIcon } from 'lucide-react';
import { Alert, AlertDescription, Badge, Button, Field, Input, Skeleton } from '@postwren/ui';
import { DetailPanel } from '@/components/detail-panel';
import { MetadataEditor } from '@/components/metadata-editor';
import { TagPicker } from '@/components/tag-picker';
import { activity as loadActivity, addTag, removeTag, update } from '@/lib/api/subscribers';
import type { Subscriber, SubscriberActivity, Tag } from '@/lib/api/types';
import { ApiError } from '@/lib/api/client';
import { errorMessage, fieldErrorsFrom, isEmail } from '@/lib/form-errors';
import type { FieldErrors } from '@/lib/form-errors';
import { formatDateTime, formatNumber, relativeTime, titleCase } from '@/lib/format';
import { metadataPatchFromRows, metadataToRows, rowsToMetadata } from '@/lib/metadata';
import type { MetadataRow } from '@/lib/metadata';
import { applyTagDiff, diffTags, mergeAppliedTags } from '@/lib/tag-diff';
import { tagFailureMessage } from '@/lib/tag-diff';
import type { TagFailure } from '@/lib/tag-diff';

function statusVariant(
   status: Subscriber['status'],
): 'success' | 'secondary' | 'warning' | 'destructive' | 'outline' {
   switch (status) {
      case 'subscribed':
         return 'success';
      case 'bounced':
         return 'warning';
      case 'complained':
         return 'destructive';
      case 'deleted':
         return 'outline';
      case 'unsubscribed':
         return 'secondary';
   }
}

async function saveTagsFor(
   id: string,
   saved: Tag[],
   desired: Tag[],
): Promise<{ saved: Tag[]; failure: TagFailure | null }> {
   const result = await applyTagDiff(diffTags(saved, desired), {
      add: (tagId) => addTag(id, tagId),
      remove: (tagId) => removeTag(id, tagId),
   });

   return { saved: mergeAppliedTags(saved, result), failure: result.failure };
}

/**
 * One panel for everything about a subscriber: details, tags, custom fields and
 * activity. It docks to the right edge of the viewport on wide screens and
 * becomes an overlay drawer below `xl`, so the row action and the row
 * double-click lead to the same place.
 */
export function SubscriberPanel({
   subscriber,
   onClose,
   onSaved,
   onDeleted,
}: {
   subscriber: Subscriber;
   onClose: () => void;
   onSaved: (subscriber: Subscriber) => void;
   onDeleted: (subscriber: Subscriber) => void;
}) {
   const [email, setEmail] = useState(subscriber.email);
   const [firstName, setFirstName] = useState(subscriber.first_name ?? '');
   const [lastName, setLastName] = useState(subscriber.last_name ?? '');
   const [metadataRows, setMetadataRows] = useState<MetadataRow[]>(
      metadataToRows(subscriber.metadata),
   );
   const [savedMetadata, setSavedMetadata] = useState<Record<string, string>>(
      subscriber.metadata ?? {},
   );
   const [tags, setTags] = useState<Tag[]>(subscriber.tags ?? []);
   const [savedTags, setSavedTags] = useState<Tag[]>(subscriber.tags ?? []);

   const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
   const [saveError, setSaveError] = useState<string | null>(null);
   const [saving, setSaving] = useState(false);

   const [activity, setActivity] = useState<SubscriberActivity | null>(null);
   const [activityLoading, setActivityLoading] = useState(true);
   const [activityError, setActivityError] = useState<string | null>(null);

   useEffect(() => {
      setEmail(subscriber.email);
      setFirstName(subscriber.first_name ?? '');
      setLastName(subscriber.last_name ?? '');
      setMetadataRows(metadataToRows(subscriber.metadata));
      setSavedMetadata(subscriber.metadata ?? {});
      setTags(subscriber.tags ?? []);
      setSavedTags(subscriber.tags ?? []);
      setFieldErrors({});
      setSaveError(null);
   }, [subscriber]);

   useEffect(() => {
      let cancelled = false;
      setActivityLoading(true);
      setActivityError(null);
      setActivity(null);

      loadActivity(subscriber.id)
         .then((result) => {
            if (!cancelled) setActivity(result);
         })
         .catch((cause: unknown) => {
            if (!cancelled) {
               setActivityError(errorMessage(cause, 'Could not load subscriber activity'));
            }
         })
         .finally(() => {
            if (!cancelled) setActivityLoading(false);
         });

      return () => {
         cancelled = true;
      };
   }, [subscriber.id]);

   async function save() {
      setSaveError(null);
      setFieldErrors({});

      const next: FieldErrors = {};
      if (firstName.trim().length > 100) next.first_name = '100 characters max.';
      if (lastName.trim().length > 100) next.last_name = '100 characters max.';

      if (!isEmail(email.trim())) next.email = 'Enter a valid email address.';
      if (Object.keys(next).length > 0) {
         setFieldErrors(next);
         return;
      }

      setSaving(true);
      try {
         const updated = await update(subscriber.id, {
            email: email.trim(),
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            metadata: metadataPatchFromRows(savedMetadata, metadataRows),
         });

         const tagResult = await saveTagsFor(subscriber.id, savedTags, tags);
         if (tagResult.failure !== null) {
            setSavedTags(tagResult.saved);
            setSaveError(tagFailureMessage(tagResult.failure));
         }

         const merged: Subscriber = {
            ...updated,
            tags: tagResult.saved,
            metadata: rowsToMetadata(metadataRows),
         };
         setSavedTags(tagResult.saved);
         setSavedMetadata(merged.metadata);
         onSaved(merged);
      } catch (cause) {
         setSaveError(errorMessage(cause, 'Could not save the subscriber'));
         setFieldErrors(cause instanceof ApiError ? fieldErrorsFrom(cause.details) : {});
      } finally {
         setSaving(false);
      }
   }

   const name = [firstName.trim(), lastName.trim()].filter((part) => part.length > 0).join(' ');
   const initial = subscriber.email.slice(0, 1).toUpperCase();
   const metadata = Object.entries(subscriber.metadata ?? {});
   const dirty =
      email !== subscriber.email ||
      firstName !== (subscriber.first_name ?? '') ||
      lastName !== (subscriber.last_name ?? '') ||
      JSON.stringify(metadataRows) !== JSON.stringify(metadataToRows(subscriber.metadata)) ||
      JSON.stringify(tags.map((tag) => tag.id).sort()) !==
         JSON.stringify((subscriber.tags ?? []).map((tag) => tag.id).sort());

   return (
      <DetailPanel
         label={`Subscriber ${subscriber.email}`}
         closeLabel="Close subscriber panel"
         rowKey={subscriber.id}
         onClose={onClose}
         header={
            <>
               <span className="flex size-10 shrink-0 items-center justify-center rounded-full border border-border bg-accent text-sm font-semibold">
                  {initial}
               </span>
               <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{subscriber.email}</p>
                  <p className="truncate text-xs text-muted-foreground">
                     {name.length > 0 ? name : 'No name on file'}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                     <Badge variant={statusVariant(subscriber.status)}>
                        {titleCase(subscriber.status)}
                     </Badge>
                     <span className="text-[11px] text-muted-foreground">
                        Added {relativeTime(subscriber.created_at)}
                     </span>
                  </div>
               </div>
            </>
         }
      >
         <section className="grid min-w-0 gap-3">
            <h2 className="text-sm font-semibold">Details</h2>
            <Field
               label="Email address"
               htmlFor="panel-subscriber-email"
               error={fieldErrors.email}
               required
            >
               <Input
                  id="panel-subscriber-email"
                  type="email"
                  value={email}
                  disabled={saving}
                  onInput={(event) => setEmail(event.currentTarget.value)}
               />
            </Field>
            <div className="grid min-w-0 grid-cols-2 gap-3">
               <Field
                  label="First name"
                  htmlFor="panel-subscriber-first"
                  error={fieldErrors.first_name}
               >
                  <Input
                     id="panel-subscriber-first"
                     value={firstName}
                     disabled={saving}
                     onInput={(event) => setFirstName(event.currentTarget.value)}
                  />
               </Field>
               <Field
                  label="Last name"
                  htmlFor="panel-subscriber-last"
                  error={fieldErrors.last_name}
               >
                  <Input
                     id="panel-subscriber-last"
                     value={lastName}
                     disabled={saving}
                     onInput={(event) => setLastName(event.currentTarget.value)}
                  />
               </Field>
            </div>
         </section>

         <section className="grid min-w-0 gap-2">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold">
               <TagIcon
                  className="size-4 text-muted-foreground"
                  aria-hidden="true"
               />
               Tags
            </h2>
            <TagPicker
               id="panel-subscriber-tags"
               value={tags}
               onChange={setTags}
               disabled={saving}
            />
         </section>

         <details className="group min-w-0 rounded-lg border border-border">
            <summary className="cursor-pointer list-none px-3 py-2 text-sm font-medium outline-none hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring">
               Custom fields{' '}
               <span className="text-xs font-normal text-muted-foreground">
                  ({metadata.length})
               </span>
            </summary>
            <div className="border-t border-border p-3">
               <MetadataEditor
                  idPrefix="panel-subscriber-metadata"
                  scope="subscriber"
                  rows={metadataRows}
                  onChange={setMetadataRows}
                  disabled={saving}
                  compact
               />
            </div>
         </details>

         {saveError !== null && (
            <Alert variant="destructive">
               <AlertDescription>{saveError}</AlertDescription>
            </Alert>
         )}

         <div className="flex items-center justify-between gap-2">
            <Button
               variant="ghost"
               size="sm"
               className="text-muted-foreground hover:text-destructive"
               disabled={saving}
               onClick={() => onDeleted(subscriber)}
            >
               Delete
            </Button>
            <Button
               size="sm"
               disabled={saving || !dirty}
               onClick={() => void save()}
            >
               <Save aria-hidden="true" />
               {saving ? 'Saving…' : 'Save changes'}
            </Button>
         </div>

         <section className="grid min-w-0 gap-3 border-t border-border pt-5">
            <h2 className="text-sm font-semibold">Activity</h2>
            {activityError !== null ? (
               <Alert variant="destructive">
                  <AlertDescription>{activityError}</AlertDescription>
               </Alert>
            ) : activityLoading && activity === null ? (
               <div className="grid gap-2">
                  <Skeleton className="h-16 w-full rounded-lg" />
                  <Skeleton className="h-32 w-full rounded-lg" />
               </div>
            ) : activity !== null ? (
               <div className="grid min-w-0 gap-4">
                  <dl className="grid grid-cols-3 gap-2 rounded-lg border border-border p-3">
                     <div className="grid gap-0.5">
                        <dt className="text-[11px] text-muted-foreground">Received</dt>
                        <dd className="text-base font-medium">
                           {formatNumber(activity.totals.received)}
                        </dd>
                     </div>
                     <div className="grid gap-0.5">
                        <dt className="text-[11px] text-muted-foreground">Opened</dt>
                        <dd className="text-base font-medium">
                           {formatNumber(activity.totals.opened)}
                        </dd>
                     </div>
                     <div className="grid gap-0.5">
                        <dt className="text-[11px] text-muted-foreground">Clicked</dt>
                        <dd className="text-base font-medium">
                           {formatNumber(activity.totals.clicked)}
                        </dd>
                     </div>
                  </dl>

                  <div className="grid min-w-0 gap-2">
                     <h3 className="flex items-center gap-1.5 text-xs font-semibold">
                        <Mail
                           className="size-3.5 text-muted-foreground"
                           aria-hidden="true"
                        />
                        Sends
                     </h3>
                     {activity.timeline.length === 0 ? (
                        <p className="text-xs text-muted-foreground">
                           No campaigns have reached this address yet.
                        </p>
                     ) : (
                        <ol className="grid min-w-0 gap-1.5">
                           {activity.timeline.map((entry) => (
                              <li
                                 key={entry.campaignId}
                                 className="min-w-0 rounded-lg border border-border p-2.5"
                              >
                                 <div className="flex min-w-0 items-start justify-between gap-2">
                                    <a
                                       href={`/campaigns/${entry.campaignId}`}
                                       className="min-w-0 flex-1 truncate text-xs font-medium underline-offset-4 hover:underline"
                                    >
                                       {entry.campaignName}
                                    </a>
                                    <Badge variant="secondary">{titleCase(entry.status)}</Badge>
                                 </div>
                                 <p className="mt-1 text-[11px] text-muted-foreground">
                                    Sent {formatDateTime(entry.sentAt)}
                                    {entry.openedAt !== null ? ' · opened' : ''}
                                    {entry.clickedAt !== null ? ' · clicked' : ''}
                                 </p>
                              </li>
                           ))}
                        </ol>
                     )}
                  </div>

                  <div className="grid min-w-0 gap-2">
                     <h3 className="flex items-center gap-1.5 text-xs font-semibold">
                        <MousePointerClick
                           className="size-3.5 text-muted-foreground"
                           aria-hidden="true"
                        />
                        Clicks
                     </h3>
                     {activity.clicks.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No link clicks recorded.</p>
                     ) : (
                        <ul className="grid min-w-0 gap-1.5">
                           {activity.clicks.map((click, index) => (
                              <li
                                 key={`${click.url}-${click.clickedAt}-${index}`}
                                 className="flex min-w-0 items-baseline justify-between gap-2 text-xs"
                              >
                                 <span
                                    className="line-clamp-2 min-w-0 break-all"
                                    title={click.url}
                                 >
                                    {click.url}
                                 </span>
                                 <span className="shrink-0 text-[11px] text-muted-foreground">
                                    {relativeTime(click.clickedAt)}
                                 </span>
                              </li>
                           ))}
                        </ul>
                     )}
                  </div>

                  {activity.totals.lastSentAt !== null && (
                     <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <Activity
                           className="size-3.5"
                           aria-hidden="true"
                        />
                        Last send {formatDateTime(activity.totals.lastSentAt)}
                     </p>
                  )}
               </div>
            ) : null}
         </section>
      </DetailPanel>
   );
}
