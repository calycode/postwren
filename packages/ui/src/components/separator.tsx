import type { JSX } from 'preact';

import { withoutRef } from '../lib/preact-compat';
import { cn } from '../lib/utils';

export type SeparatorProps = Omit<JSX.HTMLAttributes<HTMLDivElement>, 'className'> & {
   className?: string;
   orientation?: 'horizontal' | 'vertical';
};

export function Separator({ className, orientation = 'horizontal', ...props }: SeparatorProps) {
   return (
      <div
         data-slot="separator"
         role="separator"
         aria-orientation={orientation}
         data-orientation={orientation}
         className={cn(
            'shrink-0 bg-border',
            orientation === 'horizontal' ? 'h-px w-full' : 'h-full min-h-4 w-px',
            className,
         )}
         {...withoutRef(props)}
      />
   );
}
