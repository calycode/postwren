import type { JSX } from 'preact';

import { withoutRef } from '../lib/preact-compat';
import { cn } from '../lib/utils';
import { badgeVariants, type BadgeVariants } from '../lib/variants';

export type BadgeProps = Omit<JSX.HTMLAttributes<HTMLSpanElement>, 'className'> &
   BadgeVariants & {
      className?: string;
   };

export function Badge({ className, variant, ...props }: BadgeProps) {
   return (
      <span
         data-slot="badge"
         className={cn(badgeVariants({ variant }), className)}
         {...withoutRef(props)}
      />
   );
}

export { badgeVariants };
