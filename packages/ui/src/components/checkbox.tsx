import { CheckIcon } from 'lucide-react';
import type { ComponentChildren, JSX } from 'preact';

import { withoutRef } from '../lib/preact-compat';
import { cn } from '../lib/utils';

export type CheckboxProps = Omit<
   JSX.InputHTMLAttributes<HTMLInputElement>,
   'className' | 'type' | 'children'
> & {
   className?: string;
   label?: ComponentChildren;
   description?: ComponentChildren;
};

export function Checkbox({ className, label, description, ...props }: CheckboxProps) {
   const hasLabel = label !== undefined || description !== undefined;

   return (
      <label
         data-slot="checkbox"
         className={cn(
            'inline-flex items-start gap-2.5 has-[:disabled]:cursor-not-allowed',
            className,
         )}
      >
         <input
            type="checkbox"
            className="peer sr-only"
            {...withoutRef(props)}
         />
         <span
            aria-hidden="true"
            className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-input bg-background transition-colors peer-checked:border-primary peer-checked:bg-primary peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background peer-disabled:opacity-50 peer-checked:[&>svg]:opacity-100"
         >
            <CheckIcon
               className="size-3 text-primary-foreground opacity-0"
               aria-hidden="true"
            />
         </span>
         {hasLabel && (
            <span className="grid gap-0.5 peer-disabled:opacity-70">
               {label !== undefined && (
                  <span className="text-sm leading-none font-medium text-foreground">{label}</span>
               )}
               {description !== undefined && (
                  <span className="text-xs text-muted-foreground">{description}</span>
               )}
            </span>
         )}
      </label>
   );
}
