import type { ComponentChildren } from 'preact';

type PageHeaderProps = {
   title: ComponentChildren;
   description?: ComponentChildren;
   actions?: ComponentChildren;
};

export function PageHeader({ title, description, actions }: PageHeaderProps) {
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
            <div className="flex flex-wrap items-center gap-2">{actions}</div>
         )}
      </div>
   );
}
