import type { ComponentChildren, JSX } from 'preact';

import { withoutRef } from '../lib/preact-compat';
import { cn } from '../lib/utils';

export type TooltipProps = Omit<JSX.HTMLAttributes<HTMLSpanElement>, 'className' | 'title'> & {
   className?: string;
   content: ComponentChildren;
   side?: 'top' | 'bottom';
};

/**
 * A hover/focus tooltip for short explanations next to a label. Rendered in
 * place rather than in a portal so it inherits the surrounding typography.
 */
export function Tooltip({ className, content, side = 'top', children, ...props }: TooltipProps) {
   return (
      <span
         data-slot="tooltip"
         className={cn('group relative inline-flex', className)}
         {...withoutRef(props)}
      >
         {children}
         <span
            role="tooltip"
            className={cn(
               'pointer-events-none absolute left-1/2 z-50 w-max max-w-64 -translate-x-1/2 rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs leading-snug font-normal text-popover-foreground opacity-0 shadow-md transition-opacity group-hover:opacity-100 group-focus-within:opacity-100',
               side === 'top' ? 'bottom-full mb-1.5' : 'top-full mt-1.5',
            )}
         >
            {content}
         </span>
      </span>
   );
}
