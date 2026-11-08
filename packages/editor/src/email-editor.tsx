import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { BlockType, Block, Document } from '@postwren/email/ir';
import { createBlock } from '@postwren/email/ir';
import { renderEmail } from '@postwren/email/render';
import type { RenderWarning } from '@postwren/email/render';
import { applyMergeTags } from '@postwren/email/template';
import type { MergeContext } from '@postwren/email/template';
import {
   Button,
   Dialog,
   DialogContent,
   DialogDescription,
   DialogFooter,
   DialogHeader,
   DialogTitle,
   Field,
   Input,
   cn,
   useToast,
} from '@postwren/ui';
import { BlockLibrary } from './components/add-block-menu';
import type { LibraryDrag } from './components/add-block-menu';
import type { SavedBlockSummary } from './components/add-block-menu';
import { BlockTree } from './components/block-outline';
import { DocumentDialog } from './components/document-dialog';
import { EditorToolbar } from './components/editor-toolbar';
import { EmailCanvas } from './components/email-canvas';
import { PropertyPanel } from './components/property-panel';
import {
   blockLabel,
   cloneBlockWithNewIds,
   duplicateBlock,
   findBlock,
   insertAtTarget,
   moveBlock,
   moveBlockTo,
   removeBlock,
} from './lib/document-ops';
import type { DropPosition, InsertPosition } from './lib/document-ops';
import { canRedo, canUndo, commit, createHistory, redo, undo } from './lib/history';
import type { History } from './lib/history';
import type { ImagePicker, ImageUploader } from './lib/media';
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
   /** Host-provided media-library picker, forwarded to the property panel. */
   onPickImage?: ImagePicker;
   /** Reusable blocks the host has saved for this workspace. */
   savedBlocks?: readonly SavedBlockSummary[];
   /** Persists one block as a reusable block. */
   onSaveBlock?: (block: Block, name: string) => Promise<void>;
   onDeleteSavedBlock?: (id: string) => void;
   className?: string;
};

const PREVIEW_UNSUBSCRIBE_URL = 'https://example.com/u/preview';

/**
 * The editor is embedded in a shell that already uses part of the viewport, so its own width decides
 * the layout. Below these widths the side panels stop taking a column and become overlays or stack.
 */
const LIBRARY_INLINE_MIN_WIDTH = 720;
const PROPERTIES_INLINE_MIN_WIDTH = 1080;

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
   automation: {
      id: 'preview-automation',
      meta: { stage: 'preview' },
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
   onPickImage,
   savedBlocks = [],
   onSaveBlock,
   onDeleteSavedBlock,
   className,
}: EmailEditorProps) {
   const [selectedId, setSelectedId] = useState<string | null>(null);
   const libraryDragRef = useRef<LibraryDrag | null>(null);
   const [confirmingId, setConfirmingId] = useState<string | null>(null);
   const [viewport, setViewport] = useState<Viewport>(() =>
      typeof window !== 'undefined' && window.matchMedia('(max-width: 1024px)').matches
         ? 'mobile'
         : 'desktop',
   );
   const [documentOpen, setDocumentOpen] = useState(false);
   const [libraryOpen, setLibraryOpen] = useState(false);
   const [libraryDragging, setLibraryDragging] = useState(false);
   const [focusMode, setFocusMode] = useState(false);
   const [zoom, setZoom] = useState(1);
   const [saveBlockId, setSaveBlockId] = useState<string | null>(null);
   const [saveBlockName, setSaveBlockName] = useState('');
   const [savingBlock, setSavingBlock] = useState(false);
   const [saveBlockError, setSaveBlockError] = useState<string | null>(null);
   const [editorWidth, setEditorWidth] = useState(0);
   const [history, setHistory] = useState<History<Document>>(() => createHistory(value));
   const { toast } = useToast();

   const rootRef = useRef<HTMLDivElement>(null);
   const libraryTouchedRef = useRef(false);
   const libraryInline = editorWidth >= LIBRARY_INLINE_MIN_WIDTH;
   const propertiesInline = editorWidth >= PROPERTIES_INLINE_MIN_WIDTH;

   useLayoutEffect(() => {
      const element = rootRef.current;
      if (element === null) return;

      const update = (width: number) => {
         const rounded = Math.round(width);
         setEditorWidth((current) => (current === rounded ? current : rounded));
      };

      update(element.getBoundingClientRect().width);
      const observer = new ResizeObserver((entries) => {
         const entry = entries[0];
         if (entry !== undefined) update(entry.contentRect.width);
      });
      observer.observe(element);
      return () => observer.disconnect();
   }, []);

   useLayoutEffect(() => {
      if (editorWidth === 0 || libraryTouchedRef.current) return;
      setLibraryOpen(libraryInline);
   }, [editorWidth, libraryInline]);

   const toggleLibrary = () => {
      libraryTouchedRef.current = true;
      setLibraryOpen((open) => !open);
   };

   const closeLibrary = () => {
      libraryTouchedRef.current = true;
      setLibraryOpen(false);
   };

   const leftPanel = usePanelResize({
      storageKey: 'postwren-editor-left-panel-v2',
      defaultSize: 220,
      min: 190,
      max: 360,
   });
   const rightPanel = usePanelResize({
      storageKey: 'postwren-editor-right-panel-v2',
      defaultSize: 260,
      min: 230,
      max: 420,
      invert: true,
   });
   const libraryPanel = usePanelResize({
      storageKey: 'postwren-editor-library-height',
      defaultSize: 340,
      min: 160,
      max: 720,
      axis: 'y',
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
      const next = insertAtTarget(doc, block, selectedId, 'after');

      applyChange(next);
      setSelectedId(block.id);
      setConfirmingId(null);
   };

   const appendPattern = (pattern: BlockPattern) => {
      const blocks = pattern.build();
      const first = blocks[0];
      if (first === undefined) return;

      let next = doc;
      let anchor = selectedId;

      for (const block of blocks) {
         next = insertAtTarget(next, block, anchor, 'after');
         anchor = block.id;
      }

      applyChange(next);
      setSelectedId(first.id);
      setConfirmingId(null);
   };

   const insertBlockFromLibrary = (
      payload: LibraryDrag,
      targetId: string | null,
      position: InsertPosition,
   ) => {
      const blocks =
         payload.kind === 'type'
            ? [createBlock(payload.type)]
            : payload.kind === 'block'
              ? [cloneBlockWithNewIds(payload.block)]
              : payload.pattern.build();
      const first = blocks[0];
      if (first === undefined) return;

      let next = doc;
      let anchor = targetId;
      let at = position;

      for (const block of blocks) {
         next = insertAtTarget(next, block, anchor, at);
         anchor = block.id;
         at = 'after';
      }

      applyChange(next);
      setSelectedId(first.id);
      setConfirmingId(null);
      libraryDragRef.current = null;
      setLibraryDragging(false);
      if (!libraryInline) setLibraryOpen(false);
   };

   const appendSavedBlock = (source: Block) => {
      const block = cloneBlockWithNewIds(source);
      const next = insertAtTarget(doc, block, selectedId, 'after');

      applyChange(next);
      setSelectedId(block.id);
      setConfirmingId(null);
   };

   function requestSaveBlock(id: string) {
      const block = findBlock(doc, id);
      if (block === null) return;
      setSaveBlockName(blockLabel(block));
      setSaveBlockError(null);
      setSaveBlockId(id);
   }

   async function submitSaveBlock(event: Event) {
      event.preventDefault();
      if (saveBlockId === null || onSaveBlock === undefined) return;

      const block = findBlock(doc, saveBlockId);
      const name = saveBlockName.trim();
      if (block === null) {
         setSaveBlockError('That block is no longer in the document.');
         return;
      }
      if (name.length === 0) {
         setSaveBlockError('Give the block a name.');
         return;
      }

      setSavingBlock(true);
      setSaveBlockError(null);
      try {
         await onSaveBlock(block, name);
         setSaveBlockId(null);
         toast({ title: `Saved "${name}" to your blocks`, variant: 'success' });
      } catch (cause) {
         setSaveBlockError(
            cause instanceof Error && cause.message.length > 0
               ? cause.message
               : 'Could not save the block',
         );
      } finally {
         setSavingBlock(false);
      }
   }

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
   const libraryHint =
      selectedBlock?.type === 'section'
         ? 'New blocks are added inside this section.'
         : selectedBlock?.type === 'columns'
           ? 'New blocks are added inside the first column.'
           : undefined;

   return (
      <div
         ref={rootRef}
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
            libraryOpen={libraryOpen && !focusMode}
            onToggleLibrary={toggleLibrary}
            focusMode={focusMode}
            onToggleFocus={() => setFocusMode((value) => !value)}
            zoom={zoom}
            onZoomChange={setZoom}
            onUndo={undoDocument}
            onRedo={redoDocument}
            onOpenDocument={() => setDocumentOpen(true)}
            onSelectBlock={select}
         />

         <div className="relative flex min-h-0 flex-1">
            {libraryOpen && !focusMode && (
               <>
                  {!libraryInline && !libraryDragging && (
                     <button
                        type="button"
                        aria-label="Close blocks panel"
                        className="absolute inset-0 z-20 bg-black/40"
                        onClick={closeLibrary}
                     />
                  )}
                  <aside
                     id="editor-left-panel"
                     aria-label="Blocks"
                     className={cn(
                        'flex min-h-0 flex-col border-r border-border',
                        libraryInline
                           ? 'relative w-[var(--left-panel-width)] shrink-0 bg-card/30'
                           : 'absolute inset-y-0 left-0 z-30 w-[min(18rem,85%)] bg-card shadow-xl',
                     )}
                  >
                     <div
                        className="min-h-0 max-h-[70%] shrink-0 overflow-x-hidden overflow-y-auto p-3"
                        style={{ height: libraryPanel.size }}
                     >
                        <BlockLibrary
                           onAdd={(type) => {
                              appendBlock(type);
                              if (!libraryInline) setLibraryOpen(false);
                           }}
                           onAddPattern={(pattern) => {
                              appendPattern(pattern);
                              if (!libraryInline) setLibraryOpen(false);
                           }}
                           savedBlocks={savedBlocks}
                           onAddSavedBlock={(block) => {
                              appendSavedBlock(block);
                              if (!libraryInline) setLibraryOpen(false);
                           }}
                           onDeleteSavedBlock={onDeleteSavedBlock}
                           afterLabel={selectedLabel}
                           hint={libraryHint}
                           onDragItemStart={(payload) => {
                              libraryDragRef.current = payload;
                              setLibraryDragging(true);
                           }}
                           onDragItemEnd={() => {
                              libraryDragRef.current = null;
                              setLibraryDragging(false);
                           }}
                        />
                     </div>

                     <div
                        {...libraryPanel.separatorProps}
                        aria-label="Resize block library"
                        aria-controls="editor-left-panel"
                        className={cn(
                           'relative h-2 shrink-0 cursor-row-resize touch-none outline-none',
                           'before:absolute before:inset-x-0 before:top-1/2 before:h-px before:-translate-y-1/2 before:bg-border',
                           'hover:before:bg-primary focus-visible:before:bg-primary',
                           libraryPanel.dragging && 'before:bg-primary',
                        )}
                     />

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

                     {libraryInline && (
                        <div
                           {...leftPanel.separatorProps}
                           aria-label="Resize blocks panel"
                           aria-controls="editor-left-panel"
                           className={cn(
                              'absolute inset-y-0 -right-1 z-40 w-2 cursor-col-resize touch-none outline-none',
                              'before:absolute before:inset-y-0 before:left-1/2 before:w-px before:-translate-x-1/2 before:bg-border',
                              'hover:before:bg-primary focus-visible:before:bg-primary',
                              leftPanel.dragging && 'before:bg-primary',
                           )}
                        />
                     )}
                  </aside>
               </>
            )}

            <div
               className={cn(
                  'flex min-h-0 min-w-0 flex-1 flex-col',
                  propertiesInline && !focusMode && 'flex-row',
               )}
            >
               <EmailCanvas
                  html={preview.html}
                  viewport={viewport}
                  scale={zoom}
                  selectedId={selectedId}
                  selectedLabel={selectedLabel}
                  confirming={confirmingId !== null && confirmingId === selectedId}
                  onSelect={select}
                  onMove={move}
                  onMoveTo={moveTo}
                  onDropLibrary={insertBlockFromLibrary}
                  libraryDragRef={libraryDragRef}
                  onDuplicate={duplicate}
                  onRequestDelete={setConfirmingId}
                  onRequestSaveBlock={onSaveBlock !== undefined ? requestSaveBlock : undefined}
                  onCancelDelete={() => setConfirmingId(null)}
                  onConfirmDelete={confirmDelete}
                  onUndo={undoDocument}
                  onRedo={redoDocument}
               />

               {propertiesInline && !focusMode && (
                  <div
                     {...rightPanel.separatorProps}
                     aria-label="Resize properties panel"
                     aria-controls="editor-properties-panel"
                     className={cn(
                        'relative w-2 shrink-0 cursor-col-resize touch-none outline-none',
                        'before:absolute before:inset-y-0 before:left-1/2 before:w-px before:-translate-x-1/2 before:bg-border',
                        'hover:before:bg-primary focus-visible:before:bg-primary',
                        rightPanel.dragging && 'before:bg-primary',
                     )}
                  />
               )}

               <aside
                  id="editor-properties-panel"
                  className={cn(
                     'min-h-0 shrink-0 overflow-x-hidden overflow-y-auto bg-card/20',
                     focusMode
                        ? 'hidden'
                        : propertiesInline
                          ? 'w-[var(--right-panel-width)]'
                          : 'max-h-[38%] border-t border-border',
                  )}
               >
                  <PropertyPanel
                     doc={doc}
                     selectedId={selectedId}
                     onSelect={select}
                     onChange={applyChange}
                     onUploadImage={onUploadImage}
                     onPickImage={onPickImage}
                  />
               </aside>
            </div>
         </div>

         <Dialog
            open={saveBlockId !== null}
            onOpenChange={(open) => {
               if (!open && !savingBlock) {
                  setSaveBlockId(null);
                  setSaveBlockError(null);
               }
            }}
         >
            <DialogContent className="max-w-md">
               <DialogHeader>
                  <DialogTitle>Save as reusable block</DialogTitle>
                  <DialogDescription>
                     This block will appear under Your blocks in the block library for every
                     template in this workspace.
                  </DialogDescription>
               </DialogHeader>

               <form
                  className="grid gap-4"
                  onSubmit={(event) => void submitSaveBlock(event)}
               >
                  <Field
                     label="Block name"
                     htmlFor="saved-block-name"
                     error={saveBlockError ?? undefined}
                     required
                  >
                     <Input
                        id="saved-block-name"
                        value={saveBlockName}
                        maxLength={100}
                        autoFocus
                        onInput={(event) => {
                           setSaveBlockName(event.currentTarget.value);
                           setSaveBlockError(null);
                        }}
                     />
                  </Field>

                  <DialogFooter>
                     <Button
                        variant="outline"
                        type="button"
                        disabled={savingBlock}
                        onClick={() => setSaveBlockId(null)}
                     >
                        Cancel
                     </Button>
                     <Button
                        type="submit"
                        disabled={savingBlock}
                     >
                        {savingBlock ? 'Saving…' : 'Save block'}
                     </Button>
                  </DialogFooter>
               </form>
            </DialogContent>
         </Dialog>

         <DocumentDialog
            open={documentOpen}
            onOpenChange={setDocumentOpen}
            doc={doc}
            onChange={applyChange}
         />
      </div>
   );
}
