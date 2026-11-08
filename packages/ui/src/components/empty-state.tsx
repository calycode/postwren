import type { ComponentChildren, JSX } from 'preact';

import { withoutRef } from '../lib/preact-compat';
import { cn } from '../lib/utils';

export type EmptyStateProps = Omit<JSX.HTMLAttributes<HTMLDivElement>, 'className' | 'title'> & {
   className?: string;
   icon?: ComponentChildren;
   title: ComponentChildren;
   description?: ComponentChildren;
   action?: ComponentChildren;
};

export function EmptyState({
   className,
   icon,
   title,
   description,
   action,
   ...props
}: EmptyStateProps) {
   return (
      <div
         data-slot="empty-state"
         className={cn(
            'flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card/60 px-6 py-16 text-center',
            className,
         )}
         {...withoutRef(props)}
      >
         {icon !== undefined && (
            <div
               aria-hidden="true"
               className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground [&_svg]:size-5 [&_svg]:shrink-0"
            >
               {icon}
            </div>
         )}
         <div className="grid gap-1">
            <h3 className="font-display text-lg font-medium text-foreground">{title}</h3>
            {description !== undefined && (
               <p className="max-w-md text-sm text-muted-foreground">{description}</p>
            )}
         </div>
         {action !== undefined && <div className="flex items-center gap-2">{action}</div>}
      </div>
   );
}
