import { createContext } from 'preact';
import type { ComponentChildren } from 'preact';
import { useCallback, useContext, useMemo, useRef, useState } from 'preact/hooks';
import { CircleAlert, CircleCheck, Info, X } from 'lucide-react';

import { cn } from '../lib/utils';

export type ToastVariant = 'default' | 'success' | 'warning' | 'destructive';

export type ToastOptions = {
   title: ComponentChildren;
   description?: ComponentChildren;
   variant?: ToastVariant;
   /** Milliseconds before the toast dismisses itself. Pass 0 to keep it until dismissed. */
   duration?: number;
};

type ToastItem = ToastOptions & { id: number };

type ToastContextValue = {
   toast: (options: ToastOptions) => number;
   dismiss: (id: number) => void;
};

const ToastContext = createContext<ToastContextValue>({
   toast: () => 0,
   dismiss: () => undefined,
});

const ICONS = {
   default: Info,
   success: CircleCheck,
   warning: CircleAlert,
   destructive: CircleAlert,
} as const;

const TONES: Record<ToastVariant, string> = {
   default: 'border-border text-foreground',
   success: 'border-success-foreground/25 text-foreground',
   warning: 'border-warning-foreground/30 text-foreground',
   destructive: 'border-destructive/40 text-foreground',
};

const ICON_TONES: Record<ToastVariant, string> = {
   default: 'text-muted-foreground',
   success: 'text-success-foreground',
   warning: 'text-warning-foreground',
   destructive: 'text-destructive',
};

export function ToastProvider({ children }: { children: ComponentChildren }) {
   const [items, setItems] = useState<ToastItem[]>([]);
   const nextId = useRef(0);
   const timers = useRef(new Map<number, number>());

   const dismiss = useCallback((id: number) => {
      const timer = timers.current.get(id);
      if (timer !== undefined) {
         window.clearTimeout(timer);
         timers.current.delete(id);
      }
      setItems((current) => current.filter((item) => item.id !== id));
   }, []);

   const toast = useCallback(
      (options: ToastOptions) => {
         const id = nextId.current + 1;
         nextId.current = id;

         setItems((current) => [...current.slice(-3), { ...options, id }]);

         const duration = options.duration ?? 6000;
         if (duration > 0) {
            timers.current.set(
               id,
               window.setTimeout(() => dismiss(id), duration),
            );
         }

         return id;
      },
      [dismiss],
   );

   const value = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

   return (
      <ToastContext.Provider value={value}>
         {children}
         <div
            data-slot="toaster"
            aria-live="polite"
            aria-label="Notifications"
            className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex flex-col items-center gap-2 p-4 sm:inset-x-auto sm:right-0 sm:items-end"
         >
            {items.map((item) => {
               const variant = item.variant ?? 'default';
               const Icon = ICONS[variant];

               return (
                  <div
                     key={item.id}
                     role={variant === 'destructive' ? 'alert' : 'status'}
                     className={cn(
                        'pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border bg-popover px-4 py-3 text-popover-foreground shadow-lg',
                        'animate-[toast-in_160ms_ease-out]',
                        TONES[variant],
                     )}
                  >
                     <Icon
                        className={cn('mt-0.5 size-4 shrink-0', ICON_TONES[variant])}
                        aria-hidden="true"
                     />
                     <div className="grid min-w-0 flex-1 gap-0.5">
                        <p className="text-sm font-medium break-words">{item.title}</p>
                        {item.description !== undefined && (
                           <div className="text-xs break-words text-muted-foreground">
                              {item.description}
                           </div>
                        )}
                     </div>
                     <button
                        type="button"
                        aria-label="Dismiss notification"
                        className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                        onClick={() => dismiss(item.id)}
                     >
                        <X
                           className="size-3.5"
                           aria-hidden="true"
                        />
                     </button>
                  </div>
               );
            })}
         </div>
      </ToastContext.Provider>
   );
}

export function useToast(): ToastContextValue {
   return useContext(ToastContext);
}
