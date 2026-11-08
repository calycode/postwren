import { createContext } from 'preact';
import type { JSX } from 'preact';
import { useContext, useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';

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

/**
 * A transformed ancestor (page transitions, dialogs) becomes the containing
 * block for `position: fixed`. Coordinates must be relative to it, not the
 * viewport, or the menu lands somewhere else entirely.
 */
function fixedOrigin(element: HTMLElement): {
   top: number;
   left: number;
   width: number;
   height: number;
} {
   let node = element.parentElement;
   while (node !== null) {
      const style = window.getComputedStyle(node);
      if (
         style.transform !== 'none' ||
         style.filter !== 'none' ||
         style.perspective !== 'none' ||
         style.contain.includes('paint') ||
         style.contain.includes('layout')
      ) {
         const rect = node.getBoundingClientRect();
         return { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
      }
      node = node.parentElement;
   }
   return { top: 0, left: 0, width: window.innerWidth, height: window.innerHeight };
}

/**
 * `fixed` escapes an ancestor's `overflow` clipping (for menus inside scrollable
 * panels). It positions itself against the trigger and flips above when needed.
 */
export function DropdownMenuContent({
   className,
   fixed = false,
   ...props
}: DivProps & { fixed?: boolean }) {
   const open = useContext(MenuOpenContext);
   const ref = useRef<HTMLDivElement>(null);
   const [coords, setCoords] = useState<{ top: number; left: number; width: number } | null>(null);

   useLayoutEffect(() => {
      if (!fixed || !open) {
         setCoords(null);
         return;
      }

      const content = ref.current;
      const trigger = content?.closest('details')?.querySelector('summary');
      if (content === null || trigger === undefined || trigger === null) return;

      const place = () => {
         const rect = trigger.getBoundingClientRect();
         const origin = fixedOrigin(content);
         const width = Math.max(content.offsetWidth || 0, rect.width);
         const height = content.offsetHeight || 320;
         const left = Math.max(
            8,
            Math.min(rect.right - width - origin.left, origin.width - width - 8),
         );
         const fitsBelow = origin.top + origin.height - rect.bottom > Math.min(height, 220);
         const top = fitsBelow
            ? rect.bottom + 4 - origin.top
            : Math.max(8, rect.top - origin.top - Math.min(height, origin.height - 16) - 4);
         setCoords({ top, left, width });
      };

      place();
      window.addEventListener('resize', place);
      window.addEventListener('scroll', place, true);

      return () => {
         window.removeEventListener('resize', place);
         window.removeEventListener('scroll', place, true);
      };
   }, [fixed, open]);

   return (
      <div
         ref={ref}
         data-slot="dropdown-menu-content"
         role="menu"
         style={
            fixed
               ? {
                    position: 'fixed',
                    top: coords?.top ?? 0,
                    left: coords?.left ?? 0,
                    width: coords?.width,
                    visibility: coords === null ? 'hidden' : undefined,
                    marginTop: 0,
                 }
               : undefined
         }
         className={cn(
            fixed
               ? 'z-[60] rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md'
               : 'absolute right-0 z-50 mt-1 min-w-40 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md',
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
