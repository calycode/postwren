import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useRoute } from 'preact-iso';
import { ArrowLeft, FileText, RotateCcw } from 'lucide-react';
import { documentIssues, parseDocument } from '@postwren/email/ir';
import type { Document } from '@postwren/email/ir';
import { renderEmail } from '@postwren/email/render';
import { EmailEditor } from '@postwren/editor';
import type { BlockComment } from '@postwren/editor';
import {
   Alert,
   AlertDescription,
   AlertTitle,
   Badge,
   Button,
   Dialog,
   DialogContent,
   DialogDescription,
   DialogFooter,
   DialogHeader,
   DialogTitle,
   EmptyState,
   Field,
   Input,
   Skeleton,
   buttonVariants,
   cn,
} from '@postwren/ui';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { EditorHeader } from '@/components/editor/editor-header';
import { EmailPreviewDialog } from '@/components/editor/preview-dialog';
import { MediaPickerDialog } from '@/components/media/media-picker';
import { issuesFromDetails } from '@/components/editor/server-issues';
import { parseTemplateDocument } from '@/components/editor/template-document';
import { upload } from '@/lib/api/media';
import {
   create as createSavedBlock,
   list as listSavedBlocks,
   remove as removeSavedBlock,
} from '@/lib/api/saved-blocks';
import {
   create as createComment,
   list as listComments,
   remove as removeComment,
   update as updateComment,
} from '@/lib/api/template-comments';
import {
   create as createTemplate,
   duplicate as duplicateTemplate,
   get as getTemplate,
   getVersion,
   listVersions,
   remove as removeTemplate,
   restoreVersion,
   update as updateTemplate,
} from '@/lib/api/templates';
import { ApiError } from '@/lib/api/client';
import type {
   Template,
   TemplateComment,
   TemplateVersion,
   TemplateVersionSummary,
} from '@/lib/api/types';
import type { SavedBlock } from '@/lib/api/types';
import { errorMessage } from '@/lib/form-errors';
import { formatDateTime, relativeTime } from '@/lib/format';

type RenderResult = {
   html: string;
   text: string;
};

type DocumentDiff = {
   added: number;
   removed: number;
   changed: number;
   settingsChanged: boolean;
   addedIds: string[];
   removedIds: string[];
   changedIds: string[];
};

function stableValue(value: unknown): unknown {
   if (Array.isArray(value)) return value.map(stableValue);
   if (value !== null && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      return Object.keys(record)
         .sort()
         .reduce<Record<string, unknown>>((result, key) => {
            result[key] = stableValue(record[key]);
            return result;
         }, {});
   }
   return value;
}

function signature(value: unknown): string {
   return JSON.stringify(stableValue(value));
}

function diffDocuments(selected: Document, current: Document): DocumentDiff {
   const selectedById = new Map(selected.children.map((block) => [block.id, block]));
   const currentById = new Map(current.children.map((block) => [block.id, block]));
   const addedIds: string[] = [];
   const removedIds: string[] = [];
   const changedIds: string[] = [];

   for (const block of current.children) {
      const before = selectedById.get(block.id);
      if (before === undefined) {
         addedIds.push(block.id);
      } else if (signature(before) !== signature(block)) {
         changedIds.push(block.id);
      }
   }

   for (const block of selected.children) {
      if (!currentById.has(block.id)) removedIds.push(block.id);
   }

   return {
      added: addedIds.length,
      removed: removedIds.length,
      changed: changedIds.length,
      settingsChanged:
         signature(selected.settings) !== signature(current.settings) ||
         selected.preheader !== current.preheader,
      addedIds,
      removedIds,
      changedIds,
   };
}

const HIGHLIGHT_COLOURS = {
   added: '#15803d',
   removed: '#b91c1c',
   changed: '#b45309',
} as const;

function escapeSelector(value: string): string {
   return value.replace(/["\\]/g, '\\$&');
}

/** Injects git-style block highlights into an annotated email preview. */
function highlightPreview(
   html: string,
   sections: { ids: string[]; kind: keyof typeof HIGHLIGHT_COLOURS }[],
): string {
   const rules = sections.flatMap(({ ids, kind }) => {
      const colour = HIGHLIGHT_COLOURS[kind];
      // Only background/outline: pseudo-elements on table rows break the
      // email's table layout, which is exactly what the preview is showing.
      return ids.map(
         (id) =>
            `[data-block-id="${escapeSelector(id)}"]{outline:3px solid ${colour}!important;outline-offset:-3px;background:color-mix(in srgb, ${colour} 9%, transparent)!important;box-shadow:inset 4px 0 0 0 ${colour}!important;}`,
      );
   });

   if (rules.length === 0) return html;
   const style = `<style>${rules.join('')}</style>`;
   return html.includes('</head>') ? html.replace('</head>', `${style}</head>`) : `${style}${html}`;
}

function renderAnnotatedPreview(document: Document): string {
   try {
      return renderEmail(document, { annotateBlocks: true }).html;
   } catch {
      return '';
   }
}

function VersionPreview({ label, html }: { label: string; html: string }) {
   const frameRef = useRef<HTMLDivElement>(null);
   const [scale, setScale] = useState(1);

   useEffect(() => {
      const element = frameRef.current;
      if (element === null) return;

      const update = () => {
         const width = element.clientWidth - 2;
         if (width > 0) setScale(Math.min(1, width / 600));
      };

      update();
      if (typeof ResizeObserver === 'undefined') return;
      const observer = new ResizeObserver(update);
      observer.observe(element);
      return () => observer.disconnect();
   }, []);

   return (
      <div className="grid min-w-0 gap-1.5">
         <span className="text-xs font-medium text-muted-foreground">{label}</span>
         <div
            ref={frameRef}
            className="h-[38dvh] min-h-56 w-full min-w-0 overflow-hidden rounded-lg border border-border bg-white"
         >
            <iframe
               title={label}
               srcDoc={html}
               sandbox=""
               style={{
                  width: 600,
                  height: `calc(38dvh / ${scale})`,
                  transform: `scale(${scale})`,
                  transformOrigin: 'top left',
                  border: 0,
               }}
            />
         </div>
      </div>
   );
}

type PersistOptions = {
   bumpRevision: boolean;
   surfaceIssues?: boolean;
   keepalive?: boolean;
};

function sortComments(items: TemplateComment[]): TemplateComment[] {
   return [...items].sort((a, b) => {
      if (a.status !== b.status) return a.status === 'open' ? -1 : 1;
      return a.created_at - b.created_at;
   });
}

const AUTOSAVE_DELAY_MS = 2000;
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
   const [savedBlocks, setSavedBlocks] = useState<SavedBlock[]>([]);
   const [comments, setComments] = useState<TemplateComment[]>([]);
   const [commentsError, setCommentsError] = useState<string | null>(null);
   const [saveAsOpen, setSaveAsOpen] = useState(false);
   const [saveAsName, setSaveAsName] = useState('');
   const [saveAsSubject, setSaveAsSubject] = useState('');
   const [saveAsBusy, setSaveAsBusy] = useState(false);
   const [saveAsError, setSaveAsError] = useState<string | null>(null);
   const [historyOpen, setHistoryOpen] = useState(false);
   const [versions, setVersions] = useState<TemplateVersionSummary[]>([]);
   const [versionsLoading, setVersionsLoading] = useState(false);
   const [versionsError, setVersionsError] = useState<string | null>(null);
   const [selectedRevision, setSelectedRevision] = useState<number | null>(null);
   const [selectedVersion, setSelectedVersion] = useState<TemplateVersion | null>(null);
   const [versionLoading, setVersionLoading] = useState(false);
   const [versionError, setVersionError] = useState<string | null>(null);
   const [restoreOpen, setRestoreOpen] = useState(false);
   const [restoreBusy, setRestoreBusy] = useState(false);
   const [restoreError, setRestoreError] = useState<string | null>(null);

   const idRef = useRef(id);
   idRef.current = id;
   const templateRef = useRef<Template | null>(null);
   templateRef.current = template;
   const docRef = useRef<Document | null>(null);
   const savedDocRef = useRef<Document | null>(null);
   const nameRef = useRef('');
   const subjectRef = useRef('');
   const savedNameRef = useRef('');
   const savedSubjectRef = useRef('');
   const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
   const queuedSavesRef = useRef(0);
   const autosaveTimerRef = useRef<number | null>(null);
   const mountedRef = useRef(true);
   const skipUnmountSaveRef = useRef(false);
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

   async function performSave(options: PersistOptions): Promise<boolean> {
      const current = docRef.current;
      if (current === null || !isDirtyNow()) return true;

      const currentIssues = documentIssues(current);
      if (currentIssues.length > 0) {
         if (options.surfaceIssues && mountedRef.current) {
            setSaveError('This document needs attention before it can be saved.');
            setSaveIssues(currentIssues);
         }
         return false;
      }

      clearAutosave();
      const targetId = idRef.current;
      const snapshotName = nameRef.current;
      const snapshotSubject = subjectRef.current;

      if (mountedRef.current) {
         setSaving(true);
         setSaveError(null);
         setSaveIssues([]);
      }

      try {
         const updated = await updateTemplate(
            targetId,
            { name: snapshotName, subject: snapshotSubject, irJson: current },
            { bumpRevision: options.bumpRevision, keepalive: options.keepalive },
         );

         if (idRef.current !== targetId) return false;

         savedDocRef.current = current;
         if (nameRef.current === snapshotName) {
            nameRef.current = updated.name;
            if (mountedRef.current) setName(updated.name);
         }
         savedNameRef.current = updated.name;
         if (subjectRef.current === snapshotSubject) {
            subjectRef.current = updated.subject;
            if (mountedRef.current) setSubject(updated.subject);
         }
         savedSubjectRef.current = updated.subject;

         if (mountedRef.current) {
            setTemplate(updated);
            setSavedDoc(current);
            setSavedName(updated.name);
            setSavedSubject(updated.subject);
         }

         return true;
      } catch (cause) {
         if (mountedRef.current && idRef.current === targetId) {
            setSaveError(errorMessage(cause, 'Could not save the template'));
            setSaveIssues(
               cause instanceof ApiError && cause.status === 422
                  ? issuesFromDetails(cause.details)
                  : [],
            );
         }
         return false;
      }
   }

   function persist(options: PersistOptions): Promise<boolean> {
      if (!isDirtyNow()) return Promise.resolve(true);

      queuedSavesRef.current += 1;
      const run = saveQueueRef.current.then(async () => {
         try {
            return await performSave(options);
         } finally {
            queuedSavesRef.current = Math.max(0, queuedSavesRef.current - 1);
            if (queuedSavesRef.current === 0 && mountedRef.current) setSaving(false);
         }
      });

      saveQueueRef.current = run.then(
         () => undefined,
         () => undefined,
      );

      return run;
   }

   async function flush(options: PersistOptions): Promise<boolean> {
      clearAutosave();
      for (let attempt = 0; attempt < 3; attempt += 1) {
         await saveQueueRef.current;
         if (!isDirtyNow()) return true;
         if (!(await persist(options))) return false;
      }
      return !isDirtyNow();
   }

   saveRef.current = (manual) => {
      void persist({ bumpRevision: manual, surfaceIssues: manual });
   };

   const handleRender = useCallback((result: RenderResult) => {
      setRender(result);
   }, []);

   const handleUploadImage = useCallback(async (file: File) => {
      const asset = await upload(file);
      return { url: asset.url, alt: file.name.replace(/\.[^.]+$/, '') };
   }, []);

   const [mediaOpen, setMediaOpen] = useState(false);
   const mediaResolveRef = useRef<((value: { url: string; alt?: string } | null) => void) | null>(
      null,
   );

   const handlePickImage = useCallback(
      () =>
         new Promise<{ url: string; alt?: string } | null>((resolve) => {
            mediaResolveRef.current = resolve;
            setMediaOpen(true);
         }),
      [],
   );

   const handleSaveBlock = useCallback(async (block: unknown, name: string) => {
      const saved = await createSavedBlock({ name, block });
      setSavedBlocks((current) => [saved, ...current]);
   }, []);

   const handleDeleteSavedBlock = useCallback((id: string) => {
      setSavedBlocks((current) => current.filter((block) => block.id !== id));
      void removeSavedBlock(id).catch(() => {
         // Re-listing on the next open restores a block when the delete failed.
      });
   }, []);

   useEffect(() => {
      let cancelled = false;
      listSavedBlocks()
         .then((result) => {
            if (!cancelled) setSavedBlocks(result);
         })
         .catch(() => {
            // The editor stays usable when saved blocks cannot be listed.
         });

      return () => {
         cancelled = true;
      };
   }, []);

   useEffect(() => {
      mountedRef.current = true;

      function flushBeforeUnload() {
         if (!isDirtyNow()) return;
         void flush({ bumpRevision: false, keepalive: true });
      }

      window.addEventListener('pagehide', flushBeforeUnload);
      return () => {
         window.removeEventListener('pagehide', flushBeforeUnload);
         mountedRef.current = false;
         clearAutosave();
         if (!skipUnmountSaveRef.current && isDirtyNow()) {
            void flush({ bumpRevision: false, keepalive: true });
         }
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

   useEffect(() => {
      if (id.length === 0) return;

      let cancelled = false;
      setComments([]);
      setCommentsError(null);

      listComments(id)
         .then((result) => {
            if (!cancelled) setComments(result);
         })
         .catch((cause: unknown) => {
            if (!cancelled) {
               setCommentsError(errorMessage(cause, 'Could not load notes for this template'));
            }
         });

      return () => {
         cancelled = true;
      };
   }, [id, reloadKey]);

   useEffect(() => {
      if (!historyOpen) return;

      let cancelled = false;
      setVersionsLoading(true);
      setVersionsError(null);

      listVersions(idRef.current)
         .then((result) => {
            if (cancelled) return;
            setVersions(result);
            setSelectedRevision((current) => {
               if (current !== null && result.some((version) => version.revision === current)) {
                  return current;
               }

               const currentRevision = templateRef.current?.revision;
               const candidate =
                  result.find((version) => version.revision !== currentRevision) ?? result[0];
               return candidate?.revision ?? null;
            });
         })
         .catch((cause: unknown) => {
            if (!cancelled) {
               setVersionsError(errorMessage(cause, 'Could not load the version history'));
            }
         })
         .finally(() => {
            if (!cancelled) setVersionsLoading(false);
         });

      return () => {
         cancelled = true;
      };
   }, [historyOpen]);

   useEffect(() => {
      if (!historyOpen || selectedRevision === null) {
         setSelectedVersion(null);
         return;
      }

      let cancelled = false;
      setVersionLoading(true);
      setVersionError(null);

      getVersion(idRef.current, selectedRevision)
         .then((result) => {
            if (!cancelled) setSelectedVersion(result);
         })
         .catch((cause: unknown) => {
            if (!cancelled) {
               setVersionError(errorMessage(cause, 'Could not load this version'));
            }
         })
         .finally(() => {
            if (!cancelled) setVersionLoading(false);
         });

      return () => {
         cancelled = true;
      };
   }, [historyOpen, selectedRevision]);

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

   const selectedDocument = useMemo(() => {
      if (selectedVersion === null) return null;
      try {
         return parseDocument(selectedVersion.ir);
      } catch {
         return null;
      }
   }, [selectedVersion]);

   const versionDiff = useMemo(() => {
      if (selectedDocument === null || savedDoc === null) return null;
      return diffDocuments(selectedDocument, savedDoc);
   }, [selectedDocument, savedDoc]);

   const currentPreviewHtml = useMemo(() => {
      const fallback = template?.preview_html ?? render?.html ?? '';
      if (savedDoc === null) return fallback;
      const annotated = renderAnnotatedPreview(savedDoc);
      return annotated.length > 0 ? annotated : fallback;
   }, [savedDoc, template?.preview_html, render?.html]);

   const selectedPreviewHtml = useMemo(() => {
      const fallback = selectedVersion?.previewHtml ?? '';
      if (selectedDocument === null) return fallback;
      const annotated = renderAnnotatedPreview(selectedDocument);
      return annotated.length > 0 ? annotated : fallback;
   }, [selectedDocument, selectedVersion?.previewHtml]);

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
      void persist({ bumpRevision: true, surfaceIssues: true });
   }

   async function handleAddComment(blockId: string, body: string) {
      const target = idRef.current;
      const created = await createComment(target, { blockId, body });
      if (mountedRef.current && idRef.current === target) {
         setComments((current) => sortComments([...current, created]));
      }
   }

   async function handleToggleComment(commentId: string, status: 'open' | 'done') {
      const target = idRef.current;
      const updated = await updateComment(target, commentId, { status });
      if (mountedRef.current && idRef.current === target) {
         setComments((current) =>
            sortComments(current.map((comment) => (comment.id === commentId ? updated : comment))),
         );
      }
   }

   async function handleDeleteComment(commentId: string) {
      const target = idRef.current;
      await removeComment(target, commentId);
      if (mountedRef.current && idRef.current === target) {
         setComments((current) => current.filter((comment) => comment.id !== commentId));
      }
   }

   const editorComments = useMemo<BlockComment[]>(
      () =>
         comments.map((comment) => ({
            id: comment.id,
            blockId: comment.block_id,
            body: comment.body,
            status: comment.status,
            createdAt: comment.created_at,
            updatedAt: comment.updated_at,
         })),
      [comments],
   );

   async function handleDuplicate() {
      setActionError(null);
      setDuplicateBusy(true);
      try {
         const flushed = await flush({ bumpRevision: false, surfaceIssues: true });
         if (!flushed) return;

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
         skipUnmountSaveRef.current = true;
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

   function openSaveAs() {
      setSaveAsName(name.length > 0 ? `${name} copy` : 'Untitled template');
      setSaveAsSubject(subject);
      setSaveAsError(null);
      setSaveAsOpen(true);
   }

   async function confirmSaveAs(event: Event) {
      event.preventDefault();
      const current = docRef.current;
      if (current === null) return;

      const trimmedName = saveAsName.trim();
      if (trimmedName.length === 0) {
         setSaveAsError('Give the template a name.');
         return;
      }

      setSaveAsBusy(true);
      setSaveAsError(null);
      try {
         const flushed = await flush({ bumpRevision: false, surfaceIssues: true });
         if (!flushed) return;

         const created = await createTemplate({
            name: trimmedName,
            subject: saveAsSubject.trim().length > 0 ? saveAsSubject.trim() : 'Untitled template',
            irJson: current,
         });
         skipUnmountSaveRef.current = true;
         route(`/templates/${created.id}`);
      } catch (cause) {
         setSaveAsError(errorMessage(cause, 'Could not save the template'));
      } finally {
         if (mountedRef.current) setSaveAsBusy(false);
      }
   }

   function openHistory() {
      setVersionsError(null);
      setVersionError(null);
      setSelectedRevision(null);
      setSelectedVersion(null);
      setRestoreError(null);
      setHistoryOpen(true);
   }

   async function confirmRestore() {
      if (selectedVersion === null) return;

      setRestoreBusy(true);
      setRestoreError(null);
      try {
         if (isDirtyNow()) {
            const flushed = await flush({ bumpRevision: true, surfaceIssues: true });
            if (!flushed) {
               if (mountedRef.current) {
                  setRestoreError('Save the current changes before restoring this version.');
               }
               return;
            }
         }

         const updated = await restoreVersion(idRef.current, selectedVersion.revision);
         if (!mountedRef.current) return;

         setRestoreOpen(false);
         setHistoryOpen(false);
         setSelectedRevision(null);
         setSelectedVersion(null);
         setActionError(null);
         setTemplate(updated);
         setReloadKey((key) => key + 1);
      } catch (cause) {
         if (mountedRef.current) {
            setRestoreError(errorMessage(cause, 'Could not restore this version'));
         }
      } finally {
         if (mountedRef.current) setRestoreBusy(false);
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
            duplicateBusy={duplicateBusy}
            deleteBusy={deleteBusy}
            previewDisabled={render === null}
            onNameChange={handleNameChange}
            onSubjectChange={handleSubjectChange}
            onSave={handleManualSave}
            onDuplicate={() => void handleDuplicate()}
            onSaveAsTemplate={openSaveAs}
            onPreview={() => setPreviewOpen(true)}
            onHistory={openHistory}
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

         {commentsError !== null && (
            <Alert
               variant="destructive"
               className="shrink-0"
            >
               <AlertTitle>Could not load notes</AlertTitle>
               <AlertDescription>{commentsError}</AlertDescription>
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
                  {saveIssues.length > 0 && liveIssues.length === 0 && (
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
            <div
               className="min-h-0 flex-1"
               data-guide="editor"
            >
               <EmailEditor
                  value={doc}
                  onChange={handleDocChange}
                  onRender={handleRender}
                  issues={liveIssues}
                  onUploadImage={handleUploadImage}
                  onPickImage={handlePickImage}
                  savedBlocks={savedBlocks}
                  onSaveBlock={handleSaveBlock}
                  onDeleteSavedBlock={handleDeleteSavedBlock}
                  comments={editorComments}
                  onAddComment={handleAddComment}
                  onToggleComment={handleToggleComment}
                  onDeleteComment={handleDeleteComment}
                  className="h-full min-h-0"
               />
            </div>
         )}

         <EmailPreviewDialog
            open={previewOpen}
            onOpenChange={setPreviewOpen}
            name={name}
            html={render?.html ?? ''}
            text={render?.text ?? ''}
         />

         <MediaPickerDialog
            open={mediaOpen}
            onOpenChange={(next) => {
               setMediaOpen(next);
               if (!next) {
                  mediaResolveRef.current?.(null);
                  mediaResolveRef.current = null;
               }
            }}
            onSelect={(asset) => {
               mediaResolveRef.current?.({
                  url: asset.url,
                  alt: asset.name.replace(/\.[^.]+$/, ''),
               });
               mediaResolveRef.current = null;
               setMediaOpen(false);
            }}
         />

         <Dialog
            open={historyOpen}
            onOpenChange={(open) => {
               if (!open && !restoreBusy) {
                  setHistoryOpen(false);
                  setSelectedRevision(null);
                  setSelectedVersion(null);
                  setRestoreError(null);
               }
            }}
         >
            <DialogContent className="flex h-[min(88dvh,46rem)] flex-col overflow-hidden sm:max-w-6xl">
               <DialogHeader>
                  <DialogTitle>Version history</DialogTitle>
                  <DialogDescription>
                     Compare a saved revision with the current one. Restoring a version always
                     creates a new revision.
                  </DialogDescription>
               </DialogHeader>

               {versionsError !== null && (
                  <Alert variant="destructive">
                     <AlertTitle>Could not load version history</AlertTitle>
                     <AlertDescription>{versionsError}</AlertDescription>
                  </Alert>
               )}

               <div className="grid min-h-0 flex-1 gap-4 overflow-hidden lg:grid-cols-[16rem_minmax(0,1fr)]">
                  <div className="min-h-0 overflow-y-auto pr-1">
                     {versionsLoading ? (
                        <div className="grid gap-2">
                           <Skeleton className="h-16 w-full" />
                           <Skeleton className="h-16 w-full" />
                           <Skeleton className="h-16 w-full" />
                        </div>
                     ) : versions.length === 0 ? (
                        <EmptyState
                           icon={<FileText aria-hidden="true" />}
                           title="No versions yet"
                           description="Versions appear here after the first save."
                           className="px-3 py-8"
                        />
                     ) : (
                        <ol className="grid gap-1">
                           {versions.map((version) => {
                              const isCurrent = version.revision === template.revision;
                              const isSelected = version.revision === selectedRevision;

                              return (
                                 <li key={version.revision}>
                                    <button
                                       type="button"
                                       aria-pressed={isSelected}
                                       onClick={() => setSelectedRevision(version.revision)}
                                       className={cn(
                                          'w-full rounded-lg border px-3 py-2 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
                                          isSelected
                                             ? 'border-ochre/60 bg-accent text-accent-foreground'
                                             : 'border-transparent hover:border-border hover:bg-accent/40',
                                       )}
                                    >
                                       <span className="flex items-center gap-1.5">
                                          <span className="font-heading text-sm font-semibold">
                                             v{version.revision}
                                          </span>
                                          {isCurrent && (
                                             <Badge
                                                variant="secondary"
                                                className="px-1.5 py-0 text-[10px]"
                                             >
                                                Current
                                             </Badge>
                                          )}
                                          <span
                                             className="ml-auto text-[11px] text-muted-foreground"
                                             title={formatDateTime(version.createdAt)}
                                          >
                                             {relativeTime(version.createdAt)}
                                          </span>
                                       </span>
                                       <span className="mt-0.5 block truncate text-sm font-medium">
                                          {version.name}
                                       </span>
                                       <span className="block truncate text-xs text-muted-foreground">
                                          {version.subject.trim().length > 0
                                             ? version.subject
                                             : 'No subject'}
                                       </span>
                                    </button>
                                 </li>
                              );
                           })}
                        </ol>
                     )}
                  </div>

                  <div className="relative grid min-h-0 content-start gap-3 overflow-y-auto pr-1">
                     {selectedRevision === null ? (
                        <EmptyState
                           icon={<FileText aria-hidden="true" />}
                           title="Pick a version"
                           description="Select a revision on the left to compare it with the current one."
                           className="py-10"
                        />
                     ) : selectedVersion === null ? (
                        versionError !== null ? (
                           <Alert variant="destructive">
                              <AlertTitle>Could not load this version</AlertTitle>
                              <AlertDescription>{versionError}</AlertDescription>
                           </Alert>
                        ) : (
                           <div className="grid gap-3">
                              <Skeleton className="h-5 w-64" />
                              <div className="grid gap-3 sm:grid-cols-2">
                                 <Skeleton className="h-64 w-full rounded-lg" />
                                 <Skeleton className="h-64 w-full rounded-lg" />
                              </div>
                           </div>
                        )
                     ) : (
                        <>
                           {versionError !== null && (
                              <Alert variant="destructive">
                                 <AlertDescription>{versionError}</AlertDescription>
                              </Alert>
                           )}

                           <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm text-muted-foreground">
                                 Comparing{' '}
                                 <span className="font-medium text-foreground">
                                    v{selectedRevision}
                                 </span>{' '}
                                 with{' '}
                                 <span className="font-medium text-foreground">
                                    v{template.revision}
                                 </span>
                              </p>
                              {versionDiff !== null &&
                                 (versionDiff.added === 0 &&
                                 versionDiff.removed === 0 &&
                                 versionDiff.changed === 0 &&
                                 !versionDiff.settingsChanged ? (
                                    <Badge variant="secondary">No block changes</Badge>
                                 ) : (
                                    <span className="flex flex-wrap items-center gap-1.5">
                                       <Badge variant="success">+{versionDiff.added} added</Badge>
                                       <Badge variant="destructive">
                                          −{versionDiff.removed} removed
                                       </Badge>
                                       <Badge variant="warning">
                                          {versionDiff.changed} changed
                                       </Badge>
                                       {versionDiff.settingsChanged && (
                                          <Badge variant="warning">Settings changed</Badge>
                                       )}
                                    </span>
                                 ))}
                           </div>

                           <div className="grid gap-3 sm:grid-cols-2">
                              <VersionPreview
                                 label={`v${selectedRevision} (selected)`}
                                 html={highlightPreview(selectedPreviewHtml, [
                                    {
                                       ids: versionDiff?.removedIds ?? [],
                                       kind: 'removed',
                                    },
                                    {
                                       ids: versionDiff?.changedIds ?? [],
                                       kind: 'changed',
                                    },
                                 ])}
                              />
                              <VersionPreview
                                 label={`v${template.revision} (current)`}
                                 html={highlightPreview(currentPreviewHtml, [
                                    {
                                       ids: versionDiff?.addedIds ?? [],
                                       kind: 'added',
                                    },
                                    {
                                       ids: versionDiff?.changedIds ?? [],
                                       kind: 'changed',
                                    },
                                 ])}
                              />
                           </div>

                           <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                              <span className="inline-flex items-center gap-1.5">
                                 <span className="size-2 rounded-full bg-[#15803d]" />
                                 Added
                              </span>
                              <span className="inline-flex items-center gap-1.5">
                                 <span className="size-2 rounded-full bg-[#b91c1c]" />
                                 Removed
                              </span>
                              <span className="inline-flex items-center gap-1.5">
                                 <span className="size-2 rounded-full bg-[#b45309]" />
                                 Changed
                              </span>
                           </div>

                           <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
                              <p className="max-w-md text-xs text-muted-foreground">
                                 Restoring copies this version into a new revision. Campaigns
                                 already pinned to old revisions keep their content.
                              </p>
                              <Button
                                 size="sm"
                                 variant="outline"
                                 disabled={restoreBusy}
                                 onClick={() => {
                                    setRestoreError(null);
                                    setRestoreOpen(true);
                                 }}
                              >
                                 <RotateCcw aria-hidden="true" />
                                 Restore this version
                              </Button>
                           </div>
                        </>
                     )}

                     {versionLoading && selectedVersion !== null && (
                        <div className="pointer-events-none absolute inset-0 z-10 flex items-start justify-center rounded-lg bg-background/50 pt-16 backdrop-blur-[1px]">
                           <Badge variant="secondary">Loading version…</Badge>
                        </div>
                     )}
                  </div>
               </div>
            </DialogContent>
         </Dialog>

         <ConfirmDialog
            open={restoreOpen}
            onOpenChange={(open) => {
               if (!open && !restoreBusy) {
                  setRestoreOpen(false);
                  setRestoreError(null);
               }
            }}
            title="Restore this version"
            description={
               selectedVersion === null
                  ? 'Restore this version as a new revision?'
                  : `Restore v${selectedVersion.revision} as v${template.revision + 1}? The current draft is replaced by this version. Campaigns already pinned to older revisions are unaffected.${
                       dirty ? ' Unsaved editor changes are saved as their own revision first.' : ''
                    }`
            }
            confirmLabel="Restore version"
            loading={restoreBusy}
            error={restoreError}
            onConfirm={confirmRestore}
         />

         <Dialog
            open={saveAsOpen}
            onOpenChange={(open) => {
               if (!open && !saveAsBusy) {
                  setSaveAsOpen(false);
                  setSaveAsError(null);
               }
            }}
         >
            <DialogContent>
               <DialogHeader>
                  <DialogTitle>Save as template</DialogTitle>
                  <DialogDescription>
                     Create a new template from this document. The current template stays as it is.
                  </DialogDescription>
               </DialogHeader>

               <form
                  className="grid gap-4"
                  onSubmit={(event) => void confirmSaveAs(event)}
               >
                  <Field
                     label="Template name"
                     htmlFor="save-as-name"
                     error={saveAsError ?? undefined}
                     required
                  >
                     <Input
                        id="save-as-name"
                        value={saveAsName}
                        maxLength={200}
                        autoFocus
                        onInput={(event) => {
                           setSaveAsName(event.currentTarget.value);
                           setSaveAsError(null);
                        }}
                     />
                  </Field>

                  <Field
                     label="Subject"
                     htmlFor="save-as-subject"
                     hint="You can change this later."
                  >
                     <Input
                        id="save-as-subject"
                        value={saveAsSubject}
                        maxLength={998}
                        onInput={(event) => setSaveAsSubject(event.currentTarget.value)}
                     />
                  </Field>

                  <DialogFooter>
                     <Button
                        variant="outline"
                        type="button"
                        disabled={saveAsBusy}
                        onClick={() => setSaveAsOpen(false)}
                     >
                        Cancel
                     </Button>
                     <Button
                        type="submit"
                        disabled={saveAsBusy}
                     >
                        {saveAsBusy ? 'Saving…' : 'Save template'}
                     </Button>
                  </DialogFooter>
               </form>
            </DialogContent>
         </Dialog>

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
