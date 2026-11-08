import { useEffect, useRef, useState } from 'react';

export type PanelResizeOptions = {
   storageKey: string;
   defaultSize: number;
   min: number;
   max: number;
   /** The panel sits on the right, so dragging left should grow it. */
   invert?: boolean;
   /** `y` resizes a stacked section by its height instead of a column width. */
   axis?: 'x' | 'y';
};

function clamp(value: number, min: number, max: number): number {
   return Math.min(Math.max(Math.round(value), min), max);
}

function readStored(storageKey: string, fallback: number, min: number, max: number): number {
   if (typeof window === 'undefined') return fallback;
   const raw = window.localStorage.getItem(storageKey);
   const parsed = raw === null ? Number.NaN : Number(raw);
   return Number.isFinite(parsed) ? clamp(parsed, min, max) : fallback;
}

export function usePanelResize({
   storageKey,
   defaultSize,
   min,
   max,
   invert = false,
   axis = 'x',
}: PanelResizeOptions) {
   const [size, setSize] = useState(() => readStored(storageKey, defaultSize, min, max));
   const [dragging, setDragging] = useState(false);
   const dragRef = useRef<{ start: number; startSize: number } | null>(null);
   const sizeRef = useRef(size);
   sizeRef.current = size;

   useEffect(() => {
      window.localStorage.setItem(storageKey, String(size));
   }, [size, storageKey]);

   const resize = (next: number) => setSize(clamp(next, min, max));

   const onPointerDown = (event: PointerEvent) => {
      event.preventDefault();
      dragRef.current = {
         start: axis === 'y' ? event.clientY : event.clientX,
         startSize: sizeRef.current,
      };
      setDragging(true);
      (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
   };

   const onPointerMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (drag === null) return;
      const position = axis === 'y' ? event.clientY : event.clientX;
      const delta = (position - drag.start) * (invert ? -1 : 1);
      resize(drag.startSize + delta);
   };

   const stopDragging = (event: PointerEvent) => {
      dragRef.current = null;
      setDragging(false);
      (event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId);
   };

   const onKeyDown = (event: KeyboardEvent) => {
      const step = event.shiftKey ? 48 : 16;
      const decrease = axis === 'y' ? event.key === 'ArrowUp' : event.key === 'ArrowLeft';
      const increase = axis === 'y' ? event.key === 'ArrowDown' : event.key === 'ArrowRight';
      if (decrease) {
         event.preventDefault();
         resize(sizeRef.current + (invert ? step : -step));
      } else if (increase) {
         event.preventDefault();
         resize(sizeRef.current + (invert ? -step : step));
      }
   };

   return {
      size,
      dragging,
      resize,
      separatorProps: {
         role: 'separator' as const,
         'aria-orientation': axis === 'y' ? ('horizontal' as const) : ('vertical' as const),
         'aria-valuenow': size,
         'aria-valuemin': min,
         'aria-valuemax': max,
         tabIndex: 0,
         onPointerDown,
         onPointerMove,
         onPointerUp: stopDragging,
         onPointerCancel: stopDragging,
         onKeyDown,
      },
   };
}
