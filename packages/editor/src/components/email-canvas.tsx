import { useEffect, useRef, useState } from 'react';
import { Button, cn } from '@mailer/ui';
import { ArrowDown, ArrowUp, Copy, Trash } from 'lucide-react';
import { VIEWPORT_WIDTH } from '../lib/viewport';
import type { Viewport } from '../lib/viewport';

const STYLE_ID = 'mailer-editor-canvas-style';
const MAX_CANVAS_HEIGHT = 2000;
const TOOLBAR_WIDTH = 180;

type ToolbarPosition = {
   top: number;
   left: number;
};

type EmailCanvasProps = {
   html: string;
   viewport: Viewport;
   selectedId: string | null;
   selectedLabel: string | null;
   confirming: boolean;
   onSelect: (id: string | null) => void;
   onMove: (id: string, delta: -1 | 1) => void;
   onDuplicate: (id: string) => void;
   onRequestDelete: (id: string) => void;
   onCancelDelete: () => void;
   onConfirmDelete: (id: string) => void;
};

function elementFromEvent(event: Event): Element | null {
   const target = event.target;
   if (target !== null && typeof (target as Element).closest === 'function') {
      return target as Element;
   }
   return null;
}

function findBlockElement(frameDoc: Document, id: string): Element | null {
   const elements = frameDoc.querySelectorAll('[data-block-id]');
   for (const element of elements) {
      if (element.getAttribute('data-block-id') === id) return element;
   }
   return null;
}

export function EmailCanvas({
   html,
   viewport,
   selectedId,
   selectedLabel,
   confirming,
   onSelect,
   onMove,
   onDuplicate,
   onRequestDelete,
   onCancelDelete,
   onConfirmDelete,
}: EmailCanvasProps) {
   const paneRef = useRef<HTMLDivElement>(null);
   const iframeRef = useRef<HTMLIFrameElement>(null);
   const cleanupRef = useRef<() => void>(() => undefined);
   const [toolbarPosition, setToolbarPosition] = useState<ToolbarPosition | null>(null);

   const selectedIdRef = useRef(selectedId);
   selectedIdRef.current = selectedId;
   const callbacksRef = useRef({
      onSelect,
      onMove,
      onRequestDelete,
   });
   callbacksRef.current = { onSelect, onMove, onRequestDelete };

   function updateToolbarPosition() {
      const pane = paneRef.current;
      const frame = iframeRef.current;
      const frameDoc = frame?.contentDocument;
      const id = selectedIdRef.current;

      if (!pane || !frame || !frameDoc || !id) {
         setToolbarPosition(null);
         return;
      }

      const element = findBlockElement(frameDoc, id);
      if (!element) {
         setToolbarPosition(null);
         return;
      }

      const paneRect = pane.getBoundingClientRect();
      const frameRect = frame.getBoundingClientRect();
      const blockRect = element.getBoundingClientRect();
      const top = Math.max(4, frameRect.top - paneRect.top + blockRect.top - 40 + pane.scrollTop);
      const left = Math.max(
         8,
         Math.min(
            frameRect.left - paneRect.left + blockRect.left + pane.scrollLeft,
            Math.max(8, pane.scrollWidth - TOOLBAR_WIDTH),
         ),
      );

      setToolbarPosition((previous) =>
         previous !== null && Math.abs(previous.top - top) < 1 && Math.abs(previous.left - left) < 1
            ? previous
            : { top, left },
      );
   }

   function measure() {
      const frame = iframeRef.current;
      const frameDoc = frame?.contentDocument;
      if (!frame || !frameDoc) return;

      const contentHeight = frameDoc.documentElement.scrollHeight;
      const height = Math.min(Math.max(contentHeight, 200), MAX_CANVAS_HEIGHT);
      frame.style.height = `${height}px`;
      frame.style.overflowY = contentHeight > MAX_CANVAS_HEIGHT ? 'auto' : 'hidden';
      updateToolbarPosition();
   }

   function applySelection(frameDoc: Document | null | undefined) {
      if (!frameDoc) return;
      const elements = frameDoc.querySelectorAll('[data-block-id]');
      for (const element of elements) {
         element.removeAttribute('data-mailer-selected');
      }

      const id = selectedIdRef.current;
      if (!id) return;
      const selected = findBlockElement(frameDoc, id);
      selected?.setAttribute('data-mailer-selected', 'true');
   }

   function handleKeyDown(event: KeyboardEvent) {
      const id = selectedIdRef.current;

      if (event.altKey && event.key === 'ArrowUp') {
         if (!id) return;
         event.preventDefault();
         callbacksRef.current.onMove(id, -1);
         return;
      }

      if (event.altKey && event.key === 'ArrowDown') {
         if (!id) return;
         event.preventDefault();
         callbacksRef.current.onMove(id, 1);
         return;
      }

      if (event.key === 'Escape') {
         event.preventDefault();
         callbacksRef.current.onSelect(null);
         return;
      }

      if ((event.key === 'Delete' || event.key === 'Backspace') && id) {
         event.preventDefault();
         callbacksRef.current.onRequestDelete(id);
      }
   }

   function attachToFrame() {
      cleanupRef.current();

      const frame = iframeRef.current;
      const frameDoc = frame?.contentDocument;
      if (!frame || !frameDoc) {
         setToolbarPosition(null);
         return;
      }

      if (frameDoc.getElementById(STYLE_ID) === null) {
         const style = frameDoc.createElement('style');
         style.id = STYLE_ID;
         style.textContent = [
            '[data-block-id]{cursor:pointer;}',
            '[data-block-id]:hover{outline:1px dashed #94a3b8 !important;outline-offset:-1px;}',
            '[data-block-id][data-mailer-selected]{outline:2px solid #0f766e !important;outline-offset:-2px;}',
         ].join('');
         frameDoc.head.appendChild(style);
      }

      const onClick = (event: Event) => {
         const element = elementFromEvent(event);
         if (element?.closest('a')) event.preventDefault();
         const block = element?.closest('[data-block-id]') ?? null;
         callbacksRef.current.onSelect(block?.getAttribute('data-block-id') ?? null);
      };

      const onKeyDown = (event: KeyboardEvent) => handleKeyDown(event);

      frameDoc.addEventListener('click', onClick);
      frameDoc.addEventListener('keydown', onKeyDown);

      const observer = new ResizeObserver(() => measure());
      observer.observe(frameDoc.documentElement);
      if (frameDoc.body) observer.observe(frameDoc.body);

      const onWindowResize = () => measure();
      window.addEventListener('resize', onWindowResize);

      cleanupRef.current = () => {
         frameDoc.removeEventListener('click', onClick);
         frameDoc.removeEventListener('keydown', onKeyDown);
         observer.disconnect();
         window.removeEventListener('resize', onWindowResize);
      };

      applySelection(frameDoc);
      measure();
      window.requestAnimationFrame(() => {
         applySelection(frameDoc);
         measure();
      });
   }

   useEffect(() => {
      return () => cleanupRef.current();
   }, []);

   useEffect(() => {
      const pane = paneRef.current;
      if (!pane) return;

      const onScroll = () => updateToolbarPosition();
      pane.addEventListener('scroll', onScroll, { passive: true });
      return () => pane.removeEventListener('scroll', onScroll);
   }, []);

   useEffect(() => {
      const frameDoc = iframeRef.current?.contentDocument;
      applySelection(frameDoc);
      const frame = window.requestAnimationFrame(() => measure());
      return () => window.cancelAnimationFrame(frame);
   }, [selectedId, html, viewport]);

   const handlePaneKeyDown = (event: KeyboardEvent) => {
      if (event.target !== paneRef.current) return;
      handleKeyDown(event);
   };

   return (
      <div
         ref={paneRef}
         tabIndex={0}
         onKeyDown={handlePaneKeyDown}
         className="relative min-h-0 overflow-y-auto bg-muted/30 p-4 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      >
         <div
            className={cn('mx-auto transition-[width] duration-200')}
            style={{ width: VIEWPORT_WIDTH[viewport], maxWidth: '100%' }}
         >
            <iframe
               ref={iframeRef}
               title="Email canvas"
               srcdoc={html}
               onLoad={attachToFrame}
               scrolling="auto"
               className="block w-full border-0 bg-white"
               style={{ height: '200px' }}
            />
         </div>

         {toolbarPosition !== null && selectedId !== null && selectedLabel !== null && (
            <div
               role="toolbar"
               aria-label={`${selectedLabel} actions`}
               className="absolute z-20 flex items-center gap-0.5 rounded-lg border border-border bg-popover p-1 shadow-lg"
               style={{ top: toolbarPosition.top, left: toolbarPosition.left }}
            >
               {confirming ? (
                  <>
                     <span className="px-2 text-xs font-medium text-destructive">Delete?</span>
                     <Button
                        size="sm"
                        variant="destructive"
                        className="h-7 px-2 text-xs"
                        aria-label={`Confirm delete ${selectedLabel}`}
                        onClick={() => onConfirmDelete(selectedId)}
                     >
                        Delete
                     </Button>
                     <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs"
                        aria-label="Cancel delete"
                        onClick={onCancelDelete}
                     >
                        Cancel
                     </Button>
                  </>
               ) : (
                  <>
                     <Button
                        size="icon"
                        variant="ghost"
                        className="size-7"
                        aria-label={`Move ${selectedLabel} up`}
                        onClick={() => onMove(selectedId, -1)}
                     >
                        <ArrowUp aria-hidden="true" />
                     </Button>
                     <Button
                        size="icon"
                        variant="ghost"
                        className="size-7"
                        aria-label={`Move ${selectedLabel} down`}
                        onClick={() => onMove(selectedId, 1)}
                     >
                        <ArrowDown aria-hidden="true" />
                     </Button>
                     <Button
                        size="icon"
                        variant="ghost"
                        className="size-7"
                        aria-label={`Duplicate ${selectedLabel}`}
                        onClick={() => onDuplicate(selectedId)}
                     >
                        <Copy aria-hidden="true" />
                     </Button>
                     <Button
                        size="icon"
                        variant="ghost"
                        className="size-7 text-muted-foreground hover:text-destructive"
                        aria-label={`Delete ${selectedLabel}`}
                        onClick={() => onRequestDelete(selectedId)}
                     >
                        <Trash aria-hidden="true" />
                     </Button>
                  </>
               )}
            </div>
         )}
      </div>
   );
}
