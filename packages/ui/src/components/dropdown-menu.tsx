import { createContext } from 'preact';
import type { JSX } from 'preact';
import { useContext, useEffect, useRef, useState } from 'preact/hooks';

import { nextMenuIndex } from '../lib/menu-keyboard';
import { withoutRef } from '../lib/preact-compat';
import { cn } from '../lib/utils';

const MenuOpenContext = createContext(false);

type DetailsProps = Omit<JSX.DetailsHTMLAttributes<HTMLDetailsElement>, 'className'> & {
   className?: string;
};

export function DropdownMenu({ className, children, ...props }: DetailsProps) {
   const rootRef = useRef<HTMLDetailsElement>(null);
   const [open, setOpen] = useState(false);

   useEffect(() => {
      const root = rootRef.current;
      if (!root) return;

      const syncOpen = () => setOpen(root.hasAttribute('open'));
      syncOpen();

      const closeMenu = () => {
         root.open = false;
         setOpen(false);
      };

      const handlePointerDown = (event: PointerEvent) => {
         if (!root.hasAttribute('open')) return;
         if (event.target instanceof Node && !root.contains(event.target)) {
            closeMenu();
         }
      };

      const handleKeyDown = (event: KeyboardEvent) => {
         if (!root.hasAttribute('open')) return;

         const inside = event.target instanceof Node && root.contains(event.target);

         if (event.key === 'Escape') {
            if (inside) event.preventDefault();
            closeMenu();
            if (inside) root.querySelector<HTMLElement>('summary')?.focus();
            return;
         }

         if (!inside) return;

         if (event.key === 'Tab') {
            closeMenu();
            return;
         }

         const items = Array.from(
            root.querySelectorAll<HTMLButtonElement>(
               '[data-slot="dropdown-menu-content"] [data-slot="dropdown-menu-item"]',
            ),
         );
         if (items.length === 0) return;

         const currentIndex = items.findIndex((item) => item === document.activeElement);
         const nextIndex = nextMenuIndex(
            currentIndex,
            items.length,
            event.key,
            (index) => items[index]?.disabled === true,
         );
         if (nextIndex === null) return;

         event.preventDefault();
         items[nextIndex]?.focus();
      };

      root.addEventListener('toggle', syncOpen);
      document.addEventListener('pointerdown', handlePointerDown);
      document.addEventListener('keydown', handleKeyDown);

      return () => {
         root.removeEventListener('toggle', syncOpen);
         document.removeEventListener('pointerdown', handlePointerDown);
         document.removeEventListener('keydown', handleKeyDown);
      };
   }, []);

   return (
      <MenuOpenContext.Provider value={open}>
         <details
            ref={rootRef}
            data-slot="dropdown-menu"
            className={cn('relative inline-block', className)}
            {...withoutRef(props)}
         >
            {children}
         </details>
      </MenuOpenContext.Provider>
   );
}

type SummaryProps = Omit<JSX.HTMLAttributes<HTMLElement>, 'className'> & {
   className?: string;
};

export function DropdownMenuTrigger({ className, ...props }: SummaryProps) {
   const open = useContext(MenuOpenContext);

   return (
      <summary
         data-slot="dropdown-menu-trigger"
         aria-haspopup="menu"
         aria-expanded={open}
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
         role="menu"
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
         role="menuitem"
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

function closeRootMenu(element: HTMLElement) {
   const root = element.closest<HTMLDetailsElement>('details[data-slot="dropdown-menu"]');
   if (root) root.open = false;
}
