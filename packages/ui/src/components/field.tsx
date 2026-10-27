import type { ComponentChildren, JSX } from 'preact';

import { withoutRef } from '../lib/preact-compat';
import { cn } from '../lib/utils';
import { Label } from './label';

export type FieldProps = Omit<
   JSX.HTMLAttributes<HTMLDivElement>,
   'className' | 'children' | 'label'
> & {
   className?: string;
   children: ComponentChildren;
   label?: ComponentChildren;
   htmlFor?: string;
   hint?: ComponentChildren;
   error?: ComponentChildren;
   required?: boolean;
};

export function Field({
   className,
   children,
   label,
   htmlFor,
   hint,
   error,
   required = false,
   ...props
}: FieldProps) {
   const hintId = htmlFor ? `${htmlFor}-hint` : undefined;
   const errorId = htmlFor ? `${htmlFor}-error` : undefined;

   return (
      <div
         data-slot="field"
         className={cn('grid gap-2', className)}
         {...withoutRef(props)}
      >
         {label !== undefined && (
            <Label htmlFor={htmlFor}>
               {label}
               {required && (
                  <span
                     aria-hidden="true"
                     className="ml-0.5 text-destructive"
                  >
                     *
                  </span>
               )}
            </Label>
         )}
         {children}
         {error !== undefined ? (
            <p
               id={errorId}
               className="text-xs font-medium text-destructive"
            >
               {error}
            </p>
         ) : hint !== undefined ? (
            <p
               id={hintId}
               className="text-xs text-muted-foreground"
            >
               {hint}
            </p>
         ) : null}
      </div>
   );
}
