import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'preact-iso';
import { Copy, FileText, LayoutTemplate, Plus, Search, Trash2 } from 'lucide-react';
import {
   Alert,
   AlertDescription,
   Badge,
   Button,
   Dialog,
   DialogClose,
   DialogContent,
   DialogDescription,
   DialogHeader,
   DialogTitle,
   EmptyState,
   Input,
   Skeleton,
} from '@postwren/ui';
import { createDocument } from '@postwren/email/ir';
import { ConfirmDialog } from '@/components/confirm-dialog';
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
import { useDebouncedValue } from '@/lib/hooks';
import { STARTERS } from '@/lib/starters';
import type { Starter } from '@/lib/starters';

function TemplatePreview({ template }: { template: Template }) {
   const containerRef = useRef<HTMLDivElement>(null);
   const [scale, setScale] = useState(0.5);

   useEffect(() => {
      const element = containerRef.current;
      if (element === null) return;

      const update = (width: number) => {
         setScale(Math.max(0.2, width / 600));
      };

      update(element.getBoundingClientRect().width);
      const observer = new ResizeObserver((entries) => {
         const entry = entries[0];
         if (entry !== undefined) update(entry.contentRect.width);
      });
      observer.observe(element);
      return () => observer.disconnect();
   }, []);

   return (
      <div
         ref={containerRef}
         className="relative h-44 overflow-hidden border-b border-border bg-white"
      >
         {template.preview_html === null ? (
            <div className="flex h-full items-center justify-center bg-muted/40 text-muted-foreground">
               <FileText
                  className="size-6"
                  aria-hidden="true"
               />
            </div>
         ) : (
            <iframe
               title={`Preview of ${template.name}`}
               srcDoc={template.preview_html}
               sandbox=""
               tabIndex={-1}
               aria-hidden="true"
               loading="lazy"
               scrolling="no"
               className="pointer-events-none absolute top-0 left-0 origin-top-left border-0"
               style={{
                  width: '600px',
                  height: '560px',
                  transform: `scale(${scale})`,
               }}
            />
         )}
      </div>
   );
}

function TemplateCard({
   template,
   duplicating,
   onDuplicate,
   onDelete,
}: {
   template: Template;
   duplicating: boolean;
   onDuplicate: () => void;
   onDelete: () => void;
}) {
   const href = `/templates/${template.id}`;

   return (
      <article className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-[transform,box-shadow] duration-150 hover:-translate-y-0.5 hover:shadow-md">
         <a
            href={href}
            className="block outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
            aria-label={`Open ${template.name}`}
         >
            <TemplatePreview template={template} />
         </a>

         <div className="flex flex-1 items-start gap-2 p-4">
            <div className="min-w-0 flex-1">
               <a
                  href={href}
                  className="block truncate text-sm font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
               >
                  {template.name}
               </a>
               <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {template.subject.trim().length > 0 ? template.subject : 'No subject yet'}
               </p>
               <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                  <Badge variant="secondary">v{template.revision}</Badge>
                  <span title={formatDate(template.updated_at)}>
                     Edited {relativeTime(template.updated_at)}
                  </span>
               </div>
            </div>

            <div className="flex shrink-0 items-center">
               <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Duplicate ${template.name}`}
                  disabled={duplicating}
                  onClick={onDuplicate}
               >
                  <Copy aria-hidden="true" />
               </Button>
               <Button
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground hover:text-destructive"
                  aria-label={`Delete ${template.name}`}
                  onClick={onDelete}
               >
                  <Trash2 aria-hidden="true" />
               </Button>
            </div>
         </div>
      </article>
   );
}

function StarterCard({
   starter,
   busy,
   onUse,
}: {
   starter: Starter;
   busy: boolean;
   onUse: () => void;
}) {
   return (
      <button
         type="button"
         disabled={busy}
         onClick={onUse}
         className="grid gap-1 rounded-lg border border-border bg-card p-4 text-left outline-none transition-colors hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
      >
         <span className="text-sm font-medium">{starter.name}</span>
         <span className="text-xs leading-relaxed text-muted-foreground">
            {starter.description}
         </span>
         <span className="mt-1 text-[11px] font-medium text-ochre">
            {busy ? 'Creating…' : 'Use this starter'}
         </span>
      </button>
   );
}

export function Templates() {
   const { route } = useLocation();
   const [templates, setTemplates] = useState<Template[]>([]);
   const [loading, setLoading] = useState(true);
   const [loadError, setLoadError] = useState<string | null>(null);
   const [reloadKey, setReloadKey] = useState(0);
   const [actionError, setActionError] = useState<string | null>(null);
   const [search, setSearch] = useState('');
   const debouncedSearch = useDebouncedValue(search, 250);
   const [creating, setCreating] = useState(false);
   const [creatingStarterId, setCreatingStarterId] = useState<string | null>(null);
   const [startersOpen, setStartersOpen] = useState(false);
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

   const filteredTemplates = useMemo(() => {
      const needle = debouncedSearch.trim().toLowerCase();
      if (needle.length === 0) return templates;
      return templates.filter(
         (template) =>
            template.name.toLowerCase().includes(needle) ||
            template.subject.toLowerCase().includes(needle),
      );
   }, [templates, debouncedSearch]);

   const searchActive = debouncedSearch.trim().length > 0;

   function clearSearch(): void {
      setSearch('');
   }

   async function createBlank() {
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

   async function createFromStarter(starter: Starter) {
      setActionError(null);
      setCreatingStarterId(starter.id);
      try {
         const template = await createTemplate({
            name: starter.name,
            subject: starter.subject,
            irJson: starter.build(),
         });
         route(`/templates/${template.id}`);
      } catch (cause) {
         setActionError(errorMessage(cause, 'Could not create the template'));
      } finally {
         setCreatingStarterId(null);
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

   return (
      <div className="grid gap-6">
         <PageHeader
            title="Templates"
            description="Reusable email documents. Campaigns pin a template revision when they are sent."
            actionGuideId="templates-actions"
            actions={
               <>
                  <Button
                     variant="outline"
                     onClick={() => setStartersOpen(true)}
                  >
                     <LayoutTemplate aria-hidden="true" />
                     Browse starters
                  </Button>
                  <Button
                     disabled={creating}
                     onClick={() => void createBlank()}
                  >
                     <Plus aria-hidden="true" />
                     {creating ? 'Creating…' : 'New template'}
                  </Button>
               </>
            }
         />

         <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
               <Search
                  className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
               />
               <Input
                  id="template-search"
                  aria-label="Search templates"
                  value={search}
                  placeholder="Search by name or subject"
                  className="pl-9"
                  onInput={(event) => setSearch(event.currentTarget.value)}
               />
            </div>
            {searchActive && (
               <div className="flex items-center gap-3">
                  <p
                     className="text-sm text-muted-foreground"
                     role="status"
                     aria-live="polite"
                  >
                     {filteredTemplates.length} of {templates.length} templates
                  </p>
                  <Button
                     variant="outline"
                     size="sm"
                     onClick={clearSearch}
                  >
                     Clear search
                  </Button>
               </div>
            )}
         </div>

         {actionError !== null && (
            <Alert variant="destructive">
               <AlertDescription>{actionError}</AlertDescription>
            </Alert>
         )}

         {loadError !== null ? (
            <Alert variant="destructive">
               <AlertDescription>
                  <p>{loadError}</p>
                  <Button
                     variant="outline"
                     size="sm"
                     className="mt-3"
                     onClick={() => setReloadKey((key) => key + 1)}
                  >
                     Try again
                  </Button>
               </AlertDescription>
            </Alert>
         ) : loading && templates.length === 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
               {Array.from({ length: 6 }, (_, index) => (
                  <div
                     key={index}
                     className="overflow-hidden rounded-xl border border-border bg-card"
                  >
                     <Skeleton className="h-44 rounded-none" />
                     <div className="grid gap-2 p-4">
                        <Skeleton className="h-4 w-40" />
                        <Skeleton className="h-3 w-56" />
                     </div>
                  </div>
               ))}
            </div>
         ) : templates.length === 0 ? (
            <div className="grid gap-8">
               <EmptyState
                  icon={<LayoutTemplate aria-hidden="true" />}
                  title="Start with a template"
                  description="Pick a starter, replace the copy, and send it to a campaign. You can also start from a blank document."
                  action={
                     <Button
                        variant="outline"
                        disabled={creating}
                        onClick={() => void createBlank()}
                     >
                        <Plus aria-hidden="true" />
                        Start blank
                     </Button>
                  }
               />

               <section className="grid gap-3">
                  <div className="grid gap-1">
                     <h2 className="font-display text-xl font-medium">Starters</h2>
                     <p className="text-sm text-muted-foreground">
                        Five email shapes that cover most of what a small list sends.
                     </p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                     {STARTERS.map((starter) => (
                        <StarterCard
                           key={starter.id}
                           starter={starter}
                           busy={creatingStarterId === starter.id}
                           onUse={() => void createFromStarter(starter)}
                        />
                     ))}
                  </div>
               </section>
            </div>
         ) : filteredTemplates.length === 0 ? (
            <EmptyState
               icon={<Search aria-hidden="true" />}
               title="No templates match your search"
               description="Try a different name or subject."
               action={
                  <Button
                     variant="outline"
                     onClick={clearSearch}
                  >
                     Clear search
                  </Button>
               }
            />
         ) : (
            <div
               data-guide="templates-table"
               className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
            >
               {filteredTemplates.map((template) => (
                  <TemplateCard
                     key={template.id}
                     template={template}
                     duplicating={duplicatingId === template.id}
                     onDuplicate={() => void duplicate(template)}
                     onDelete={() => {
                        setDeleting(template);
                        setDeleteError(null);
                     }}
                  />
               ))}
            </div>
         )}

         <Dialog
            open={startersOpen}
            onOpenChange={setStartersOpen}
         >
            <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
               <DialogHeader>
                  <DialogTitle>Start from a starter</DialogTitle>
                  <DialogDescription>
                     Each starter creates a new template with real copy you can replace.
                  </DialogDescription>
               </DialogHeader>

               <div className="grid gap-3 sm:grid-cols-2">
                  {STARTERS.map((starter) => (
                     <StarterCard
                        key={starter.id}
                        starter={starter}
                        busy={creatingStarterId === starter.id}
                        onUse={() => void createFromStarter(starter)}
                     />
                  ))}
               </div>

               <div className="flex justify-end">
                  <DialogClose>Close</DialogClose>
               </div>
            </DialogContent>
         </Dialog>

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
