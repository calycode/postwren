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
import { PlainTextDialog } from './components/plain-text-dialog';
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
import type { BlockPattern } from './lib/patterns';
import type { Viewport } from './lib/viewport';

export type EmailEditorProps = {
   value: Document;
   onChange: (next: Document) => void;
   /** Called after every render of the preview, for host-level size warnings. */
   onRender?: (result: {
      html: string;
      text: string;
      bytes: number;
      warnings: RenderWarning[];
   }) => void;
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

export function EmailEditor({ value, onChange, onRender, className }: EmailEditorProps) {
   const [selectedId, setSelectedId] = useState<string | null>(null);
   const [confirmingId, setConfirmingId] = useState<string | null>(null);
   const [viewport, setViewport] = useState<Viewport>('desktop');
   const [documentOpen, setDocumentOpen] = useState(false);
   const [plainTextOpen, setPlainTextOpen] = useState(false);

   const preview = useMemo(() => {
      let merged: Document = value;
      try {
         merged = applyMergeTags(value, PREVIEW_MERGE_CONTEXT);
      } catch {
         merged = value;
      }

      const options = { unsubscribeUrl: PREVIEW_UNSUBSCRIBE_URL };
      return {
         html: renderEmail(merged, { ...options, annotateBlocks: true }).html,
         result: renderEmail(merged, options),
      };
   }, [value]);

   const onRenderRef = useRef(onRender);
   useEffect(() => {
      onRenderRef.current = onRender;
   }, [onRender]);
   useEffect(() => {
      onRenderRef.current?.(preview.result);
   }, [preview]);

   const applyChange = (next: Document) => {
      onChange(next);
      if (selectedId !== null && !findBlock(next, selectedId)) {
         setSelectedId(null);
         setConfirmingId(null);
      }
   };

   const appendBlock = (type: BlockType) => {
      const block = createBlock(type);
      const anchor = selectedId !== null ? findBlock(value, selectedId) : null;
      const next =
         anchor !== null && selectedId !== null
            ? insertAfter(value, selectedId, block)
            : insertBlock(value, block, value.children.length);

      applyChange(next);
      setSelectedId(block.id);
      setConfirmingId(null);
   };

   const appendPattern = (pattern: BlockPattern) => {
      const blocks = pattern.build();
      const first = blocks[0];
      if (first === undefined) return;

      const anchorId = selectedId !== null ? topLevelAnchor(value, selectedId) : null;
      let next = value;
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
      const next = moveBlock(value, id, delta);
      if (next !== value) applyChange(next);
   };

   const duplicate = (id: string) => {
      const source = findBlock(value, id);
      if (!source) return;

      const newId = `${source.type}-${crypto.randomUUID()}`;
      const next = duplicateBlock(value, id, newId);
      if (next !== value) {
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
      const next = removeBlock(value, id);
      if (next !== value) applyChange(next);
      setConfirmingId(null);
   };

   const selectedBlock = selectedId !== null ? findBlock(value, selectedId) : null;
   const selectedLabel = selectedBlock !== null ? blockLabel(selectedBlock) : null;

   return (
      <div
         className={cn(
            'flex h-full min-h-0 w-full flex-col overflow-hidden rounded-xl border border-border bg-background text-foreground',
            className,
         )}
      >
         <EditorToolbar
            viewport={viewport}
            onViewportChange={setViewport}
            warnings={preview.result.warnings}
            bytes={preview.result.bytes}
            onAddBlock={appendBlock}
            onAddPattern={appendPattern}
            onOpenDocument={() => setDocumentOpen(true)}
            onOpenPlainText={() => setPlainTextOpen(true)}
         />

         <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)_auto] lg:grid-cols-[minmax(0,1fr)_20rem] lg:grid-rows-1">
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
            />

            <aside className="min-h-0 overflow-y-auto border-t border-border bg-card/20 lg:border-t-0 lg:border-l">
               <PropertyPanel
                  doc={value}
                  selectedId={selectedId}
                  onSelect={select}
                  onChange={applyChange}
               />
            </aside>
         </div>

         <DocumentDialog
            open={documentOpen}
            onOpenChange={setDocumentOpen}
            doc={value}
            onChange={applyChange}
         />

         <PlainTextDialog
            open={plainTextOpen}
            onOpenChange={setPlainTextOpen}
            text={preview.result.text}
         />
      </div>
   );
}
