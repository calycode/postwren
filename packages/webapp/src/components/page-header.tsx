import type { ComponentChildren } from 'preact';

type PageHeaderProps = {
   title: ComponentChildren;
   description?: ComponentChildren;
   actions?: ComponentChildren;
   /** Marks the action row for the product tour. */
   actionGuideId?: string;
};

export function PageHeader({ title, description, actions, actionGuideId }: PageHeaderProps) {
   return (
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
         <div className="grid gap-1">
            <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
               {title}
            </h1>
            {description !== undefined && (
               <p className="max-w-3xl text-sm text-muted-foreground">{description}</p>
            )}
         </div>
         {actions !== undefined && (
            <div
               className="flex flex-wrap items-center gap-2"
               data-guide={actionGuideId}
            >
               {actions}
            </div>
         )}
      </div>
   );
}
