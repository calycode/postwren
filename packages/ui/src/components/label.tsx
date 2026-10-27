import type { JSX } from 'preact';

import { withoutRef } from '../lib/preact-compat';
import { cn } from '../lib/utils';

export type LabelProps = JSX.LabelHTMLAttributes<HTMLLabelElement>;

export function Label({ className, ...props }: LabelProps) {
   return (
      <label
         data-slot="label"
         className={cn(
            'text-sm leading-none font-medium text-foreground peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
            className,
         )}
         {...withoutRef(props)}
      />
   );
}
