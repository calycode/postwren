import { useEffect, useState } from 'react';
import { useLocation } from 'preact-iso';
import { Copy, FileText, Plus, Trash2 } from 'lucide-react';
import { Alert, AlertDescription, Badge, Button } from '@mailer/ui';
import { createDocument } from '@mailer/email/ir';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DataTable } from '@/components/data-table';
import type { DataTableColumn } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import {
   create as createTemplate,
   duplicate as duplicateTemplate,
   list as listTemplates,
   remove as removeTemplate,
} from '@/lib/api/templates';
import type { Template } from '@/lib/api/types';
import { errorMessage } from '@/lib/form-errors';
import { formatDate, relativeTime } from '@/lib/format';

export function Templates() {
   const { route } = useLocation();
   const [templates, setTemplates] = useState<Template[]>([]);
   const [loading, setLoading] = useState(true);
   const [loadError, setLoadError] = useState<string | null>(null);
   const [reloadKey, setReloadKey] = useState(0);
   const [actionError, setActionError] = useState<string | null>(null);
   const [creating, setCreating] = useState(false);
   const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
   const [deleting, setDeleting] = useState<Template | null>(null);
   const [deleteBusy, setDeleteBusy] = useState(false);
   const [deleteError, setDeleteError] = useState<string | null>(null);

   useEffect(() => {
      let cancelled = false;
      setLoading(true);
      setLoadError(null);

      listTemplates()
         .then((result) => {
            if (!cancelled) setTemplates(result);
         })
         .catch((cause: unknown) => {
            if (!cancelled) setLoadError(errorMessage(cause, 'Could not load templates'));
         })
         .finally(() => {
            if (!cancelled) setLoading(false);
         });

      return () => {
         cancelled = true;
      };
   }, [reloadKey]);

   async function createTemplateAndOpen() {
      setActionError(null);
      setCreating(true);
      try {
         const template = await createTemplate({
            name: 'Untitled template',
            subject: 'Untitled template',
            irJson: createDocument(),
         });
         route(`/templates/${template.id}`);
      } catch (cause) {
         setActionError(errorMessage(cause, 'Could not create the template'));
      } finally {
         setCreating(false);
      }
   }

   async function duplicate(template: Template) {
      setActionError(null);
      setDuplicatingId(template.id);
      try {
         await duplicateTemplate(template.id);
         setReloadKey((key) => key + 1);
      } catch (cause) {
         setActionError(errorMessage(cause, 'Could not duplicate the template'));
      } finally {
         setDuplicatingId(null);
      }
   }

   async function confirmDelete() {
      if (!deleting) return;
      setDeleteBusy(true);
      setDeleteError(null);
      try {
         await removeTemplate(deleting.id);
         setDeleting(null);
         setReloadKey((key) => key + 1);
      } catch (cause) {
         setDeleteError(errorMessage(cause, 'Could not delete the template'));
      } finally {
         setDeleteBusy(false);
      }
   }

   const columns: DataTableColumn<Template>[] = [
      {
         id: 'name',
         header: 'Name',
         cell: (template) => (
            <a
               href={`/templates/${template.id}`}
               className="font-medium underline-offset-4 hover:underline"
            >
               {template.name}
            </a>
         ),
      },
      {
         id: 'subject',
         header: 'Subject',
         cell: (template) => <span className="text-muted-foreground">{template.subject}</span>,
      },
      {
         id: 'revision',
         header: 'Revision',
         cell: (template) => <Badge variant="secondary">v{template.revision}</Badge>,
      },
      {
         id: 'updated',
         header: 'Updated',
         cell: (template) => (
            <span
               className="text-muted-foreground"
               title={formatDate(template.updated_at)}
            >
               {relativeTime(template.updated_at)}
            </span>
         ),
      },
      {
         id: 'actions',
         header: <span className="sr-only">Actions</span>,
         headerClassName: 'text-right',
         className: 'text-right',
         cell: (template) => (
            <div className="flex justify-end gap-1">
               <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Duplicate ${template.name}`}
                  disabled={duplicatingId === template.id}
                  onClick={() => void duplicate(template)}
               >
                  <Copy aria-hidden="true" />
               </Button>
               <Button
                  variant="ghost"
                  size="icon"
                  className="text-destructive hover:text-destructive"
                  aria-label={`Delete ${template.name}`}
                  onClick={() => {
                     setDeleting(template);
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
            title="Templates"
            description="Reusable email documents. Campaigns pin a template revision when they are sent."
            actions={
               <Button
                  disabled={creating}
                  onClick={() => void createTemplateAndOpen()}
               >
                  <Plus aria-hidden="true" />
                  {creating ? 'Creating…' : 'New template'}
               </Button>
            }
         />

         {actionError !== null && (
            <Alert variant="destructive">
               <AlertDescription>{actionError}</AlertDescription>
            </Alert>
         )}

         <DataTable
            caption="Templates"
            columns={columns}
            rows={templates}
            rowKey={(template) => template.id}
            loading={loading}
            error={loadError}
            onRetry={() => setReloadKey((key) => key + 1)}
            empty={{
               title: 'No templates yet',
               description: 'Create a template to start building an email document.',
               icon: <FileText aria-hidden="true" />,
               action: (
                  <Button
                     disabled={creating}
                     onClick={() => void createTemplateAndOpen()}
                  >
                     <Plus aria-hidden="true" />
                     New template
                  </Button>
               ),
            }}
         />

         <ConfirmDialog
            open={deleting !== null}
            onOpenChange={(open) => {
               if (!open) setDeleting(null);
            }}
            title="Delete template"
            description={
               deleting
                  ? `Delete "${deleting.name}"? Campaigns that already pinned a revision are not affected.`
                  : ''
            }
            confirmLabel="Delete template"
            destructive
            loading={deleteBusy}
            error={deleteError}
            onConfirm={confirmDelete}
         />
      </div>
   );
}
