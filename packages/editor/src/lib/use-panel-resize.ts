import { useEffect, useRef, useState } from 'react';

export type PanelResizeOptions = {
   storageKey: string;
   defaultSize: number;
   min: number;
   max: number;
   /** The panel sits on the right, so dragging left should grow it. */
   invert?: boolean;
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
}: PanelResizeOptions) {
   const [size, setSize] = useState(() => readStored(storageKey, defaultSize, min, max));
   const [dragging, setDragging] = useState(false);
   const dragRef = useRef<{ startX: number; startSize: number } | null>(null);
   const sizeRef = useRef(size);
   sizeRef.current = size;

   useEffect(() => {
      window.localStorage.setItem(storageKey, String(size));
   }, [size, storageKey]);

   const resize = (next: number) => setSize(clamp(next, min, max));

   const onPointerDown = (event: PointerEvent) => {
      event.preventDefault();
      dragRef.current = { startX: event.clientX, startSize: sizeRef.current };
      setDragging(true);
      (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
   };

   const onPointerMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (drag === null) return;
      const delta = (event.clientX - drag.startX) * (invert ? -1 : 1);
      resize(drag.startSize + delta);
   };

   const stopDragging = (event: PointerEvent) => {
      dragRef.current = null;
      setDragging(false);
      (event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId);
   };

   const onKeyDown = (event: KeyboardEvent) => {
      const step = event.shiftKey ? 48 : 16;
      if (event.key === 'ArrowLeft') {
         event.preventDefault();
         resize(sizeRef.current + (invert ? step : -step));
      } else if (event.key === 'ArrowRight') {
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
         'aria-orientation': 'vertical' as const,
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
