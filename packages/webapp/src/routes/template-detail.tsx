import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useRoute } from 'preact-iso';
import { ArrowLeft, FileText } from 'lucide-react';
import { documentIssues } from '@mailer/email/ir';
import type { Document } from '@mailer/email/ir';
import type { RenderWarning } from '@mailer/email/render';
import { EmailEditor } from '@mailer/editor';
import {
   Alert,
   AlertDescription,
   AlertTitle,
   Button,
   EmptyState,
   Skeleton,
   buttonVariants,
} from '@mailer/ui';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { EditorHeader } from '@/components/editor/editor-header';
import { EmailPreviewDialog } from '@/components/editor/preview-dialog';
import { issuesFromDetails } from '@/components/editor/server-issues';
import { formatBytes, parseTemplateDocument } from '@/components/editor/template-document';
import {
   duplicate as duplicateTemplate,
   get as getTemplate,
   remove as removeTemplate,
   update as updateTemplate,
} from '@/lib/api/templates';
import { ApiError } from '@/lib/api/client';
import type { Template } from '@/lib/api/types';
import { errorMessage } from '@/lib/form-errors';

type RenderResult = {
   html: string;
   text: string;
   bytes: number;
   warnings: RenderWarning[];
};

const AUTOSAVE_DELAY_MS = 2000;
const BYTE_BUDGET_BYTES = 90 * 1024;
const WORKBENCH_HEIGHT =
   'h-[calc(100dvh_-_5.5rem)] sm:h-[calc(100dvh_-_6.5rem)] lg:h-[calc(100dvh_-_7.5rem)]';

export function TemplateDetail() {
   const { params } = useRoute();
   const { route } = useLocation();
   const id = params.id ?? '';

   const [template, setTemplate] = useState<Template | null>(null);
   const [doc, setDoc] = useState<Document | null>(null);
   const [savedDoc, setSavedDoc] = useState<Document | null>(null);
   const [name, setName] = useState('');
   const [subject, setSubject] = useState('');
   const [savedName, setSavedName] = useState('');
   const [savedSubject, setSavedSubject] = useState('');
   const [loadIssues, setLoadIssues] = useState<string[]>([]);
   const [loading, setLoading] = useState(true);
   const [loadError, setLoadError] = useState<string | null>(null);
   const [reloadKey, setReloadKey] = useState(0);
   const [saving, setSaving] = useState(false);
   const [saveError, setSaveError] = useState<string | null>(null);
   const [saveIssues, setSaveIssues] = useState<string[]>([]);
   const [actionError, setActionError] = useState<string | null>(null);
   const [duplicateBusy, setDuplicateBusy] = useState(false);
   const [previewOpen, setPreviewOpen] = useState(false);
   const [render, setRender] = useState<RenderResult | null>(null);
   const [deleteOpen, setDeleteOpen] = useState(false);
   const [deleteBusy, setDeleteBusy] = useState(false);
   const [deleteError, setDeleteError] = useState<string | null>(null);

   const idRef = useRef(id);
   idRef.current = id;
   const docRef = useRef<Document | null>(null);
   const savedDocRef = useRef<Document | null>(null);
   const nameRef = useRef('');
   const subjectRef = useRef('');
   const savedNameRef = useRef('');
   const savedSubjectRef = useRef('');
   const saveInFlightRef = useRef(false);
   const pendingSaveRef = useRef(false);
   const inflightValuesRef = useRef<{ doc: Document; name: string; subject: string } | null>(null);
   const autosaveTimerRef = useRef<number | null>(null);
   const mountedRef = useRef(true);
   const saveRef = useRef<(manual: boolean) => void>(() => {});

   function clearAutosave() {
      if (autosaveTimerRef.current !== null) {
         window.clearTimeout(autosaveTimerRef.current);
         autosaveTimerRef.current = null;
      }
   }

   function scheduleAutosave() {
      clearAutosave();
      autosaveTimerRef.current = window.setTimeout(() => {
         autosaveTimerRef.current = null;
         saveRef.current(false);
      }, AUTOSAVE_DELAY_MS);
   }

   function isDirtyNow(): boolean {
      const current = docRef.current;
      if (current === null) return false;
      return (
         current !== savedDocRef.current ||
         nameRef.current !== savedNameRef.current ||
         subjectRef.current !== savedSubjectRef.current
      );
   }

   async function persist(manual: boolean) {
      if (saveInFlightRef.current) {
         const inflight = inflightValuesRef.current;
         const current = docRef.current;
         if (
            current !== null &&
            inflight !== null &&
            (current !== inflight.doc ||
               nameRef.current !== inflight.name ||
               subjectRef.current !== inflight.subject)
         ) {
            pendingSaveRef.current = true;
         }
         return;
      }

      const current = docRef.current;
      if (current === null || !isDirtyNow()) return;

      const currentIssues = documentIssues(current);
      if (currentIssues.length > 0) {
         if (manual && mountedRef.current) {
            setSaveError('This document needs attention before it can be saved.');
            setSaveIssues(currentIssues);
         }
         return;
      }

      clearAutosave();
      const targetId = idRef.current;
      const snapshotName = nameRef.current;
      const snapshotSubject = subjectRef.current;

      saveInFlightRef.current = true;
      inflightValuesRef.current = { doc: current, name: snapshotName, subject: snapshotSubject };
      setSaving(true);
      setSaveError(null);
      setSaveIssues([]);

      try {
         const updated = await updateTemplate(targetId, {
            name: snapshotName,
            subject: snapshotSubject,
            irJson: current,
         });
         if (!mountedRef.current || idRef.current !== targetId) return;

         setTemplate(updated);
         setSavedDoc(current);
         savedDocRef.current = current;

         if (nameRef.current === snapshotName) {
            setName(updated.name);
            nameRef.current = updated.name;
         }
         setSavedName(updated.name);
         savedNameRef.current = updated.name;

         if (subjectRef.current === snapshotSubject) {
            setSubject(updated.subject);
            subjectRef.current = updated.subject;
         }
         setSavedSubject(updated.subject);
         savedSubjectRef.current = updated.subject;
      } catch (cause) {
         if (!mountedRef.current || idRef.current !== targetId) return;
         setSaveError(errorMessage(cause, 'Could not save the template'));
         setSaveIssues(
            cause instanceof ApiError && cause.status === 422
               ? issuesFromDetails(cause.details)
               : [],
         );
      } finally {
         saveInFlightRef.current = false;
         inflightValuesRef.current = null;
         if (mountedRef.current) setSaving(false);
         if (mountedRef.current && pendingSaveRef.current) {
            pendingSaveRef.current = false;
            void persist(false);
         }
      }
   }

   saveRef.current = (manual) => {
      void persist(manual);
   };

   const handleRender = useCallback((result: RenderResult) => {
      setRender(result);
   }, []);

   useEffect(() => {
      mountedRef.current = true;
      return () => {
         mountedRef.current = false;
         clearAutosave();
      };
   }, []);

   useEffect(() => {
      if (id.length === 0) {
         setLoading(false);
         setLoadError('The template id is missing from the address.');
         return;
      }

      let cancelled = false;
      clearAutosave();
      setLoading(true);
      setLoadError(null);
      setLoadIssues([]);
      setSaveError(null);
      setSaveIssues([]);
      setActionError(null);
      setRender(null);
      setTemplate(null);
      setDoc(null);
      setSavedDoc(null);
      setName('');
      setSubject('');
      setSavedName('');
      setSavedSubject('');
      docRef.current = null;
      savedDocRef.current = null;
      nameRef.current = '';
      subjectRef.current = '';
      savedNameRef.current = '';
      savedSubjectRef.current = '';

      getTemplate(id)
         .then((result) => {
            if (cancelled) return;

            setTemplate(result);
            setName(result.name);
            nameRef.current = result.name;
            setSubject(result.subject);
            subjectRef.current = result.subject;
            setSavedName(result.name);
            savedNameRef.current = result.name;
            setSavedSubject(result.subject);
            savedSubjectRef.current = result.subject;

            const parsed = parseTemplateDocument(result);
            if (parsed.doc !== null) {
               setDoc(parsed.doc);
               docRef.current = parsed.doc;
               setSavedDoc(parsed.doc);
               savedDocRef.current = parsed.doc;
            } else {
               setLoadIssues(parsed.issues);
            }
         })
         .catch((cause: unknown) => {
            if (!cancelled) setLoadError(errorMessage(cause, 'Could not load the template'));
         })
         .finally(() => {
            if (!cancelled) setLoading(false);
         });

      return () => {
         cancelled = true;
      };
   }, [id, reloadKey]);

   const liveIssues = useMemo(() => (doc === null ? [] : documentIssues(doc)), [doc]);
   const dirty =
      doc !== null && (doc !== savedDoc || name !== savedName || subject !== savedSubject);
   const documentUnavailable = doc === null && template !== null;
   const statusLabel = saving
      ? 'Saving…'
      : saveError !== null
        ? 'Save failed'
        : documentUnavailable
          ? 'Document error'
          : dirty
            ? 'Unsaved changes'
            : 'Saved';
   const statusError = saveError !== null || documentUnavailable;
   const fieldsDisabled = doc === null;
   const saveDisabled = !dirty || saving || doc === null || liveIssues.length > 0;
   const warnings = render?.warnings ?? [];
   const byteBudgetExceeded = render !== null && render.bytes > BYTE_BUDGET_BYTES;
   const sizeWarning = byteBudgetExceeded
      ? `The rendered email is ${formatBytes(render.bytes)}, above the 90 KB budget.`
      : null;

   useEffect(() => {
      if (!dirty) return;

      function warnBeforeUnload(event: BeforeUnloadEvent) {
         event.preventDefault();
         event.returnValue = '';
      }

      window.addEventListener('beforeunload', warnBeforeUnload);
      return () => window.removeEventListener('beforeunload', warnBeforeUnload);
   }, [dirty]);

   useEffect(() => {
      function handleKeyDown(event: KeyboardEvent) {
         if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
            event.preventDefault();
            saveRef.current(true);
            return;
         }

         if (event.key === 'Escape') {
            const active = document.activeElement;
            if (
               active instanceof HTMLElement &&
               (active.tagName === 'INPUT' ||
                  active.tagName === 'TEXTAREA' ||
                  active.tagName === 'SELECT' ||
                  active.isContentEditable)
            ) {
               active.blur();
            }
         }
      }

      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
   }, []);

   function handleDocChange(next: Document) {
      docRef.current = next;
      setDoc(next);
      scheduleAutosave();
   }

   function handleNameChange(value: string) {
      nameRef.current = value;
      setName(value);
      scheduleAutosave();
   }

   function handleSubjectChange(value: string) {
      subjectRef.current = value;
      setSubject(value);
      scheduleAutosave();
   }

   function handleManualSave() {
      clearAutosave();
      void persist(true);
   }

   async function handleDuplicate() {
      setActionError(null);
      setDuplicateBusy(true);
      try {
         const copy = await duplicateTemplate(idRef.current);
         route(`/templates/${copy.id}`);
      } catch (cause) {
         if (mountedRef.current) {
            setActionError(errorMessage(cause, 'Could not duplicate the template'));
         }
      } finally {
         if (mountedRef.current) setDuplicateBusy(false);
      }
   }

   async function confirmDelete() {
      setDeleteBusy(true);
      setDeleteError(null);
      try {
         await removeTemplate(idRef.current);
         clearAutosave();
         setDeleteOpen(false);
         route('/templates');
      } catch (cause) {
         if (mountedRef.current) {
            setDeleteError(errorMessage(cause, 'Could not delete the template'));
         }
      } finally {
         if (mountedRef.current) setDeleteBusy(false);
      }
   }

   if (loading) {
      return (
         <div className="grid gap-4">
            <div className="flex flex-wrap items-center gap-2">
               <Skeleton className="h-8 w-24" />
               <Skeleton className="h-8 w-56" />
               <Skeleton className="ml-auto h-8 w-44" />
            </div>
            <Skeleton className="h-[60vh] w-full rounded-xl" />
         </div>
      );
   }

   if (loadError !== null) {
      return (
         <div className="grid gap-4">
            <a
               href="/templates"
               className={`${buttonVariants({ variant: 'ghost', size: 'sm' })} w-fit -ml-2`}
            >
               <ArrowLeft aria-hidden="true" />
               Templates
            </a>
            <Alert variant="destructive">
               <AlertTitle>Could not load this template</AlertTitle>
               <AlertDescription>
                  <p>{loadError}</p>
                  <Button
                     variant="outline"
                     className="mt-3"
                     onClick={() => setReloadKey((key) => key + 1)}
                  >
                     Try again
                  </Button>
               </AlertDescription>
            </Alert>
         </div>
      );
   }

   if (template === null) return null;

   return (
      <div className={`flex min-h-[32rem] flex-col gap-3 ${WORKBENCH_HEIGHT}`}>
         <EditorHeader
            name={name}
            subject={subject}
            revision={template.revision}
            statusLabel={statusLabel}
            statusError={statusError}
            saving={saving}
            fieldsDisabled={fieldsDisabled}
            saveDisabled={saveDisabled}
            bytes={render?.bytes ?? null}
            byteBudgetExceeded={byteBudgetExceeded}
            warningCount={warnings.length}
            duplicateBusy={duplicateBusy}
            deleteBusy={deleteBusy}
            previewDisabled={render === null}
            onNameChange={handleNameChange}
            onSubjectChange={handleSubjectChange}
            onSave={handleManualSave}
            onDuplicate={() => void handleDuplicate()}
            onPreview={() => setPreviewOpen(true)}
            onDelete={() => {
               setDeleteError(null);
               setDeleteOpen(true);
            }}
         />

         {actionError !== null && (
            <Alert
               variant="destructive"
               className="shrink-0"
            >
               <AlertTitle>Action failed</AlertTitle>
               <AlertDescription>{actionError}</AlertDescription>
            </Alert>
         )}

         {saveError !== null && (
            <Alert
               variant="destructive"
               className="shrink-0"
            >
               <AlertTitle>Could not save the template</AlertTitle>
               <AlertDescription>
                  <p>{saveError}</p>
                  {saveIssues.length > 0 && (
                     <ul className="mt-2 list-disc pl-4">
                        {saveIssues.map((issue, index) => (
                           <li key={`${index}-${issue}`}>{issue}</li>
                        ))}
                     </ul>
                  )}
               </AlertDescription>
            </Alert>
         )}

         {doc === null ? (
            <div className="grid min-h-0 flex-1 content-start gap-4 overflow-y-auto">
               <Alert variant="destructive">
                  <AlertTitle>This template document could not be opened</AlertTitle>
                  <AlertDescription>
                     <p>
                        The stored email document failed validation, so the editor is unavailable.
                     </p>
                     <ul className="mt-2 list-disc pl-4">
                        {loadIssues.map((issue, index) => (
                           <li key={`${index}-${issue}`}>{issue}</li>
                        ))}
                     </ul>
                  </AlertDescription>
               </Alert>
               <EmptyState
                  icon={<FileText aria-hidden="true" />}
                  title="Repair the stored document to continue"
                  description="The name and subject are read-only until the document validates. You can still duplicate or delete the template."
               />
            </div>
         ) : (
            <>
               {liveIssues.length > 0 && (
                  <Alert
                     variant="destructive"
                     className="max-h-32 shrink-0 overflow-y-auto"
                  >
                     <AlertTitle>This document needs attention before it can be saved</AlertTitle>
                     <AlertDescription>
                        <ul className="list-disc pl-4">
                           {liveIssues.map((issue, index) => (
                              <li key={`${index}-${issue}`}>{issue}</li>
                           ))}
                        </ul>
                     </AlertDescription>
                  </Alert>
               )}

               {(sizeWarning !== null || warnings.length > 0) && (
                  <Alert
                     variant="warning"
                     className="max-h-32 shrink-0 overflow-y-auto"
                  >
                     <AlertTitle>Render notices</AlertTitle>
                     <AlertDescription>
                        <ul className="list-disc pl-4">
                           {sizeWarning !== null && <li>{sizeWarning}</li>}
                           {warnings.map((warning, index) => (
                              <li key={`${warning.code}-${warning.blockId ?? 'document'}-${index}`}>
                                 {warning.message}
                                 {warning.blockId !== undefined ? ` (${warning.blockId})` : ''}
                              </li>
                           ))}
                        </ul>
                     </AlertDescription>
                  </Alert>
               )}

               <div className="min-h-0 flex-1">
                  <EmailEditor
                     value={doc}
                     onChange={handleDocChange}
                     onRender={handleRender}
                     className="h-full min-h-0"
                  />
               </div>
            </>
         )}

         <EmailPreviewDialog
            open={previewOpen}
            onOpenChange={setPreviewOpen}
            name={name}
            html={render?.html ?? ''}
            text={render?.text ?? ''}
         />

         <ConfirmDialog
            open={deleteOpen}
            onOpenChange={(open) => {
               if (!open && !deleteBusy) {
                  setDeleteOpen(false);
                  setDeleteError(null);
               }
            }}
            title="Delete template"
            description={
               dirty
                  ? `Delete "${name}"? Unsaved changes will be lost.`
                  : `Delete "${name}"? Campaigns that already pinned a revision are not affected.`
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
