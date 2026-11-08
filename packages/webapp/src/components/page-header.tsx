import type { ComponentChildren } from 'preact';
import { Breadcrumbs } from '@/components/breadcrumbs';
import type { Breadcrumb } from '@/components/breadcrumbs';

type PageHeaderProps = {
   title: ComponentChildren;
   description?: ComponentChildren;
   actions?: ComponentChildren;
   /** Trail shown above the title. The last item is treated as the current page. */
   breadcrumbs?: Breadcrumb[];
   /** Marks the action row for the product tour. */
   actionGuideId?: string;
};

export function PageHeader({
   title,
   description,
   actions,
   breadcrumbs,
   actionGuideId,
}: PageHeaderProps) {
   return (
      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
         <div className="grid min-w-0 gap-1">
            {breadcrumbs !== undefined && breadcrumbs.length > 0 && (
               <Breadcrumbs
                  items={breadcrumbs}
                  className="mb-1"
               />
            )}
            <h1 className="font-display text-3xl leading-tight font-medium tracking-tight text-foreground sm:text-[2rem]">
               {title}
            </h1>
            {description !== undefined && (
               <p className="max-w-3xl text-sm text-muted-foreground">{description}</p>
            )}
         </div>
         {actions !== undefined && (
            <div
               className="flex shrink-0 flex-wrap items-center gap-2"
               data-guide={actionGuideId}
            >
               {actions}
            </div>
         )}
      </div>
   );
}
