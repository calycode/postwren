import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@postwren/ui';

const PANEL_DOCK_QUERY = '(min-width: 1280px)';
const PANEL_GAP = 32;
const FLOW_RADIUS = 14;
const FLOW_MAX_WIDTH = 160;

type Flow = { width: number; top: number; height: number };

/**
 * Reserves the part of the docked panel that would overlap the page's centered
 * content. A fixed padding large enough for the panel leaves a wide empty strip
 * on large screens because the panel is pinned to the viewport, not the content.
 */
export function useDetailPanelInset(open: boolean): number {
   const [inset, setInset] = useState(0);

   useEffect(() => {
      if (!open) {
         setInset(0);
         return;
      }

      const main = document.getElementById('main-content');
      if (main === null) return;

      const measure = () => {
         const panel = document.querySelector<HTMLElement>('[data-detail-panel]');
         if (panel === null || !window.matchMedia(PANEL_DOCK_QUERY).matches) {
            setInset(0);
            return;
         }

         const mainRect = main.getBoundingClientRect();
         const mainPadding = Number.parseFloat(getComputedStyle(main).paddingRight) || 0;
         const contentRight = mainRect.right - mainPadding;
         setInset(
            Math.max(0, Math.ceil(contentRight - panel.getBoundingClientRect().left + PANEL_GAP)),
         );
      };

      measure();
      const observer = new ResizeObserver(measure);
      observer.observe(main);
      window.addEventListener('resize', measure);
      return () => {
         observer.disconnect();
         window.removeEventListener('resize', measure);
      };
   }, [open]);

   return inset;
}

/**
 * Finds the table row that owns the panel and turns the empty space between
 * that row and the docked panel into a short liquid bridge. The row is found by
 * its stable `data-row-key`, so a list reload or scroll keeps the bridge glued
 * to the right row without threading refs through the table component.
 */
function useRowFlow(rowKey: string, panelRef: { current: HTMLElement | null }): Flow | null {
   const [flow, setFlow] = useState<Flow | null>(null);

   useEffect(() => {
      if (typeof window === 'undefined') {
         setFlow(null);
         return;
      }

      let frame = 0;

      const measure = () => {
         frame = 0;
         const panel = panelRef.current;
         const row = document.querySelector<HTMLElement>(`[data-row-key="${CSS.escape(rowKey)}"]`);

         if (panel === null || row === null || !window.matchMedia(PANEL_DOCK_QUERY).matches) {
            setFlow(null);
            return;
         }

         const panelRect = panel.getBoundingClientRect();
         const rowRect = row.getBoundingClientRect();
         const scroller = row.closest('[data-slot="table-container"]');
         const visibleRight = Math.min(
            rowRect.right,
            scroller?.getBoundingClientRect().right ?? rowRect.right,
         );
         const width = Math.min(FLOW_MAX_WIDTH, panelRect.left - visibleRight);
         const visible = rowRect.bottom > 0 && rowRect.top < window.innerHeight;

         if (!visible || width < 8) {
            setFlow(null);
            return;
         }

         const next = {
            width: Math.round(width),
            top: rowRect.top - panelRect.top,
            height: Math.round(rowRect.height),
         };

         setFlow((current) =>
            current !== null &&
            current.width === next.width &&
            current.top === next.top &&
            current.height === next.height
               ? current
               : next,
         );
      };

      const schedule = () => {
         if (frame !== 0) return;
         frame = window.requestAnimationFrame(measure);
      };

      measure();
      window.addEventListener('scroll', schedule, { passive: true });
      window.addEventListener('resize', schedule);

      const observer = new ResizeObserver(schedule);
      const panel = panelRef.current;
      if (panel !== null) observer.observe(panel);

      // The page reserves space for the panel by animating its own padding, so
      // the table can reflow (and rows can wrap) without the panel resizing.
      const layout = document.getElementById('main-content')?.firstElementChild;
      if (layout !== undefined && layout !== null) observer.observe(layout, { box: 'content-box' });

      return () => {
         if (frame !== 0) window.cancelAnimationFrame(frame);
         window.removeEventListener('scroll', schedule);
         window.removeEventListener('resize', schedule);
         observer.disconnect();
      };
   }, [panelRef, rowKey]);

   return flow;
}

function PanelFlow({
   id,
   width,
   top,
   height,
}: {
   id: string;
   width: number;
   top: number;
   height: number;
}) {
   const gradientId = `detail-flow-${id}`;
   const radius = Math.max(2, Math.min(FLOW_RADIUS, width / 2));
   const bandTop = radius;
   const bandBottom = radius + height;
   const svgHeight = height + radius * 2;
   const path = [
      `M ${width} 0`,
      `Q ${width} ${bandTop} ${width - radius} ${bandTop}`,
      `L 0 ${bandTop}`,
      `L 0 ${bandBottom}`,
      `L ${width - radius} ${bandBottom}`,
      `Q ${width} ${bandBottom} ${width} ${bandBottom + radius}`,
      'Z',
   ].join(' ');

   return (
      <div
         aria-hidden="true"
         className="detail-panel-flow pointer-events-none absolute hidden xl:block"
         style={{
            left: -width,
            top: top - radius,
            width,
            height: svgHeight,
         }}
      >
         <svg
            width={width}
            height={svgHeight}
            viewBox={`0 0 ${width} ${svgHeight}`}
            fill="none"
         >
            <defs>
               <linearGradient
                  id={gradientId}
                  x1="0"
                  y1="0"
                  x2="1"
                  y2="0"
               >
                  <stop
                     offset="0%"
                     stopColor="color-mix(in oklab, var(--accent) 55%, var(--card))"
                  />
                  <stop
                     offset="100%"
                     stopColor="var(--card)"
                  />
               </linearGradient>
            </defs>
            <path
               d={path}
               fill={`url(#${gradientId})`}
            />
         </svg>
      </div>
   );
}

export function DetailPanel({
   label,
   closeLabel,
   rowKey,
   onClose,
   header,
   children,
}: {
   label: string;
   closeLabel: string;
   rowKey: string;
   onClose: () => void;
   header: ComponentChildren;
   children: ComponentChildren;
}) {
   const panelRef = useRef<HTMLDivElement>(null);
   const flow = useRowFlow(rowKey, panelRef);

   return (
      <>
         <button
            type="button"
            aria-label={closeLabel}
            className="fixed inset-0 z-30 bg-black/40 xl:hidden"
            onClick={onClose}
         />
         <aside
            ref={panelRef}
            data-detail-panel=""
            aria-label={label}
            className="fixed inset-y-0 right-0 z-40 flex w-full max-w-md flex-col xl:z-20 xl:w-[24rem] xl:max-w-none"
         >
            <div className="detail-panel-sheet relative flex min-h-0 flex-1 flex-col overflow-hidden bg-background shadow-xl xl:rounded-l-[1.75rem] xl:bg-card xl:shadow-[0_24px_70px_-28px_rgba(20,41,58,0.45)]">
               <header className="relative z-10 flex items-start gap-3 border-b border-border bg-background/95 px-5 pt-6 pb-5 backdrop-blur xl:bg-card/95">
                  <div className="flex min-w-0 flex-1 items-start gap-3">{header}</div>
                  <Button
                     variant="ghost"
                     size="icon"
                     className="size-8 shrink-0 text-muted-foreground"
                     aria-label={closeLabel}
                     onClick={onClose}
                  >
                     <X aria-hidden="true" />
                  </Button>
               </header>

               <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-5 pb-8 [scrollbar-gutter:stable]">
                  <div className="grid min-w-0 gap-5">{children}</div>
               </div>
            </div>

            {flow !== null && (
               <PanelFlow
                  id={rowKey}
                  width={flow.width}
                  top={flow.top}
                  height={flow.height}
               />
            )}
         </aside>
      </>
   );
}
