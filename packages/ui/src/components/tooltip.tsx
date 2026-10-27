import type { JSX } from 'preact';

import { withoutRef } from '../lib/preact-compat';
import { cn } from '../lib/utils';

export type TooltipProps = Omit<JSX.HTMLAttributes<HTMLSpanElement>, 'className' | 'title'> & {
   className?: string;
   content: string;
};

export function Tooltip({ className, content, ...props }: TooltipProps) {
   return (
      <span
         data-slot="tooltip"
         title={content}
         className={cn('inline-flex', className)}
         {...withoutRef(props)}
      />
   );
}
