import { useEffect, useMemo, useRef, useState } from 'react';
import type { BlockType, Document } from '@mailer/email/ir';
import { createBlock } from '@mailer/email/ir';
import { renderEmail } from '@mailer/email/render';
import type { RenderWarning } from '@mailer/email/render';
import { applyMergeTags } from '@mailer/email/template';
import type { MergeContext } from '@mailer/email/template';
import { cn } from '@mailer/ui';
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
   removeBlock,
} from './lib/document-ops';
import { canRedo, canUndo, commit, createHistory, redo, undo } from './lib/history';
import type { History } from './lib/history';
import type { ImageUploader } from './lib/media';
import type { BlockPattern } from './lib/patterns';
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
   },
   campaign: {
      id: 'preview-campaign',
      subject: 'Preview subject',
      utm_campaign: 'preview',
   },
   links: {
      unsubscribe: PREVIEW_UNSUBSCRIBE_URL,
   },
};

export function EmailEditor({
   value,
   onChange,
   onRender,
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
   const [history, setHistory] = useState<History<Document>>(() => createHistory(value));

   const historyRef = useRef(history);
   historyRef.current = history;
   const emittedRef = useRef(value);
   const doc = history.present;

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
      >
         <EditorToolbar
            doc={doc}
            selectedId={selectedId}
            viewport={viewport}
            onViewportChange={setViewport}
            warnings={preview.result.warnings}
            bytes={preview.result.bytes}
            canUndo={canUndo(history)}
            canRedo={canRedo(history)}
            onUndo={undoDocument}
            onRedo={redoDocument}
            onAddBlock={appendBlock}
            onAddPattern={appendPattern}
            onSelectBlock={select}
            onOpenDocument={() => setDocumentOpen(true)}
         />

         <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(200px,1.2fr)_minmax(0,0.8fr)] xl:grid-cols-[minmax(0,1fr)_20rem] xl:grid-rows-1">
            <EmailCanvas
               html={preview.html}
               viewport={viewport}
               selectedId={selectedId}
               selectedLabel={selectedLabel}
               confirming={confirmingId !== null && confirmingId === selectedId}
               onSelect={select}
               onMove={move}
               onDuplicate={duplicate}
               onRequestDelete={setConfirmingId}
               onCancelDelete={() => setConfirmingId(null)}
               onConfirmDelete={confirmDelete}
               onUndo={undoDocument}
               onRedo={redoDocument}
            />

            <aside className="min-h-0 max-h-full overflow-y-auto border-t border-border bg-card/20 xl:border-t-0 xl:border-l">
               <PropertyPanel
                  doc={doc}
                  selectedId={selectedId}
                  onSelect={select}
                  onChange={applyChange}
                  onUploadImage={onUploadImage}
               />
            </aside>
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
