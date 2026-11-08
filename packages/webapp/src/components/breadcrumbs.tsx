import type { ComponentChildren } from 'preact';
import { ChevronRight } from 'lucide-react';
import { cn } from '@postwren/ui';

export type Breadcrumb = {
   label: ComponentChildren;
   href?: string;
};

/** The last crumb is the current page and stays unlinked. */
export function Breadcrumbs({ items, className }: { items: Breadcrumb[]; className?: string }) {
   return (
      <nav
         aria-label="Breadcrumb"
         className={cn(
            'flex flex-wrap items-center gap-1 text-xs text-muted-foreground',
            className,
         )}
      >
         {items.map((item, index) => {
            const last = index === items.length - 1;
            return (
               <span
                  key={`${index}-${typeof item.label === 'string' ? item.label : 'crumb'}`}
                  className="inline-flex items-center gap-1"
               >
                  {index > 0 && (
                     <ChevronRight
                        className="size-3.5 shrink-0 opacity-60"
                        aria-hidden="true"
                     />
                  )}
                  {item.href !== undefined && !last ? (
                     <a
                        href={item.href}
                        className="rounded-sm underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                     >
                        {item.label}
                     </a>
                  ) : (
                     <span
                        aria-current={last ? 'page' : undefined}
                        className={cn('truncate', last && 'text-foreground')}
                     >
                        {item.label}
                     </span>
                  )}
               </span>
            );
         })}
      </nav>
   );
}
