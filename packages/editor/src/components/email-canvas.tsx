import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { Button, cn } from '@postwren/ui';
import { ArrowDown, ArrowUp, BookmarkPlus, Copy, Trash } from 'lucide-react';
import { VIEWPORT_WIDTH } from '../lib/viewport';
import type { Viewport } from '../lib/viewport';
import type { InsertPosition } from '../lib/document-ops';
import type { LibraryDrag } from './add-block-menu';

const STYLE_ID = 'postwren-editor-canvas-style';
const MAX_CANVAS_HEIGHT = 2000;
const TOOLBAR_WIDTH = 180;
const TOOLBAR_HEIGHT = 36;
const SCROLL_MARGIN = 24;
const SCROLL_ATTEMPTS = 20;

type ToolbarPosition = {
   top: number;
   left: number;
};

type EmailCanvasProps = {
   html: string;
   viewport: Viewport;
   scale: number;
   selectedId: string | null;
   selectedLabel: string | null;
   confirming: boolean;
   onSelect: (id: string | null) => void;
   onMove: (id: string, delta: -1 | 1) => void;
   onMoveTo: (sourceId: string, targetId: string, position: 'before' | 'after') => void;
   onDropLibrary?: (
      payload: LibraryDrag,
      targetId: string | null,
      position: InsertPosition,
   ) => void;
   /** Set while a block is being dragged out of the library. */
   libraryDragRef?: RefObject<LibraryDrag | null>;
   onDuplicate: (id: string) => void;
   onRequestDelete: (id: string) => void;
   onRequestSaveBlock?: (id: string) => void;
   onCancelDelete: () => void;
   onConfirmDelete: (id: string) => void;
   onUndo: () => void;
   onRedo: () => void;
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
   scale,
   selectedId,
   selectedLabel,
   confirming,
   onSelect,
   onMove,
   onMoveTo,
   onDropLibrary,
   libraryDragRef,
   onDuplicate,
   onRequestDelete,
   onRequestSaveBlock,
   onCancelDelete,
   onConfirmDelete,
   onUndo,
   onRedo,
}: EmailCanvasProps) {
   const paneRef = useRef<HTMLDivElement>(null);
   const iframeRef = useRef<HTMLIFrameElement>(null);
   const cleanupRef = useRef<() => void>(() => undefined);
   const pendingScrollRef = useRef(false);
   const [toolbarPosition, setToolbarPosition] = useState<ToolbarPosition | null>(null);

   const selectedIdRef = useRef(selectedId);
   selectedIdRef.current = selectedId;
   const callbacksRef = useRef({
      onSelect,
      onMove,
      onMoveTo,
      onDropLibrary,
      onRequestDelete,
      onUndo,
      onRedo,
   });
   callbacksRef.current = {
      onSelect,
      onMove,
      onMoveTo,
      onDropLibrary,
      onRequestDelete,
      onUndo,
      onRedo,
   };

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

      const blockTop = frameRect.top - paneRect.top + pane.scrollTop + blockRect.top;
      const blockLeft = frameRect.left - paneRect.left + pane.scrollLeft + blockRect.left;

      const above = blockTop - TOOLBAR_HEIGHT - 4;
      const top = Math.max(4, above >= pane.scrollTop + 4 ? above : blockTop + 2);
      const left = Math.max(
         8,
         Math.min(blockLeft, Math.max(8, pane.scrollLeft + pane.clientWidth - TOOLBAR_WIDTH - 8)),
      );

      setToolbarPosition((previous) =>
         previous !== null && Math.abs(previous.top - top) < 1 && Math.abs(previous.left - left) < 1
            ? previous
            : { top, left },
      );
   }

   function scrollBlockIntoView(): boolean {
      const pane = paneRef.current;
      const frame = iframeRef.current;
      const frameDoc = frame?.contentDocument;
      const id = selectedIdRef.current;

      if (!pane || !frame || !frameDoc || !id) return false;

      const element = findBlockElement(frameDoc, id);
      if (!element) return false;

      const frameWindow = frame.contentWindow;
      if (frameWindow !== null) {
         const insideFrame = element.getBoundingClientRect();
         const frameHeight = frame.clientHeight;

         if (insideFrame.top < 0) {
            frameWindow.scrollBy(0, insideFrame.top - SCROLL_MARGIN);
         } else if (insideFrame.bottom > frameHeight) {
            frameWindow.scrollBy(0, insideFrame.bottom - frameHeight + SCROLL_MARGIN);
         }
      }

      const paneRect = pane.getBoundingClientRect();
      const frameRect = frame.getBoundingClientRect();
      const blockRect = element.getBoundingClientRect();
      const top = frameRect.top - paneRect.top + blockRect.top;
      const bottom = top + blockRect.height;
      const visibleTop = SCROLL_MARGIN;
      const visibleBottom = pane.clientHeight - SCROLL_MARGIN;

      let delta = 0;
      if (blockRect.height > visibleBottom - visibleTop) {
         if (top < visibleTop || bottom > visibleBottom) delta = top - visibleTop;
      } else if (top < visibleTop) {
         delta = top - visibleTop;
      } else if (bottom > visibleBottom) {
         delta = bottom - visibleBottom;
      }

      if (Math.abs(delta) > 1) pane.scrollTo({ top: pane.scrollTop + delta });

      return true;
   }

   function measure() {
      const frame = iframeRef.current;
      const frameDoc = frame?.contentDocument;
      const root = frameDoc?.documentElement;
      if (!frame || !frameDoc || !root) return;

      const contentHeight = root.scrollHeight;
      const height = Math.min(Math.max(contentHeight, 200), MAX_CANVAS_HEIGHT);
      frame.style.height = `${height}px`;
      frame.style.overflowY = contentHeight > MAX_CANVAS_HEIGHT ? 'auto' : 'hidden';
      updateToolbarPosition();
   }

   function applySelection(frameDoc: Document | null | undefined) {
      if (!frameDoc) return;
      const elements = frameDoc.querySelectorAll('[data-block-id]');
      for (const element of elements) {
         element.removeAttribute('data-postwren-selected');
      }

      const id = selectedIdRef.current;
      if (!id) return;
      const selected = findBlockElement(frameDoc, id);
      selected?.setAttribute('data-postwren-selected', 'true');
   }

   function handleHistoryKeyDown(event: KeyboardEvent): boolean {
      if ((!event.metaKey && !event.ctrlKey) || event.altKey) return false;

      const key = event.key.toLowerCase();

      if (key === 'z' && !event.shiftKey) {
         event.preventDefault();
         callbacksRef.current.onUndo();
         return true;
      }

      if ((key === 'z' && event.shiftKey) || key === 'y') {
         event.preventDefault();
         callbacksRef.current.onRedo();
         return true;
      }

      return false;
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
            '[data-block-id][data-postwren-selected]{outline:2px solid #0f766e !important;outline-offset:-2px;}',
            '[data-block-id][data-postwren-dragging]{opacity:0.45;}',
            '[data-block-id][data-postwren-drop=before]{box-shadow:inset 0 3px 0 0 #0f766e !important;}',
            '[data-block-id][data-postwren-drop=after]{box-shadow:inset 0 -3px 0 0 #0f766e !important;}',
            '[data-block-id][data-postwren-drop=inside]{outline:3px solid #0f766e !important;outline-offset:-3px;background:rgba(15,118,110,0.08) !important;}',
         ].join('');
         frameDoc.head.appendChild(style);
      }

      const markDraggable = () => {
         for (const element of frameDoc.querySelectorAll('[data-block-id]')) {
            (element as HTMLElement).draggable = true;
         }
      };
      markDraggable();

      const clearDropTargets = () => {
         for (const element of frameDoc.querySelectorAll('[data-postwren-drop]')) {
            element.removeAttribute('data-postwren-drop');
         }
      };

      let dragSourceId: string | null = null;
      let dropTarget: { id: string; position: InsertPosition } | null = null;

      const onDragStart = (event: DragEvent) => {
         const element = elementFromEvent(event)?.closest('[data-block-id]') ?? null;
         const id = element?.getAttribute('data-block-id') ?? null;

         if (element === null || id === null) {
            event.preventDefault();
            return;
         }

         dragSourceId = id;
         element.setAttribute('data-postwren-dragging', 'true');
         if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', id);
         }
      };

      /** Reordering only works between siblings; dropping into a container is a library action. */
      const sameParent = (target: Element): boolean => {
         if (dragSourceId === null) return true;
         const source = findBlockElement(frameDoc, dragSourceId);
         if (source === null) return true;
         const parentId = (element: Element): string | null =>
            element.parentElement?.closest('[data-block-id]')?.getAttribute('data-block-id') ??
            null;
         return parentId(source) === parentId(target);
      };

      const onDragOver = (event: DragEvent) => {
         const libraryPayload = dragSourceId === null ? libraryDragRef?.current : null;
         if (dragSourceId === null && (libraryPayload === null || libraryPayload === undefined))
            return;

         const element = elementFromEvent(event)?.closest('[data-block-id]') ?? null;
         const id = element?.getAttribute('data-block-id') ?? null;

         if (
            element === null ||
            id === null ||
            id === dragSourceId ||
            (dragSourceId !== null && !sameParent(element))
         ) {
            if (libraryPayload !== null && libraryPayload !== undefined) {
               event.preventDefault();
               if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';

               // Empty space below the email still accepts a drop; point at the
               // last top-level block so the insertion line is visible.
               const topLevel = Array.from(
                  frameDoc.querySelectorAll<HTMLElement>('[data-block-kind]'),
               ).filter(
                  (candidate) => candidate.parentElement?.closest('[data-block-id]') === null,
               );
               const last = topLevel[topLevel.length - 1];
               const lastId = last?.getAttribute('data-block-id') ?? null;

               if (last !== undefined && lastId !== null && lastId !== dragSourceId) {
                  const lastKind = last.getAttribute('data-block-kind');
                  const lastIsContainer = lastKind === 'section' || lastKind === 'columns';
                  if (dropTarget?.id !== lastId || dropTarget.position !== 'after') {
                     clearDropTargets();
                     last.setAttribute('data-postwren-drop', 'after');
                     dropTarget = lastIsContainer ? null : { id: lastId, position: 'after' };
                  }
               } else if (dropTarget !== null) {
                  clearDropTargets();
                  dropTarget = null;
               }
            }
            return;
         }

         event.preventDefault();
         if (event.dataTransfer) {
            event.dataTransfer.dropEffect =
               libraryPayload === null || libraryPayload === undefined ? 'move' : 'copy';
         }

         const rect = element.getBoundingClientRect();
         const containerKind = element.getAttribute('data-block-kind');
         const container = containerKind === 'section' || containerKind === 'columns';
         const payloadIsLeaf =
            libraryPayload !== null && libraryPayload !== undefined
               ? libraryPayload.kind === 'type'
                  ? libraryPayload.type !== 'section' && libraryPayload.type !== 'columns'
                  : libraryPayload.kind === 'block'
                    ? libraryPayload.block.type !== 'section' &&
                      libraryPayload.block.type !== 'columns'
                    : false
               : false;

         let position: InsertPosition;
         if (container && !payloadIsLeaf) {
            position = 'after';
         } else if (container) {
            position = 'inside';
         } else {
            position = event.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
         }

         if (dropTarget?.id === id && dropTarget.position === position) return;

         clearDropTargets();
         element.setAttribute('data-postwren-drop', position);
         dropTarget = { id, position };
      };

      const onDrop = (event: DragEvent) => {
         if (dragSourceId === null) {
            const payload = libraryDragRef?.current;
            if (payload === null || payload === undefined) return;
            event.preventDefault();
            const target = dropTarget;
            dropTarget = null;
            clearDropTargets();
            callbacksRef.current.onDropLibrary?.(
               payload,
               target?.id ?? null,
               target?.position ?? 'after',
            );
            return;
         }

         event.preventDefault();
         const sourceId = dragSourceId;
         const target = dropTarget;
         dragSourceId = null;
         dropTarget = null;
         clearDropTargets();
         for (const element of frameDoc.querySelectorAll('[data-postwren-dragging]')) {
            element.removeAttribute('data-postwren-dragging');
         }

         if (target !== null) {
            callbacksRef.current.onMoveTo(
               sourceId,
               target.id,
               target.position === 'inside' ? 'after' : target.position,
            );
         }
      };

      const onDragEnd = () => {
         dragSourceId = null;
         dropTarget = null;
         clearDropTargets();
         for (const element of frameDoc.querySelectorAll('[data-postwren-dragging]')) {
            element.removeAttribute('data-postwren-dragging');
         }
      };

      const onClick = (event: Event) => {
         const element = elementFromEvent(event);
         if (element?.closest('a')) event.preventDefault();
         const block = element?.closest('[data-block-id]') ?? null;
         callbacksRef.current.onSelect(block?.getAttribute('data-block-id') ?? null);
      };

      const onKeyDown = (event: KeyboardEvent) => {
         if (handleHistoryKeyDown(event)) return;
         handleKeyDown(event);
      };
      const onFrameScroll = () => updateToolbarPosition();

      frameDoc.addEventListener('click', onClick);
      frameDoc.addEventListener('keydown', onKeyDown);
      frameDoc.addEventListener('scroll', onFrameScroll, { passive: true, capture: true });
      frameDoc.addEventListener('dragstart', onDragStart);
      frameDoc.addEventListener('dragover', onDragOver);
      frameDoc.addEventListener('drop', onDrop);
      frameDoc.addEventListener('dragend', onDragEnd);
      const frameWindow = frame.contentWindow;
      frameWindow?.addEventListener('scroll', onFrameScroll, { passive: true });

      const observer = new ResizeObserver(() => measure());
      observer.observe(frameDoc.documentElement);
      if (frameDoc.body) observer.observe(frameDoc.body);

      const onWindowResize = () => measure();
      window.addEventListener('resize', onWindowResize);

      cleanupRef.current = () => {
         frameDoc.removeEventListener('click', onClick);
         frameDoc.removeEventListener('keydown', onKeyDown);
         frameDoc.removeEventListener('scroll', onFrameScroll, { capture: true });
         frameDoc.removeEventListener('dragstart', onDragStart);
         frameDoc.removeEventListener('dragover', onDragOver);
         frameDoc.removeEventListener('drop', onDrop);
         frameDoc.removeEventListener('dragend', onDragEnd);
         frameWindow?.removeEventListener('scroll', onFrameScroll);
         observer.disconnect();
         window.removeEventListener('resize', onWindowResize);
      };

      applySelection(frameDoc);
      measure();

      if (pendingScrollRef.current && scrollBlockIntoView()) {
         pendingScrollRef.current = false;
      }

      window.requestAnimationFrame(() => {
         markDraggable();
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
      if (selectedId === null) {
         pendingScrollRef.current = false;
         return;
      }

      pendingScrollRef.current = true;
      let attempts = 0;
      let handle = 0;

      const tick = () => {
         attempts += 1;
         if (scrollBlockIntoView()) {
            pendingScrollRef.current = false;
            return;
         }
         if (attempts < SCROLL_ATTEMPTS) handle = window.requestAnimationFrame(tick);
      };

      handle = window.requestAnimationFrame(tick);
      return () => window.cancelAnimationFrame(handle);
   }, [selectedId]);

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
         className="relative min-h-0 min-w-0 flex-1 overflow-y-auto bg-muted/30 px-2 pt-12 pb-2 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset sm:px-4 sm:pt-14 sm:pb-4"
      >
         <div
            className={cn('mx-auto transition-[width] duration-200')}
            style={{ width: VIEWPORT_WIDTH[viewport], zoom: scale }}
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
                     {onRequestSaveBlock !== undefined && (
                        <Button
                           size="icon"
                           variant="ghost"
                           className="size-7"
                           aria-label={`Save ${selectedLabel} as a reusable block`}
                           title="Save as reusable block"
                           onClick={() => onRequestSaveBlock(selectedId)}
                        >
                           <BookmarkPlus aria-hidden="true" />
                        </Button>
                     )}
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
