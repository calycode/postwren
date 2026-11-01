import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { BlockType, Document } from '@postwren/email/ir';
import { createBlock } from '@postwren/email/ir';
import { renderEmail } from '@postwren/email/render';
import type { RenderWarning } from '@postwren/email/render';
import { applyMergeTags } from '@postwren/email/template';
import type { MergeContext } from '@postwren/email/template';
import { cn, useToast } from '@postwren/ui';
import { BlockLibrary } from './components/add-block-menu';
import { BlockTree } from './components/block-outline';
import { DocumentDialog } from './components/document-dialog';
import { EditorToolbar } from './components/editor-toolbar';
import { EmailCanvas } from './components/email-canvas';
import { PropertyPanel } from './components/property-panel';
import {
   blockLabel,
   duplicateBlock,
   findBlock,
   insertAfter,
   insertBlock,
   moveBlock,
   moveBlockTo,
   removeBlock,
} from './lib/document-ops';
import type { DropPosition } from './lib/document-ops';
import { canRedo, canUndo, commit, createHistory, redo, undo } from './lib/history';
import type { History } from './lib/history';
import type { ImageUploader } from './lib/media';
import type { BlockPattern } from './lib/patterns';
import { usePanelResize } from './lib/use-panel-resize';
import type { Viewport } from './lib/viewport';

export type EmailEditorProps = {
   value: Document;
   onChange: (next: Document) => void;
   /** Called after every render of the preview with the full render result. */
   onRender?: (result: {
      html: string;
      text: string;
      bytes: number;
      warnings: RenderWarning[];
   }) => void;
   /** Structural problems that pause autosave in the host. */
   issues?: readonly string[];
   /** Host-provided image upload, forwarded to the property panel. */
   onUploadImage?: ImageUploader;
   className?: string;
};

const PREVIEW_UNSUBSCRIBE_URL = 'https://example.com/u/preview';

function topLevelAnchor(doc: Document, id: string): string | null {
   for (const child of doc.children) {
      if (child.id === id) return id;
      if (
         child.type === 'columns' &&
         child.columns.some((column) => column.blocks.some((block) => block.id === id))
      ) {
         return child.id;
      }
      if (child.type === 'section' && child.children.some((block) => block.id === id)) {
         return child.id;
      }
   }
   return null;
}

function isTypingTarget(target: EventTarget | null): boolean {
   if (!(target instanceof Element)) return false;
   if (target instanceof HTMLElement && target.isContentEditable) return true;
   return target.closest('input, textarea, select') !== null;
}

const PREVIEW_MERGE_CONTEXT: MergeContext = {
   subscriber: {
      id: 'preview-subscriber',
      email: 'max@example.com',
      first_name: 'Max',
      last_name: 'Muster',
      tags: ['preview'],
      meta: { plan: 'preview' },
   },
   campaign: {
      id: 'preview-campaign',
      subject: 'Preview subject',
      utm_campaign: 'preview',
      meta: { edition: 'preview' },
   },
   links: {
      unsubscribe: PREVIEW_UNSUBSCRIBE_URL,
   },
};

export function EmailEditor({
   value,
   onChange,
   onRender,
   issues = [],
   onUploadImage,
   className,
}: EmailEditorProps) {
   const [selectedId, setSelectedId] = useState<string | null>(null);
   const [confirmingId, setConfirmingId] = useState<string | null>(null);
   const [viewport, setViewport] = useState<Viewport>(() =>
      typeof window !== 'undefined' && window.matchMedia('(max-width: 1024px)').matches
         ? 'mobile'
         : 'desktop',
   );
   const [documentOpen, setDocumentOpen] = useState(false);
   const [libraryOpen, setLibraryOpen] = useState(
      () => typeof window === 'undefined' || window.matchMedia('(min-width: 1024px)').matches,
   );
   const [history, setHistory] = useState<History<Document>>(() => createHistory(value));
   const { toast } = useToast();

   const leftPanel = usePanelResize({
      storageKey: 'postwren-editor-left-panel',
      defaultSize: 264,
      min: 200,
      max: 420,
   });
   const rightPanel = usePanelResize({
      storageKey: 'postwren-editor-right-panel',
      defaultSize: 320,
      min: 260,
      max: 480,
      invert: true,
   });

   const historyRef = useRef(history);
   historyRef.current = history;
   const emittedRef = useRef(value);
   const doc = history.present;
   const issueCountRef = useRef(issues.length);

   useEffect(() => {
      if (issues.length > 0 && issueCountRef.current === 0) {
         toast({
            title: `${issues.length} ${issues.length === 1 ? 'issue needs' : 'issues need'} attention`,
            description: issues[0],
            variant: 'destructive',
            duration: 9000,
         });
      }
      issueCountRef.current = issues.length;
   }, [issues, toast]);

   useEffect(() => {
      if (value === historyRef.current.present || value === emittedRef.current) return;

      // The host loaded a different document, so the old undo stack belongs to another template.
      const reset = createHistory(value);
      historyRef.current = reset;
      emittedRef.current = value;
      setHistory(reset);
      setSelectedId(null);
      setConfirmingId(null);
   }, [value]);

   const preview = useMemo(() => {
      let merged: Document = doc;
      try {
         merged = applyMergeTags(doc, PREVIEW_MERGE_CONTEXT);
      } catch {
         merged = doc;
      }

      const options = { unsubscribeUrl: PREVIEW_UNSUBSCRIBE_URL };
      return {
         html: renderEmail(merged, { ...options, annotateBlocks: true }).html,
         result: renderEmail(merged, options),
      };
   }, [doc]);

   const onRenderRef = useRef(onRender);
   useEffect(() => {
      onRenderRef.current = onRender;
   }, [onRender]);
   useEffect(() => {
      onRenderRef.current?.(preview.result);
   }, [preview]);

   const applyHistory = (next: History<Document>) => {
      const nextDoc = next.present;
      if (nextDoc === historyRef.current.present) return;

      historyRef.current = next;
      emittedRef.current = nextDoc;
      setHistory(next);
      onChange(nextDoc);

      if (selectedId !== null && !findBlock(nextDoc, selectedId)) {
         setSelectedId(null);
         setConfirmingId(null);
      }
   };

   const applyChange = (next: Document, coalesceKey?: string) => {
      applyHistory(
         commit(historyRef.current, next, coalesceKey === undefined ? {} : { coalesceKey }),
      );
   };

   const undoDocument = () => applyHistory(undo(historyRef.current));
   const redoDocument = () => applyHistory(redo(historyRef.current));

   const shortcutsRef = useRef({ undoDocument, redoDocument });
   shortcutsRef.current = { undoDocument, redoDocument };

   useEffect(() => {
      const onKeyDown = (event: KeyboardEvent) => {
         if (!event.metaKey && !event.ctrlKey) return;
         if (event.altKey) return;
         if (isTypingTarget(event.target)) return;

         const key = event.key.toLowerCase();

         if (key === 'z' && !event.shiftKey) {
            event.preventDefault();
            shortcutsRef.current.undoDocument();
            return;
         }

         if ((key === 'z' && event.shiftKey) || key === 'y') {
            event.preventDefault();
            shortcutsRef.current.redoDocument();
         }
      };

      window.addEventListener('keydown', onKeyDown);
      return () => window.removeEventListener('keydown', onKeyDown);
   }, []);

   const appendBlock = (type: BlockType) => {
      const block = createBlock(type);
      const anchor = selectedId !== null ? findBlock(doc, selectedId) : null;
      const next =
         anchor !== null && selectedId !== null
            ? insertAfter(doc, selectedId, block)
            : insertBlock(doc, block, doc.children.length);

      applyChange(next);
      setSelectedId(block.id);
      setConfirmingId(null);
   };

   const appendPattern = (pattern: BlockPattern) => {
      const blocks = pattern.build();
      const first = blocks[0];
      if (first === undefined) return;

      const anchorId = selectedId !== null ? topLevelAnchor(doc, selectedId) : null;
      let next = doc;
      let anchor = anchorId;

      for (const block of blocks) {
         next =
            anchor !== null
               ? insertAfter(next, anchor, block)
               : insertBlock(next, block, next.children.length);
         anchor = block.id;
      }

      applyChange(next);
      setSelectedId(first.id);
      setConfirmingId(null);
   };

   const move = (id: string, delta: -1 | 1) => {
      applyChange(moveBlock(doc, id, delta));
   };

   const moveTo = (sourceId: string, targetId: string, position: DropPosition) => {
      const next = moveBlockTo(doc, sourceId, targetId, position);
      if (next !== doc) applyChange(next);
   };

   const duplicate = (id: string) => {
      const source = findBlock(doc, id);
      if (!source) return;

      const newId = `${source.type}-${crypto.randomUUID()}`;
      const next = duplicateBlock(doc, id, newId);
      if (next !== doc) {
         applyChange(next);
         setSelectedId(newId);
      }
      setConfirmingId(null);
   };

   const select = (id: string | null) => {
      setSelectedId(id);
      setConfirmingId(null);
   };

   const confirmDelete = (id: string) => {
      applyChange(removeBlock(doc, id));
      setConfirmingId(null);
   };

   const selectedBlock = selectedId !== null ? findBlock(doc, selectedId) : null;
   const selectedLabel = selectedBlock !== null ? blockLabel(selectedBlock) : null;

   return (
      <div
         className={cn(
            'flex h-full min-h-0 w-full flex-col overflow-hidden rounded-xl border border-border bg-background text-foreground',
            className,
         )}
         style={
            {
               '--left-panel-width': `${leftPanel.size}px`,
               '--right-panel-width': `${rightPanel.size}px`,
            } as unknown as CSSProperties
         }
      >
         <EditorToolbar
            viewport={viewport}
            onViewportChange={setViewport}
            warnings={preview.result.warnings}
            issues={issues}
            bytes={preview.result.bytes}
            canUndo={canUndo(history)}
            canRedo={canRedo(history)}
            libraryOpen={libraryOpen}
            onToggleLibrary={() => setLibraryOpen((open) => !open)}
            onUndo={undoDocument}
            onRedo={redoDocument}
            onOpenDocument={() => setDocumentOpen(true)}
            onSelectBlock={select}
         />

         <div className="relative flex min-h-0 flex-1">
            {libraryOpen && (
               <>
                  <button
                     type="button"
                     aria-label="Close blocks panel"
                     className="absolute inset-0 z-20 bg-black/40 lg:hidden"
                     onClick={() => setLibraryOpen(false)}
                  />
                  <aside
                     id="editor-left-panel"
                     aria-label="Blocks"
                     className="absolute inset-y-0 left-0 z-30 flex w-[min(18rem,85%)] min-h-0 flex-col border-r border-border bg-card/30 lg:relative lg:z-auto lg:w-[var(--left-panel-width)] lg:shrink-0"
                  >
                     <div className="min-h-0 flex-[1.2] overflow-x-hidden overflow-y-auto p-3">
                        <BlockLibrary
                           onAdd={(type) => {
                              appendBlock(type);
                              if (window.matchMedia('(max-width: 1023px)').matches) {
                                 setLibraryOpen(false);
                              }
                           }}
                           onAddPattern={(pattern) => {
                              appendPattern(pattern);
                              if (window.matchMedia('(max-width: 1023px)').matches) {
                                 setLibraryOpen(false);
                              }
                           }}
                           afterLabel={selectedLabel}
                        />
                     </div>

                     <div className="border-t border-border" />

                     <div className="flex min-h-0 flex-1 flex-col">
                        <div className="flex items-center justify-between px-3 py-2">
                           <h2 className="text-xs font-semibold">Layout</h2>
                           <span className="text-[10px] text-muted-foreground">
                              Drag to reorder
                           </span>
                        </div>
                        <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-2 pb-3">
                           <BlockTree
                              doc={doc}
                              selectedId={selectedId}
                              onSelect={select}
                              onMove={moveTo}
                           />
                        </div>
                     </div>

                     <div
                        {...leftPanel.separatorProps}
                        aria-label="Resize blocks panel"
                        aria-controls="editor-left-panel"
                        className={cn(
                           'absolute inset-y-0 -right-1 z-40 hidden w-2 cursor-col-resize touch-none outline-none lg:block',
                           'before:absolute before:inset-y-0 before:left-1/2 before:w-px before:-translate-x-1/2 before:bg-border',
                           'hover:before:bg-primary focus-visible:before:bg-primary',
                           leftPanel.dragging && 'before:bg-primary',
                        )}
                     />
                  </aside>
               </>
            )}

            <div className="flex min-h-0 min-w-0 flex-1 flex-col xl:flex-row">
               <EmailCanvas
                  html={preview.html}
                  viewport={viewport}
                  selectedId={selectedId}
                  selectedLabel={selectedLabel}
                  confirming={confirmingId !== null && confirmingId === selectedId}
                  onSelect={select}
                  onMove={move}
                  onMoveTo={moveTo}
                  onDuplicate={duplicate}
                  onRequestDelete={setConfirmingId}
                  onCancelDelete={() => setConfirmingId(null)}
                  onConfirmDelete={confirmDelete}
                  onUndo={undoDocument}
                  onRedo={redoDocument}
               />

               <div
                  {...rightPanel.separatorProps}
                  aria-label="Resize properties panel"
                  aria-controls="editor-properties-panel"
                  className={cn(
                     'relative hidden w-2 shrink-0 cursor-col-resize touch-none outline-none xl:block',
                     'before:absolute before:inset-y-0 before:left-1/2 before:w-px before:-translate-x-1/2 before:bg-border',
                     'hover:before:bg-primary focus-visible:before:bg-primary',
                     rightPanel.dragging && 'before:bg-primary',
                  )}
               />

               <aside
                  id="editor-properties-panel"
                  className="max-h-[38%] min-h-0 shrink-0 overflow-x-hidden overflow-y-auto border-t border-border bg-card/20 xl:max-h-none xl:w-[var(--right-panel-width)] xl:border-t-0"
               >
                  <PropertyPanel
                     doc={doc}
                     selectedId={selectedId}
                     onSelect={select}
                     onChange={applyChange}
                     onUploadImage={onUploadImage}
                  />
               </aside>
            </div>
         </div>

         <DocumentDialog
            open={documentOpen}
            onOpenChange={setDocumentOpen}
            doc={doc}
            onChange={applyChange}
         />
      </div>
   );
}
