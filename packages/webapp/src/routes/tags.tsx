import { useEffect, useState } from 'react';
import { Pencil, Plus, Tag as TagIcon, Trash2 } from 'lucide-react';
import { Alert, AlertDescription, Button, Field, Input } from '@postwren/ui';
import { DataTable } from '@/components/data-table';
import type { DataTableColumn } from '@/components/data-table';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { useDetailPanelInset } from '@/components/detail-panel';
import { PageHeader } from '@/components/page-header';
import { TagPanel } from '@/components/tag-panel';
import { create as createTag, list as listTags, remove as removeTag } from '@/lib/api/tags';
import { ApiError } from '@/lib/api/client';
import type { Tag } from '@/lib/api/types';
import { errorMessage, fieldErrorsFrom } from '@/lib/form-errors';
import type { FieldErrors } from '@/lib/form-errors';
import { formatNumber } from '@/lib/format';

export function Tags() {
   const [tags, setTags] = useState<Tag[]>([]);
   const [loading, setLoading] = useState(true);
   const [loadError, setLoadError] = useState<string | null>(null);
   const [reloadKey, setReloadKey] = useState(0);

   const [newName, setNewName] = useState('');
   const [creating, setCreating] = useState(false);
   const [createError, setCreateError] = useState<string | null>(null);
   const [createErrors, setCreateErrors] = useState<FieldErrors>({});

   const [panelTag, setPanelTag] = useState<Tag | null>(null);
   const panelOpen = panelTag !== null;
   const panelInset = useDetailPanelInset(panelOpen);

   const [deleting, setDeleting] = useState<Tag | null>(null);
   const [deleteBusy, setDeleteBusy] = useState(false);
   const [deleteError, setDeleteError] = useState<string | null>(null);

   useEffect(() => {
      let cancelled = false;
      setLoading(true);
      setLoadError(null);

      listTags()
         .then((result) => {
            if (!cancelled) setTags(result);
         })
         .catch((cause: unknown) => {
            if (!cancelled) setLoadError(errorMessage(cause, 'Could not load tags'));
         })
         .finally(() => {
            if (!cancelled) setLoading(false);
         });

      return () => {
         cancelled = true;
      };
   }, [reloadKey]);

   async function submitCreate(event: Event) {
      event.preventDefault();
      setCreateError(null);
      setCreateErrors({});

      const name = newName.trim();
      if (name.length === 0) {
         setCreateErrors({ name: 'Enter a tag name.' });
         return;
      }

      setCreating(true);
      try {
         await createTag(name);
         setNewName('');
         setReloadKey((key) => key + 1);
      } catch (cause) {
         setCreateError(errorMessage(cause, 'Could not create the tag'));
         setCreateErrors(cause instanceof ApiError ? fieldErrorsFrom(cause.details) : {});
      } finally {
         setCreating(false);
      }
   }

   function openPanel(tag: Tag) {
      setPanelTag(tag);
   }

   function applySavedTag(updated: Tag): void {
      setPanelTag((current) => (current === null ? updated : { ...current, ...updated }));
      setTags((current) =>
         current.map((tag) => (tag.id === updated.id ? { ...tag, ...updated } : tag)),
      );
      setReloadKey((key) => key + 1);
   }

   async function confirmDelete() {
      if (!deleting) return;
      setDeleteBusy(true);
      setDeleteError(null);
      try {
         await removeTag(deleting.id);
         if (panelTag?.id === deleting.id) setPanelTag(null);
         setDeleting(null);
         setReloadKey((key) => key + 1);
      } catch (cause) {
         setDeleteError(errorMessage(cause, 'Could not delete the tag'));
      } finally {
         setDeleteBusy(false);
      }
   }

   const columns: DataTableColumn<Tag>[] = [
      {
         id: 'name',
         header: 'Name',
         cell: (tag) => <span className="font-medium">{tag.name}</span>,
      },
      {
         id: 'count',
         header: 'Subscribers',
         cell: (tag) => (
            <span className="text-muted-foreground">{formatNumber(tag.subscriber_count ?? 0)}</span>
         ),
      },
      {
         id: 'campaigns',
         header: 'Campaigns',
         cell: (tag) => (
            <span className="text-muted-foreground">{formatNumber(tag.campaign_count ?? 0)}</span>
         ),
      },
      {
         id: 'automations',
         header: 'Automations',
         cell: (tag) => (
            <span className="text-muted-foreground">{formatNumber(tag.automation_count ?? 0)}</span>
         ),
      },
      {
         id: 'actions',
         header: <span className="sr-only">Actions</span>,
         headerClassName: 'text-right',
         className: 'text-right',
         cell: (tag) => (
            <div className="flex justify-end gap-1">
               <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Open ${tag.name}`}
                  onClick={() => openPanel(tag)}
               >
                  <Pencil aria-hidden="true" />
               </Button>
               <Button
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground hover:text-destructive"
                  aria-label={`Delete ${tag.name}`}
                  onClick={() => {
                     setDeleting(tag);
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
      <div
         className="grid gap-6 transition-[padding] duration-200"
         style={{ paddingRight: panelInset }}
      >
         <PageHeader
            title="Tags"
            description="Group subscribers so campaigns can target them with the audience query language."
         />

         <form
            className="flex flex-col gap-3 sm:flex-row sm:items-start"
            onSubmit={submitCreate}
            noValidate
            data-guide="tags-create"
         >
            <div className="w-full max-w-sm">
               <Field
                  label="New tag"
                  htmlFor="new-tag"
                  error={createErrors.name}
               >
                  <Input
                     id="new-tag"
                     value={newName}
                     placeholder="e.g. newsletter"
                     aria-invalid={createErrors.name ? 'true' : undefined}
                     aria-describedby={createErrors.name ? 'new-tag-error' : undefined}
                     onInput={(event) => setNewName(event.currentTarget.value)}
                  />
               </Field>
            </div>
            <Button
               type="submit"
               disabled={creating}
               className="sm:mt-6"
            >
               <Plus aria-hidden="true" />
               {creating ? 'Adding…' : 'Add tag'}
            </Button>
         </form>

         {createError !== null && (
            <Alert variant="destructive">
               <AlertDescription>{createError}</AlertDescription>
            </Alert>
         )}

         <DataTable
            caption="Tags. Select a row to rename it or see where it is used."
            columns={columns}
            rows={tags}
            rowKey={(tag) => tag.id}
            loading={loading}
            error={loadError}
            onRetry={() => setReloadKey((key) => key + 1)}
            onRowClick={openPanel}
            onRowDoubleClick={openPanel}
            highlightedKey={panelTag?.id ?? null}
            empty={{
               title: 'No tags yet',
               description: 'Create a tag above, then assign it to subscribers.',
               icon: <TagIcon aria-hidden="true" />,
            }}
         />

         {panelTag !== null && (
            <TagPanel
               tag={panelTag}
               onClose={() => setPanelTag(null)}
               onSaved={applySavedTag}
               onDeleted={(tag) => {
                  setDeleting(tag);
                  setDeleteError(null);
               }}
            />
         )}

         <ConfirmDialog
            open={deleting !== null}
            onOpenChange={(open) => {
               if (!open) setDeleting(null);
            }}
            title="Delete tag"
            description={
               deleting
                  ? `Delete "${deleting.name}"? Subscribers keep their records; the tag is removed from them.`
                  : ''
            }
            confirmLabel="Delete tag"
            destructive
            loading={deleteBusy}
            error={deleteError}
            onConfirm={confirmDelete}
         />
      </div>
   );
}
