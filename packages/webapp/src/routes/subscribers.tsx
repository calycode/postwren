import { useEffect, useState } from 'react';
import {
   Download,
   Pencil,
   Plus,
   Search,
   Tag as TagIcon,
   Trash2,
   Upload,
   UserPlus,
   Users,
} from 'lucide-react';
import {
   Alert,
   AlertDescription,
   Badge,
   Button,
   Dialog,
   DialogClose,
   DialogContent,
   DialogDescription,
   DialogFooter,
   DialogHeader,
   DialogTitle,
   Field,
   Input,
   Select,
   SelectContent,
   SelectItem,
   SelectTrigger,
   SelectValue,
} from '@postwren/ui';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DataTable } from '@/components/data-table';
import type { DataTableColumn } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { TagPicker } from '@/components/tag-picker';
import { MetadataEditor } from '@/components/metadata-editor';
import {
   addTag,
   create as createSubscriber,
   exportCsv,
   importCsv,
   list as listSubscribers,
   remove as removeSubscriber,
   removeTag,
   update as updateSubscriber,
} from '@/lib/api/subscribers';
import { list as listTags } from '@/lib/api/tags';
import { ApiError } from '@/lib/api/client';
import type { ImportResult, Subscriber, SubscriberStatus, Tag } from '@/lib/api/types';
import { errorMessage, fieldErrorsFrom, isEmail } from '@/lib/form-errors';
import type { FieldErrors } from '@/lib/form-errors';
import {
   csvFilename,
   formatDate,
   formatNumber,
   pluralise,
   relativeTime,
   titleCase,
} from '@/lib/format';
import { useDebouncedValue } from '@/lib/hooks';
import {
   metadataPatchFromRows,
   metadataToRows,
   rowsToMetadata,
   validateMetadataRows,
} from '@/lib/metadata';
import type { MetadataRow } from '@/lib/metadata';
import { appendCursorPage, cursorStateFrom, emptyCursorState } from '@/lib/pagination';
import type { CursorState } from '@/lib/pagination';
import { applyTagDiff, diffTags, mergeAppliedTags } from '@/lib/tag-diff';
import type { TagFailure } from '@/lib/tag-diff';

type StatusFilter = 'all' | SubscriberStatus;

const STATUS_OPTIONS: SubscriberStatus[] = [
   'active',
   'unsubscribed',
   'bounced',
   'complained',
   'deleted',
];

type SubscriberForm = {
   email: string;
   first_name: string;
   last_name: string;
   metadata: MetadataRow[];
};

const EMPTY_FORM: SubscriberForm = { email: '', first_name: '', last_name: '', metadata: [] };

function statusVariant(
   status: SubscriberStatus,
): 'success' | 'secondary' | 'warning' | 'destructive' | 'outline' {
   switch (status) {
      case 'active':
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

function isStatusFilter(value: string): value is StatusFilter {
   return value === 'all' || STATUS_OPTIONS.includes(value as SubscriberStatus);
}

function fullName(subscriber: Subscriber): string {
   return [subscriber.first_name, subscriber.last_name]
      .filter((part) => part && part.length > 0)
      .join(' ');
}

function tagFailureMessage(failure: TagFailure): string {
   const action = failure.action === 'add' ? 'add' : 'remove';
   return `Could not ${action} tag "${failure.tag.name}": ${errorMessage(failure.cause)}`;
}

export function Subscribers() {
   const [search, setSearch] = useState('');
   const debouncedSearch = useDebouncedValue(search, 250);
   const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
   const [tagFilter, setTagFilter] = useState('all');

   const [state, setState] = useState<CursorState<Subscriber>>(emptyCursorState);
   const [loading, setLoading] = useState(true);
   const [loadingMore, setLoadingMore] = useState(false);
   const [error, setError] = useState<string | null>(null);
   const [moreError, setMoreError] = useState<string | null>(null);
   const [actionError, setActionError] = useState<string | null>(null);
   const [reloadKey, setReloadKey] = useState(0);

   const [tags, setTags] = useState<Tag[]>([]);
   const [tagsError, setTagsError] = useState<string | null>(null);

   const [formOpen, setFormOpen] = useState(false);
   const [editing, setEditing] = useState<Subscriber | null>(null);
   const [form, setForm] = useState<SubscriberForm>(EMPTY_FORM);
   const [formErrors, setFormErrors] = useState<FieldErrors>({});
   const [formError, setFormError] = useState<string | null>(null);
   const [formTags, setFormTags] = useState<Tag[]>([]);
   const [savedTags, setSavedTags] = useState<Tag[]>([]);
   const [savedMetadata, setSavedMetadata] = useState<Record<string, string>>({});
   const [tagError, setTagError] = useState<string | null>(null);
   const [saving, setSaving] = useState(false);

   const [tagEditing, setTagEditing] = useState<Subscriber | null>(null);
   const [tagEditTags, setTagEditTags] = useState<Tag[]>([]);
   const [tagEditSaved, setTagEditSaved] = useState<Tag[]>([]);
   const [tagEditError, setTagEditError] = useState<string | null>(null);
   const [tagEditBusy, setTagEditBusy] = useState(false);

   const [deleting, setDeleting] = useState<Subscriber | null>(null);
   const [deleteBusy, setDeleteBusy] = useState(false);
   const [deleteError, setDeleteError] = useState<string | null>(null);

   const [importOpen, setImportOpen] = useState(false);
   const [importCsvText, setImportCsvText] = useState('');
   const [importFileName, setImportFileName] = useState('');
   const [importTags, setImportTags] = useState<Tag[]>([]);
   const [importBusy, setImportBusy] = useState(false);
   const [importError, setImportError] = useState<string | null>(null);
   const [importFieldErrors, setImportFieldErrors] = useState<FieldErrors>({});
   const [importResult, setImportResult] = useState<ImportResult | null>(null);

   const [exporting, setExporting] = useState(false);

   useEffect(() => {
      let cancelled = false;
      listTags()
         .then((result) => {
            if (!cancelled) {
               setTags(result);
               setTagsError(null);
            }
         })
         .catch((cause: unknown) => {
            if (!cancelled) setTagsError(errorMessage(cause, 'Could not load tags'));
         });

      return () => {
         cancelled = true;
      };
   }, []);

   useEffect(() => {
      let cancelled = false;
      setLoading(true);
      setError(null);
      setMoreError(null);
      setState(emptyCursorState());

      listSubscribers({
         limit: 25,
         q: debouncedSearch.trim() || undefined,
         tag: tagFilter === 'all' ? undefined : tagFilter,
         status: statusFilter === 'all' ? undefined : statusFilter,
      })
         .then((page) => {
            if (!cancelled) setState(cursorStateFrom(page, (subscriber) => subscriber.id));
         })
         .catch((cause: unknown) => {
            if (!cancelled) setError(errorMessage(cause, 'Could not load subscribers'));
         })
         .finally(() => {
            if (!cancelled) setLoading(false);
         });

      return () => {
         cancelled = true;
      };
   }, [debouncedSearch, statusFilter, tagFilter, reloadKey]);

   async function loadMore() {
      if (!state.nextCursor || loadingMore) return;

      setLoadingMore(true);
      setMoreError(null);
      try {
         const page = await listSubscribers({
            cursor: state.nextCursor,
            limit: 25,
            q: debouncedSearch.trim() || undefined,
            tag: tagFilter === 'all' ? undefined : tagFilter,
            status: statusFilter === 'all' ? undefined : statusFilter,
         });
         setState((current) => appendCursorPage(current, page, (subscriber) => subscriber.id));
      } catch (cause) {
         setMoreError(errorMessage(cause, 'Could not load more subscribers'));
      } finally {
         setLoadingMore(false);
      }
   }

   function resetForm() {
      setEditing(null);
      setForm(EMPTY_FORM);
      setFormErrors({});
      setFormError(null);
      setFormTags([]);
      setSavedTags([]);
      setSavedMetadata({});
      setTagError(null);
   }

   function openCreate() {
      resetForm();
      setFormOpen(true);
   }

   function openEdit(subscriber: Subscriber) {
      setEditing(subscriber);
      setForm({
         email: subscriber.email,
         first_name: subscriber.first_name ?? '',
         last_name: subscriber.last_name ?? '',
         metadata: metadataToRows(subscriber.metadata),
      });
      setFormErrors({});
      setFormError(null);
      setFormTags(subscriber.tags ?? []);
      setSavedTags(subscriber.tags ?? []);
      setSavedMetadata(subscriber.metadata ?? {});
      setTagError(null);
      setFormOpen(true);
   }

   function openTagEdit(subscriber: Subscriber) {
      setTagEditing(subscriber);
      setTagEditTags(subscriber.tags ?? []);
      setTagEditSaved(subscriber.tags ?? []);
      setTagEditError(null);
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

   async function submitForm(event: Event) {
      event.preventDefault();
      setFormError(null);
      setFormErrors({});
      setTagError(null);

      const email = form.email.trim();
      const first = form.first_name.trim();
      const last = form.last_name.trim();
      const nextErrors: FieldErrors = {};

      if (!isEmail(email)) nextErrors.email = 'Enter a valid email address.';
      if (first.length > 100) nextErrors.first_name = 'First name must be 100 characters or fewer.';
      if (last.length > 100) nextErrors.last_name = 'Last name must be 100 characters or fewer.';

      const metadataIssues = validateMetadataRows(form.metadata);
      if (
         metadataIssues.general !== undefined ||
         metadataIssues.rowErrors.some((error) => error !== undefined)
      ) {
         nextErrors.metadata = 'Fix the highlighted custom fields.';
      }

      if (Object.keys(nextErrors).length > 0) {
         setFormErrors(nextErrors);
         return;
      }

      const metadata = rowsToMetadata(form.metadata);
      const fields = {
         email,
         ...(first.length > 0 ? { firstName: first } : {}),
         ...(last.length > 0 ? { lastName: last } : {}),
      };

      setSaving(true);
      try {
         let subscriberId: string;
         let created: Subscriber | null = null;

         if (editing) {
            await updateSubscriber(editing.id, {
               ...fields,
               metadata: metadataPatchFromRows(savedMetadata, form.metadata),
            });
            subscriberId = editing.id;
         } else {
            created = await createSubscriber({ ...fields, metadata });
            subscriberId = created.id;
         }

         const tagResult = await saveTagsFor(subscriberId, savedTags, formTags);

         if (tagResult.failure !== null) {
            setSavedTags(tagResult.saved);
            setTagError(tagFailureMessage(tagResult.failure));
            if (created !== null) {
               setEditing({ ...created, tags: tagResult.saved });
            }
            setReloadKey((key) => key + 1);
            return;
         }

         setFormOpen(false);
         resetForm();
         setReloadKey((key) => key + 1);
      } catch (cause) {
         setFormError(errorMessage(cause, 'Could not save the subscriber'));
         setFormErrors(cause instanceof ApiError ? fieldErrorsFrom(cause.details) : {});
      } finally {
         setSaving(false);
      }
   }

   async function saveTagEdit() {
      if (!tagEditing) return;
      setTagEditBusy(true);
      setTagEditError(null);
      try {
         const result = await saveTagsFor(tagEditing.id, tagEditSaved, tagEditTags);

         if (result.failure !== null) {
            setTagEditSaved(result.saved);
            setTagEditError(tagFailureMessage(result.failure));
            setReloadKey((key) => key + 1);
            return;
         }

         setTagEditing(null);
         setReloadKey((key) => key + 1);
      } catch (cause) {
         setTagEditError(errorMessage(cause, 'Could not save tags'));
      } finally {
         setTagEditBusy(false);
      }
   }

   async function confirmDelete() {
      if (!deleting) return;
      setDeleteBusy(true);
      setDeleteError(null);
      try {
         await removeSubscriber(deleting.id);
         setDeleting(null);
         setReloadKey((key) => key + 1);
      } catch (cause) {
         setDeleteError(errorMessage(cause, 'Could not delete the subscriber'));
      } finally {
         setDeleteBusy(false);
      }
   }

   function openImport() {
      setImportCsvText('');
      setImportFileName('');
      setImportTags([]);
      setImportError(null);
      setImportFieldErrors({});
      setImportResult(null);
      setImportOpen(true);
   }

   async function readFile(input: HTMLInputElement) {
      const file = input.files?.[0];
      if (!file) return;

      setImportFileName(file.name);
      setImportResult(null);
      setImportError(null);
      try {
         setImportCsvText(await file.text());
      } catch (cause) {
         setImportError(errorMessage(cause, 'Could not read that file'));
      }
   }

   async function submitImport() {
      setImportError(null);
      setImportFieldErrors({});
      setImportResult(null);

      if (importCsvText.trim().length === 0) {
         setImportFieldErrors({ csv: 'Choose a CSV file first.' });
         return;
      }

      setImportBusy(true);
      try {
         const result = await importCsv(
            importCsvText,
            importTags.map((tag) => tag.name),
         );
         setImportResult(result);
         setReloadKey((key) => key + 1);
      } catch (cause) {
         setImportError(errorMessage(cause, 'Could not import the CSV'));
         setImportFieldErrors(cause instanceof ApiError ? fieldErrorsFrom(cause.details) : {});
      } finally {
         setImportBusy(false);
      }
   }

   async function handleExport() {
      setExporting(true);
      setActionError(null);
      try {
         const blob = await exportCsv();
         const url = URL.createObjectURL(blob);
         const anchor = document.createElement('a');
         anchor.href = url;
         anchor.download = csvFilename('subscribers');
         document.body.appendChild(anchor);
         anchor.click();
         anchor.remove();
         URL.revokeObjectURL(url);
      } catch (cause) {
         setActionError(errorMessage(cause, 'Could not export subscribers'));
      } finally {
         setExporting(false);
      }
   }

   const filtersActive =
      debouncedSearch.trim().length > 0 || statusFilter !== 'all' || tagFilter !== 'all';

   const columns: DataTableColumn<Subscriber>[] = [
      {
         id: 'subscriber',
         header: 'Subscriber',
         cell: (subscriber) => (
            <div className="grid gap-0.5">
               <span className="font-medium">{subscriber.email}</span>
               {fullName(subscriber).length > 0 && (
                  <span className="text-xs text-muted-foreground">{fullName(subscriber)}</span>
               )}
            </div>
         ),
      },
      {
         id: 'status',
         header: 'Status',
         cell: (subscriber) => (
            <Badge variant={statusVariant(subscriber.status)}>{titleCase(subscriber.status)}</Badge>
         ),
      },
      {
         id: 'tags',
         header: 'Tags',
         cell: (subscriber) => {
            const subscriberTags = subscriber.tags ?? [];
            if (subscriberTags.length === 0) {
               return <span className="text-muted-foreground">—</span>;
            }
            return (
               <div className="flex flex-wrap gap-1">
                  {subscriberTags.slice(0, 3).map((tag) => (
                     <Badge
                        key={tag.id}
                        variant="outline"
                     >
                        {tag.name}
                     </Badge>
                  ))}
                  {subscriberTags.length > 3 && (
                     <Badge variant="secondary">+{subscriberTags.length - 3}</Badge>
                  )}
               </div>
            );
         },
      },
      {
         id: 'metadata',
         header: 'Custom fields',
         cell: (subscriber) => {
            const entries = Object.entries(subscriber.metadata ?? {});
            if (entries.length === 0) {
               return <span className="text-muted-foreground">—</span>;
            }
            return (
               <div className="flex flex-wrap gap-1">
                  {entries.slice(0, 2).map(([key, value]) => (
                     <Badge
                        key={key}
                        variant="outline"
                        title={`${key}: ${value}`}
                     >
                        {key}
                     </Badge>
                  ))}
                  {entries.length > 2 && <Badge variant="secondary">+{entries.length - 2}</Badge>}
               </div>
            );
         },
      },
      {
         id: 'added',
         header: 'Added',
         cell: (subscriber) => (
            <span
               className="text-muted-foreground"
               title={formatDate(subscriber.created_at)}
            >
               {relativeTime(subscriber.created_at)}
            </span>
         ),
      },
      {
         id: 'actions',
         header: <span className="sr-only">Actions</span>,
         headerClassName: 'text-right',
         className: 'text-right',
         cell: (subscriber) => (
            <div className="flex justify-end gap-1">
               <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Edit tags for ${subscriber.email}`}
                  onClick={() => openTagEdit(subscriber)}
               >
                  <TagIcon aria-hidden="true" />
               </Button>
               <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Edit ${subscriber.email}`}
                  onClick={() => openEdit(subscriber)}
               >
                  <Pencil aria-hidden="true" />
               </Button>
               <Button
                  variant="ghost"
                  size="icon"
                  className="text-destructive hover:text-destructive"
                  aria-label={`Delete ${subscriber.email}`}
                  onClick={() => {
                     setDeleting(subscriber);
                     setDeleteError(null);
                  }}
               >
                  <Trash2 aria-hidden="true" />
               </Button>
            </div>
         ),
      },
   ];

   return (
      <div className="grid gap-6">
         <PageHeader
            title="Subscribers"
            description="Everyone who can receive a campaign. Suppressed subscribers are never enqueued."
            actions={
               <>
                  <Button onClick={openCreate}>
                     <UserPlus aria-hidden="true" />
                     Add subscriber
                  </Button>
                  <Button
                     variant="outline"
                     onClick={openImport}
                  >
                     <Upload aria-hidden="true" />
                     Import CSV
                  </Button>
                  <Button
                     variant="outline"
                     disabled={exporting}
                     onClick={() => void handleExport()}
                  >
                     <Download aria-hidden="true" />
                     {exporting ? 'Exporting…' : 'Export CSV'}
                  </Button>
               </>
            }
         />

         {actionError !== null && (
            <Alert variant="destructive">
               <AlertDescription>{actionError}</AlertDescription>
            </Alert>
         )}

         <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative flex-1">
               <label
                  htmlFor="subscriber-search"
                  className="sr-only"
               >
                  Search subscribers
               </label>
               <Search
                  className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
               />
               <Input
                  id="subscriber-search"
                  value={search}
                  placeholder="Search by email or name"
                  className="pl-9"
                  onInput={(event) => setSearch(event.currentTarget.value)}
               />
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
               <div className="w-full sm:w-44">
                  <Select
                     value={statusFilter}
                     onValueChange={(value) => {
                        if (value && isStatusFilter(value)) setStatusFilter(value);
                     }}
                  >
                     <SelectTrigger aria-label="Filter by status">
                        <SelectValue placeholder="Status" />
                     </SelectTrigger>
                     <SelectContent>
                        <SelectItem value="all">All statuses</SelectItem>
                        {STATUS_OPTIONS.map((status) => (
                           <SelectItem
                              key={status}
                              value={status}
                           >
                              {titleCase(status)}
                           </SelectItem>
                        ))}
                     </SelectContent>
                  </Select>
               </div>

               <div className="w-full sm:w-48">
                  <Select
                     value={tagFilter}
                     onValueChange={(value) => {
                        if (value) setTagFilter(value);
                     }}
                  >
                     <SelectTrigger aria-label="Filter by tag">
                        <SelectValue placeholder="Tag" />
                     </SelectTrigger>
                     <SelectContent>
                        <SelectItem value="all">All tags</SelectItem>
                        {tags.map((tag) => (
                           <SelectItem
                              key={tag.id}
                              value={tag.name}
                           >
                              {tag.name}
                           </SelectItem>
                        ))}
                     </SelectContent>
                  </Select>
               </div>
            </div>
         </div>

         {tagsError !== null && (
            <p
               role="status"
               className="text-xs text-muted-foreground"
            >
               Tag filter unavailable: {tagsError}
            </p>
         )}

         <p
            className="sr-only"
            role="status"
            aria-live="polite"
         >
            {loading
               ? 'Loading subscribers'
               : `${pluralise(state.items.length, 'subscriber')} loaded`}
         </p>

         <DataTable
            caption="Subscribers"
            columns={columns}
            rows={state.items}
            rowKey={(subscriber) => subscriber.id}
            loading={loading}
            error={error}
            onRetry={() => setReloadKey((key) => key + 1)}
            empty={{
               title: filtersActive ? 'No subscribers match' : 'No subscribers yet',
               description: filtersActive
                  ? 'Try a different search or filter.'
                  : 'Add a subscriber by hand or import a CSV to get started.',
               icon: <Users aria-hidden="true" />,
               action: filtersActive ? undefined : (
                  <Button onClick={openCreate}>
                     <Plus aria-hidden="true" />
                     Add subscriber
                  </Button>
               ),
            }}
         />

         {moreError !== null && (
            <Alert variant="destructive">
               <AlertDescription>{moreError}</AlertDescription>
            </Alert>
         )}

         {!loading && error === null && state.items.length > 0 && (
            <div className="flex flex-col items-center gap-2">
               <p className="text-xs text-muted-foreground">
                  Showing {formatNumber(state.items.length)} subscribers
               </p>
               {state.hasMore && (
                  <Button
                     variant="outline"
                     disabled={loadingMore}
                     onClick={() => void loadMore()}
                  >
                     {loadingMore ? 'Loading…' : 'Load more'}
                  </Button>
               )}
            </div>
         )}

         <Dialog
            open={formOpen}
            onOpenChange={(open) => {
               setFormOpen(open);
               if (!open) resetForm();
            }}
         >
            <DialogContent>
               <DialogHeader>
                  <DialogTitle>{editing ? 'Edit subscriber' : 'Add subscriber'}</DialogTitle>
                  <DialogDescription>
                     {editing
                        ? 'Update the subscriber record and its tags. Email addresses are lowercased.'
                        : 'Create a subscriber record and choose any tags it should start with.'}
                  </DialogDescription>
               </DialogHeader>

               <form
                  className="grid gap-4"
                  onSubmit={submitForm}
                  noValidate
               >
                  <Field
                     label="Email address"
                     htmlFor="subscriber-email"
                     error={formErrors.email}
                     required
                  >
                     <Input
                        id="subscriber-email"
                        type="email"
                        autoComplete="email"
                        value={form.email}
                        aria-invalid={formErrors.email ? 'true' : undefined}
                        aria-describedby={formErrors.email ? 'subscriber-email-error' : undefined}
                        onInput={(event) =>
                           setForm((current) => ({ ...current, email: event.currentTarget.value }))
                        }
                     />
                  </Field>

                  <div className="grid gap-4 sm:grid-cols-2">
                     <Field
                        label="First name"
                        htmlFor="subscriber-first-name"
                        error={formErrors.first_name}
                     >
                        <Input
                           id="subscriber-first-name"
                           autoComplete="given-name"
                           value={form.first_name}
                           aria-invalid={formErrors.first_name ? 'true' : undefined}
                           aria-describedby={
                              formErrors.first_name ? 'subscriber-first-name-error' : undefined
                           }
                           onInput={(event) =>
                              setForm((current) => ({
                                 ...current,
                                 first_name: event.currentTarget.value,
                              }))
                           }
                        />
                     </Field>

                     <Field
                        label="Last name"
                        htmlFor="subscriber-last-name"
                        error={formErrors.last_name}
                     >
                        <Input
                           id="subscriber-last-name"
                           autoComplete="family-name"
                           value={form.last_name}
                           aria-invalid={formErrors.last_name ? 'true' : undefined}
                           aria-describedby={
                              formErrors.last_name ? 'subscriber-last-name-error' : undefined
                           }
                           onInput={(event) =>
                              setForm((current) => ({
                                 ...current,
                                 last_name: event.currentTarget.value,
                              }))
                           }
                        />
                     </Field>
                  </div>

                  <div className="grid gap-2">
                     <h3 className="text-sm font-medium">Custom fields</h3>
                     <p className="text-xs text-muted-foreground">
                        Values are available to content as{' '}
                        <code className="rounded bg-muted px-1 py-0.5">
                           {'{{ subscriber.meta.key }}'}
                        </code>
                        .
                     </p>
                     <MetadataEditor
                        idPrefix="subscriber-metadata"
                        scope="subscriber"
                        rows={form.metadata}
                        onChange={(metadata) => setForm((current) => ({ ...current, metadata }))}
                        disabled={saving}
                     />
                     {formErrors.metadata !== undefined && (
                        <p
                           role="alert"
                           className="text-xs font-medium text-destructive"
                        >
                           {formErrors.metadata}
                        </p>
                     )}
                  </div>

                  <Field
                     label="Tags"
                     htmlFor="subscriber-tags"
                     hint={
                        editing
                           ? 'Changes to tags are saved with the subscriber.'
                           : 'Tags are attached after the subscriber is created.'
                     }
                  >
                     <TagPicker
                        id="subscriber-tags"
                        value={formTags}
                        onChange={setFormTags}
                        disabled={saving}
                     />
                  </Field>

                  {tagError !== null && (
                     <p
                        role="alert"
                        className="text-xs font-medium text-destructive"
                     >
                        {tagError}
                     </p>
                  )}

                  {formError !== null && (
                     <Alert variant="destructive">
                        <AlertDescription>{formError}</AlertDescription>
                     </Alert>
                  )}

                  <DialogFooter>
                     <DialogClose disabled={saving}>Cancel</DialogClose>
                     <Button
                        type="submit"
                        disabled={saving}
                     >
                        {saving ? 'Saving…' : editing ? 'Save changes' : 'Add subscriber'}
                     </Button>
                  </DialogFooter>
               </form>
            </DialogContent>
         </Dialog>

         <Dialog
            open={importOpen}
            onOpenChange={(open) => {
               setImportOpen(open);
               if (!open) {
                  setImportCsvText('');
                  setImportFileName('');
                  setImportTags([]);
                  setImportError(null);
                  setImportFieldErrors({});
                  setImportResult(null);
               }
            }}
         >
            <DialogContent>
               <DialogHeader>
                  <DialogTitle>Import subscribers</DialogTitle>
                  <DialogDescription>
                     Upload a CSV with an email column. Rows that fail validation are reported
                     below.
                  </DialogDescription>
               </DialogHeader>

               <div className="grid gap-4">
                  <Field
                     label="CSV file"
                     htmlFor="import-file"
                     error={importFieldErrors.csv}
                     hint={
                        importFileName.length > 0
                           ? `Loaded ${importFileName}`
                           : 'Choose a .csv file from your computer.'
                     }
                  >
                     <Input
                        id="import-file"
                        type="file"
                        accept=".csv,text/csv"
                        aria-invalid={importFieldErrors.csv ? 'true' : undefined}
                        aria-describedby={importFieldErrors.csv ? 'import-file-error' : undefined}
                        onChange={(event) => {
                           void readFile(event.currentTarget);
                        }}
                     />
                  </Field>

                  <Field
                     label="Apply tags"
                     htmlFor="import-tags"
                     hint="Every imported subscriber receives these tags."
                  >
                     <TagPicker
                        id="import-tags"
                        value={importTags}
                        onChange={setImportTags}
                     />
                  </Field>

                  {importError !== null && (
                     <Alert variant="destructive">
                        <AlertDescription>{importError}</AlertDescription>
                     </Alert>
                  )}

                  {importResult !== null && (
                     <div
                        className="grid gap-2 rounded-lg border border-border p-3 text-sm"
                        role="status"
                        aria-live="polite"
                     >
                        <p className="font-medium">
                           Imported {formatNumber(importResult.imported)}, skipped{' '}
                           {formatNumber(importResult.skipped)}.
                        </p>
                        <p className="text-muted-foreground">
                           {pluralise(importResult.errors.length, 'row')} could not be imported.
                        </p>
                        {importResult.errors.length > 0 && (
                           <ul className="list-inside list-disc text-muted-foreground">
                              {importResult.errors.slice(0, 5).map((rowError) => (
                                 <li key={`${rowError.row}-${rowError.message}`}>
                                    Row {rowError.row}: {rowError.message}
                                 </li>
                              ))}
                           </ul>
                        )}
                     </div>
                  )}
               </div>

               <DialogFooter>
                  <DialogClose disabled={importBusy}>Close</DialogClose>
                  <Button
                     disabled={importBusy}
                     onClick={() => void submitImport()}
                  >
                     {importBusy ? 'Importing…' : 'Import'}
                  </Button>
               </DialogFooter>
            </DialogContent>
         </Dialog>

         <Dialog
            open={tagEditing !== null}
            onOpenChange={(open) => {
               if (!open) setTagEditing(null);
            }}
         >
            <DialogContent>
               <DialogHeader>
                  <DialogTitle>Edit tags</DialogTitle>
                  <DialogDescription>
                     {tagEditing
                        ? `Choose the tags for ${tagEditing.email}.`
                        : 'Choose the tags for this subscriber.'}
                  </DialogDescription>
               </DialogHeader>

               <Field
                  label="Tags"
                  htmlFor="subscriber-tag-edit"
               >
                  <TagPicker
                     id="subscriber-tag-edit"
                     value={tagEditTags}
                     onChange={setTagEditTags}
                     disabled={tagEditBusy}
                  />
               </Field>

               {tagEditError !== null && (
                  <Alert variant="destructive">
                     <AlertDescription>{tagEditError}</AlertDescription>
                  </Alert>
               )}

               <DialogFooter>
                  <DialogClose disabled={tagEditBusy}>Cancel</DialogClose>
                  <Button
                     disabled={tagEditBusy}
                     onClick={() => void saveTagEdit()}
                  >
                     {tagEditBusy ? 'Saving…' : 'Save tags'}
                  </Button>
               </DialogFooter>
            </DialogContent>
         </Dialog>

         <ConfirmDialog
            open={deleting !== null}
            onOpenChange={(open) => {
               if (!open) setDeleting(null);
            }}
            title="Delete subscriber"
            description={
               deleting
                  ? `Delete ${deleting.email}? This removes the record and any pending campaign recipients for them.`
                  : ''
            }
            confirmLabel="Delete subscriber"
            destructive
            loading={deleteBusy}
            error={deleteError}
            onConfirm={confirmDelete}
         />
      </div>
   );
}
