import { useEffect, useState } from 'react';
import {
   Download,
   Pencil,
   Plus,
   Search,
   SlidersHorizontal,
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
   useToast,
} from '@postwren/ui';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DataTable } from '@/components/data-table';
import { useDetailPanelInset } from '@/components/detail-panel';
import type { DataTableColumn } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { SubscriberPanel } from '@/components/subscriber-panel';
import { TagPicker } from '@/components/tag-picker';
import { MetadataEditor } from '@/components/metadata-editor';
import {
   addTag,
   bulkDelete as bulkDeleteSubscribers,
   bulkMetadata as bulkUpdateMetadata,
   bulkTags as bulkUpdateTags,
   create as createSubscriber,
   exportCsv,
   importCsv,
   list as listSubscribers,
   remove as removeSubscriber,
   removeTag,
} from '@/lib/api/subscribers';
import { list as listTags } from '@/lib/api/tags';
import { ApiError } from '@/lib/api/client';
import type { ImportResult, Subscriber, SubscriberStatus, Tag } from '@/lib/api/types';
import { downloadCsv, downloadFile } from '@/lib/download';
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
import { rowsToMetadata, validateMetadataRows } from '@/lib/metadata';
import type { MetadataRow } from '@/lib/metadata';
import { appendCursorPage, cursorStateFrom, emptyCursorState } from '@/lib/pagination';
import { SUBSCRIBER_CSV_TEMPLATE } from '@/lib/subscriber-csv';
import type { CursorState } from '@/lib/pagination';
import { applyTagDiff, diffTags, mergeAppliedTags } from '@/lib/tag-diff';
import type { TagFailure } from '@/lib/tag-diff';

type StatusFilter = 'all' | SubscriberStatus;

const STATUS_OPTIONS: SubscriberStatus[] = [
   'subscribed',
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
   const { toast } = useToast();
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
   const [form, setForm] = useState<SubscriberForm>(EMPTY_FORM);
   const [formErrors, setFormErrors] = useState<FieldErrors>({});
   const [formError, setFormError] = useState<string | null>(null);
   const [formTags, setFormTags] = useState<Tag[]>([]);
   const [savedTags, setSavedTags] = useState<Tag[]>([]);
   const [tagError, setTagError] = useState<string | null>(null);
   const [saving, setSaving] = useState(false);

   const [panelSubscriber, setPanelSubscriber] = useState<Subscriber | null>(null);
   const panelOpen = panelSubscriber !== null;

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

   const panelInset = useDetailPanelInset(panelOpen);

   const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

   const [bulkTagsOpen, setBulkTagsOpen] = useState(false);
   const [bulkTags, setBulkTags] = useState<Tag[]>([]);
   const [bulkTagsBusy, setBulkTagsBusy] = useState(false);
   const [bulkTagsError, setBulkTagsError] = useState<string | null>(null);

   const [bulkMetadataOpen, setBulkMetadataOpen] = useState(false);
   const [bulkMetadataMode, setBulkMetadataMode] = useState<'set' | 'remove'>('set');
   const [bulkMetadataKey, setBulkMetadataKey] = useState('company');
   const [bulkMetadataValue, setBulkMetadataValue] = useState('');
   const [bulkMetadataBusy, setBulkMetadataBusy] = useState(false);
   const [bulkMetadataError, setBulkMetadataError] = useState<string | null>(null);

   const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
   const [bulkDeleteBusy, setBulkDeleteBusy] = useState(false);
   const [bulkDeleteError, setBulkDeleteError] = useState<string | null>(null);

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
      setSelectedIds(new Set());
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
      setForm(EMPTY_FORM);
      setFormErrors({});
      setFormError(null);
      setFormTags([]);
      setSavedTags([]);
      setTagError(null);
   }

   function openCreate() {
      resetForm();
      setFormOpen(true);
   }

   function openPanel(subscriber: Subscriber) {
      setPanelSubscriber(subscriber);
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
         const created = await createSubscriber({ ...fields, metadata });
         const tagResult = await saveTagsFor(created.id, savedTags, formTags);

         if (tagResult.failure !== null) {
            setSavedTags(tagResult.saved);
            setTagError(tagFailureMessage(tagResult.failure));
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

   async function confirmDelete() {
      if (!deleting) return;
      setDeleteBusy(true);
      setDeleteError(null);
      try {
         await removeSubscriber(deleting.id);
         if (panelSubscriber?.id === deleting.id) setPanelSubscriber(null);
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
         downloadFile(csvFilename('subscribers'), await exportCsv());
      } catch (cause) {
         setActionError(errorMessage(cause, 'Could not export subscribers'));
      } finally {
         setExporting(false);
      }
   }

   function downloadImportTemplate() {
      downloadCsv('subscribers-template.csv', SUBSCRIBER_CSV_TEMPLATE);
   }

   function clearSelection() {
      setSelectedIds(new Set());
   }

   function openBulkTags() {
      setBulkTags([]);
      setBulkTagsError(null);
      setBulkTagsOpen(true);
   }

   async function submitBulkTags() {
      if (bulkTags.length === 0) {
         setBulkTagsError('Choose at least one tag to add.');
         return;
      }

      setBulkTagsBusy(true);
      setBulkTagsError(null);
      try {
         const result = await bulkUpdateTags({
            subscriberIds: [...selectedIds],
            add: bulkTags.map((tag) => tag.id),
         });
         toast({
            title: `Added ${pluralise(bulkTags.length, 'tag')} to ${pluralise(result.updated, 'subscriber')}`,
            variant: 'success',
         });
         setBulkTagsOpen(false);
         clearSelection();
         setReloadKey((key) => key + 1);
      } catch (cause) {
         setBulkTagsError(errorMessage(cause, 'Could not update the tags'));
      } finally {
         setBulkTagsBusy(false);
      }
   }

   function openBulkMetadata() {
      setBulkMetadataMode('set');
      setBulkMetadataKey('company');
      setBulkMetadataValue('');
      setBulkMetadataError(null);
      setBulkMetadataOpen(true);
   }

   async function submitBulkMetadata() {
      const key = bulkMetadataKey.trim();
      const issues = validateMetadataRows([{ key, value: bulkMetadataValue }]);
      if (issues.general !== undefined) {
         setBulkMetadataError(issues.general);
         return;
      }
      if (issues.rowErrors[0] !== undefined) {
         setBulkMetadataError(issues.rowErrors[0]);
         return;
      }

      setBulkMetadataBusy(true);
      setBulkMetadataError(null);
      try {
         const result = await bulkUpdateMetadata({
            subscriberIds: [...selectedIds],
            metadata: { [key]: bulkMetadataMode === 'remove' ? null : bulkMetadataValue },
         });
         toast({
            title:
               bulkMetadataMode === 'remove'
                  ? `Removed "${key}" from ${pluralise(result.updated, 'subscriber')}`
                  : `Set "${key}" on ${pluralise(result.updated, 'subscriber')}`,
            variant: 'success',
         });
         setBulkMetadataOpen(false);
         clearSelection();
         setReloadKey((keyValue) => keyValue + 1);
      } catch (cause) {
         setBulkMetadataError(errorMessage(cause, 'Could not update the custom field'));
      } finally {
         setBulkMetadataBusy(false);
      }
   }

   async function confirmBulkDelete() {
      setBulkDeleteBusy(true);
      setBulkDeleteError(null);
      try {
         const result = await bulkDeleteSubscribers([...selectedIds]);
         toast({
            title: `Deleted ${pluralise(result.deleted, 'subscriber')}`,
            variant: 'success',
         });
         setBulkDeleteOpen(false);
         clearSelection();
         setReloadKey((key) => key + 1);
      } catch (cause) {
         setBulkDeleteError(errorMessage(cause, 'Could not delete the subscribers'));
      } finally {
         setBulkDeleteBusy(false);
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
                  aria-label={`Open ${subscriber.email}`}
                  onClick={() => openPanel(subscriber)}
               >
                  <Pencil aria-hidden="true" />
               </Button>
               <Button
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground hover:text-destructive"
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
      <>
         <div
            className="grid gap-6 transition-[padding] duration-200"
            style={{ paddingRight: panelInset }}
         >
            <PageHeader
               title="Subscribers"
               description="Everyone who can receive a campaign. Suppressed subscribers are never enqueued."
               actionGuideId="subscribers-actions"
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
               <div className="relative min-w-0 flex-1">
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
                           <span className="truncate">
                              {statusFilter === 'all' ? 'All statuses' : titleCase(statusFilter)}
                           </span>
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
                           <span className="truncate">
                              {tagFilter === 'all' ? 'All tags' : tagFilter}
                           </span>
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

            {selectedIds.size > 0 && (
               <div
                  role="region"
                  aria-label="Bulk actions"
                  className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2"
               >
                  <p className="text-sm font-medium">
                     {pluralise(selectedIds.size, 'subscriber')} selected
                  </p>
                  <Button
                     size="sm"
                     variant="outline"
                     onClick={openBulkTags}
                  >
                     <TagIcon aria-hidden="true" />
                     Add tags
                  </Button>
                  <Button
                     size="sm"
                     variant="outline"
                     onClick={openBulkMetadata}
                  >
                     <SlidersHorizontal aria-hidden="true" />
                     Set custom field
                  </Button>
                  <Button
                     size="sm"
                     variant="outline"
                     className="text-destructive hover:text-destructive"
                     onClick={() => {
                        setBulkDeleteError(null);
                        setBulkDeleteOpen(true);
                     }}
                  >
                     <Trash2 aria-hidden="true" />
                     Delete
                  </Button>
                  <Button
                     size="sm"
                     variant="ghost"
                     className="ml-auto"
                     onClick={clearSelection}
                  >
                     Clear selection
                  </Button>
               </div>
            )}

            <div
               data-guide="subscribers-table"
               className="grid min-w-0 gap-3"
            >
               <DataTable
                  caption="Subscribers. Tick rows to update several at once. Select a row to open its details."
                  selectable
                  selectedKeys={selectedIds}
                  onSelectionChange={setSelectedIds}
                  onRowClick={openPanel}
                  onRowDoubleClick={openPanel}
                  highlightedKey={panelSubscriber?.id ?? null}
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
            </div>

            {panelSubscriber !== null && (
               <SubscriberPanel
                  subscriber={panelSubscriber}
                  onClose={() => setPanelSubscriber(null)}
                  onSaved={(next) => {
                     setPanelSubscriber(next);
                     setReloadKey((key) => key + 1);
                  }}
                  onDeleted={(subscriber) => {
                     setDeleting(subscriber);
                     setDeleteError(null);
                  }}
               />
            )}
         </div>

         <Dialog
            open={bulkTagsOpen}
            onOpenChange={(open) => {
               setBulkTagsOpen(open);
               if (!open) {
                  setBulkTags([]);
                  setBulkTagsError(null);
               }
            }}
         >
            <DialogContent>
               <DialogHeader>
                  <DialogTitle>Add tags to selected subscribers</DialogTitle>
                  <DialogDescription>
                     {pluralise(selectedIds.size, 'subscriber')} selected. Tags are added alongside
                     whatever each subscriber already has; nothing is removed.
                  </DialogDescription>
               </DialogHeader>

               <Field
                  label="Tags"
                  htmlFor="bulk-subscriber-tags"
                  hint="Search existing tags, or type a new name and press Enter to create it."
               >
                  <TagPicker
                     id="bulk-subscriber-tags"
                     value={bulkTags}
                     onChange={setBulkTags}
                     disabled={bulkTagsBusy}
                     placeholder="Search or create a tag…"
                  />
               </Field>

               {bulkTagsError !== null && (
                  <Alert variant="destructive">
                     <AlertDescription>{bulkTagsError}</AlertDescription>
                  </Alert>
               )}

               <DialogFooter>
                  <DialogClose disabled={bulkTagsBusy}>Cancel</DialogClose>
                  <Button
                     disabled={bulkTagsBusy || bulkTags.length === 0}
                     onClick={() => void submitBulkTags()}
                  >
                     {bulkTagsBusy ? 'Adding…' : 'Add tags'}
                  </Button>
               </DialogFooter>
            </DialogContent>
         </Dialog>

         <Dialog
            open={bulkMetadataOpen}
            onOpenChange={(open) => {
               setBulkMetadataOpen(open);
               if (!open) setBulkMetadataError(null);
            }}
         >
            <DialogContent>
               <DialogHeader>
                  <DialogTitle>Set a custom field</DialogTitle>
                  <DialogDescription>
                     Applies one key/value pair to {pluralise(selectedIds.size, 'subscriber')}. Use
                     it for shared attributes such as company or plan.
                  </DialogDescription>
               </DialogHeader>

               <div className="grid gap-4">
                  <Field
                     label="Action"
                     htmlFor="bulk-metadata-mode"
                  >
                     <Select
                        value={bulkMetadataMode}
                        onValueChange={(value) => {
                           if (value === 'set' || value === 'remove') setBulkMetadataMode(value);
                        }}
                     >
                        <SelectTrigger id="bulk-metadata-mode">
                           <span>
                              {bulkMetadataMode === 'set' ? 'Set the value' : 'Remove the field'}
                           </span>
                        </SelectTrigger>
                        <SelectContent>
                           <SelectItem value="set">Set the value</SelectItem>
                           <SelectItem value="remove">Remove the field</SelectItem>
                        </SelectContent>
                     </Select>
                  </Field>

                  <Field
                     label="Key"
                     htmlFor="bulk-metadata-key"
                     hint="Lowercase letters, digits and underscores, for example company."
                     required
                  >
                     <Input
                        id="bulk-metadata-key"
                        value={bulkMetadataKey}
                        disabled={bulkMetadataBusy}
                        spellcheck={false}
                        onInput={(event) => setBulkMetadataKey(event.currentTarget.value)}
                     />
                  </Field>

                  {bulkMetadataMode === 'set' && (
                     <Field
                        label="Value"
                        htmlFor="bulk-metadata-value"
                     >
                        <Input
                           id="bulk-metadata-value"
                           value={bulkMetadataValue}
                           disabled={bulkMetadataBusy}
                           placeholder="Acme Inc."
                           onInput={(event) => setBulkMetadataValue(event.currentTarget.value)}
                        />
                     </Field>
                  )}

                  {bulkMetadataError !== null && (
                     <Alert variant="destructive">
                        <AlertDescription>{bulkMetadataError}</AlertDescription>
                     </Alert>
                  )}
               </div>

               <DialogFooter>
                  <DialogClose disabled={bulkMetadataBusy}>Cancel</DialogClose>
                  <Button
                     disabled={bulkMetadataBusy}
                     onClick={() => void submitBulkMetadata()}
                  >
                     {bulkMetadataBusy
                        ? 'Saving…'
                        : bulkMetadataMode === 'remove'
                          ? 'Remove field'
                          : 'Set field'}
                  </Button>
               </DialogFooter>
            </DialogContent>
         </Dialog>

         <ConfirmDialog
            open={bulkDeleteOpen}
            onOpenChange={(open) => {
               if (!open && !bulkDeleteBusy) {
                  setBulkDeleteOpen(false);
                  setBulkDeleteError(null);
               }
            }}
            title="Delete selected subscribers"
            description={`Delete ${pluralise(selectedIds.size, 'subscriber')}? They are removed from future campaigns but historical stats are kept.`}
            confirmLabel="Delete subscribers"
            destructive
            loading={bulkDeleteBusy}
            error={bulkDeleteError}
            onConfirm={confirmBulkDelete}
         />

         <Dialog
            open={formOpen}
            onOpenChange={(open) => {
               setFormOpen(open);
               if (!open) resetForm();
            }}
         >
            <DialogContent>
               <DialogHeader>
                  <DialogTitle>Add subscriber</DialogTitle>
                  <DialogDescription>
                     Create a subscriber record and choose any tags it should start with.
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
                           setForm((current) => ({
                              ...current,
                              email: event.currentTarget.value,
                           }))
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
                     hint="Tags are attached after the subscriber is created."
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
                        {saving ? 'Saving…' : 'Add subscriber'}
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
                     Upload one subscriber per row. Only the email column is required; rows that
                     fail validation are reported below.
                  </DialogDescription>
               </DialogHeader>

               <div className="grid gap-4">
                  <div className="grid gap-3 rounded-lg border border-border bg-muted/30 p-3">
                     <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-medium">CSV format</p>
                        <Button
                           type="button"
                           variant="outline"
                           size="sm"
                           onClick={downloadImportTemplate}
                        >
                           <Download aria-hidden="true" />
                           Download template
                        </Button>
                     </div>
                     <dl className="grid gap-1.5 text-xs">
                        <div className="flex flex-wrap gap-1">
                           <dt className="font-medium">Required</dt>
                           <dd className="text-muted-foreground">
                              <code className="rounded bg-background px-1 py-0.5">email</code>
                           </dd>
                        </div>
                        <div className="flex flex-wrap gap-1">
                           <dt className="font-medium">Optional</dt>
                           <dd className="text-muted-foreground">
                              <code className="rounded bg-background px-1 py-0.5">first_name</code>,{' '}
                              <code className="rounded bg-background px-1 py-0.5">last_name</code>,{' '}
                              <code className="rounded bg-background px-1 py-0.5">tags</code> and{' '}
                              <code className="rounded bg-background px-1 py-0.5">metadata</code>
                           </dd>
                        </div>
                     </dl>
                     <p className="text-xs text-muted-foreground">
                        Separate tags with <code className="rounded bg-background px-1">;</code>.
                        Write metadata as{' '}
                        <code className="rounded bg-background px-1">key=value</code> pairs
                        separated by <code className="rounded bg-background px-1">;</code>. Unknown
                        columns are ignored.
                     </p>
                  </div>

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
      </>
   );
}
