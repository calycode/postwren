import type { JSX } from 'preact';

import { withoutRef } from '../lib/preact-compat';
import { cn } from '../lib/utils';

export type SkeletonProps = Omit<JSX.HTMLAttributes<HTMLDivElement>, 'className'> & {
   className?: string;
};

export function Skeleton({ className, ...props }: SkeletonProps) {
   return (
      <div
         data-slot="skeleton"
         aria-hidden="true"
         className={cn('animate-pulse rounded-md bg-muted', className)}
         {...withoutRef(props)}
      />
   );
}
