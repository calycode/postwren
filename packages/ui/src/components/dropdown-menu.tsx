import { useEffect, useRef } from 'preact/hooks';
import type { JSX } from 'preact';

import { withoutRef } from '../lib/preact-compat';
import { cn } from '../lib/utils';

function closeRootMenu(element: HTMLElement) {
   const root = element.closest('details[data-slot="dropdown-menu"]');
   root?.removeAttribute('open');
}

type DetailsProps = Omit<JSX.DetailsHTMLAttributes<HTMLDetailsElement>, 'className'> & {
   className?: string;
};

export function DropdownMenu({ className, children, ...props }: DetailsProps) {
   const rootRef = useRef<HTMLDetailsElement>(null);

   useEffect(() => {
      const root = rootRef.current;
      if (!root) return;

      const handlePointerDown = (event: PointerEvent) => {
         if (!root.hasAttribute('open')) return;
         if (event.target instanceof Node && !root.contains(event.target)) {
            root.removeAttribute('open');
         }
      };

      const handleKeyDown = (event: KeyboardEvent) => {
         if (event.key !== 'Escape' || !root.hasAttribute('open')) return;
         root.removeAttribute('open');
         root.querySelector<HTMLElement>('summary')?.focus();
      };

      document.addEventListener('pointerdown', handlePointerDown);
      document.addEventListener('keydown', handleKeyDown);

      return () => {
         document.removeEventListener('pointerdown', handlePointerDown);
         document.removeEventListener('keydown', handleKeyDown);
      };
   }, []);

   return (
      <details
         ref={rootRef}
         data-slot="dropdown-menu"
         className={cn('relative inline-block', className)}
         {...withoutRef(props)}
      >
         {children}
      </details>
   );
}

type SummaryProps = Omit<JSX.HTMLAttributes<HTMLElement>, 'className'> & {
   className?: string;
};

export function DropdownMenuTrigger({ className, ...props }: SummaryProps) {
   return (
      <summary
         data-slot="dropdown-menu-trigger"
         className={cn(
            'inline-flex cursor-pointer list-none items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium transition-colors outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background [&::-webkit-details-marker]:hidden',
            className,
         )}
         {...withoutRef(props)}
      />
   );
}

type DivProps = Omit<JSX.HTMLAttributes<HTMLDivElement>, 'className'> & {
   className?: string;
};

export function DropdownMenuContent({ className, ...props }: DivProps) {
   return (
      <div
         data-slot="dropdown-menu-content"
         className={cn(
            'absolute right-0 z-50 mt-1 min-w-40 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md',
            className,
         )}
         {...withoutRef(props)}
      />
   );
}

type ItemProps = Omit<
   JSX.ButtonHTMLAttributes<HTMLButtonElement>,
   'className' | 'type' | 'onSelect'
> & {
   className?: string;
   onSelect?: () => void;
};

export function DropdownMenuItem({ className, onClick, onSelect, ...props }: ItemProps) {
   return (
      <button
         data-slot="dropdown-menu-item"
         type="button"
         onClick={(event) => {
            onClick?.(event);
            onSelect?.();
            closeRootMenu(event.currentTarget);
         }}
         className={cn(
            'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:size-4 [&_svg]:shrink-0',
            className,
         )}
         {...withoutRef(props)}
      />
   );
}

type SeparatorProps = Omit<JSX.HTMLAttributes<HTMLDivElement>, 'className'> & {
   className?: string;
};

export function DropdownMenuSeparator({ className, ...props }: SeparatorProps) {
   return (
      <div
         data-slot="dropdown-menu-separator"
         role="separator"
         className={cn('-mx-1 my-1 h-px bg-border', className)}
         {...withoutRef(props)}
      />
   );
}
