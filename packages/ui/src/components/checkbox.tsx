import { CheckIcon, MinusIcon } from 'lucide-react';
import type { ComponentChildren, JSX } from 'preact';
import { useEffect, useRef } from 'preact/hooks';

import { withoutRef } from '../lib/preact-compat';
import { cn } from '../lib/utils';

export type CheckboxProps = Omit<
   JSX.InputHTMLAttributes<HTMLInputElement>,
   'className' | 'type' | 'children'
> & {
   className?: string;
   label?: ComponentChildren;
   description?: ComponentChildren;
   indeterminate?: boolean;
};

export function Checkbox({
   className,
   label,
   description,
   indeterminate = false,
   ...props
}: CheckboxProps) {
   const hasLabel = label !== undefined || description !== undefined;
   const inputRef = useRef<HTMLInputElement>(null);

   useEffect(() => {
      if (inputRef.current) inputRef.current.indeterminate = indeterminate;
   }, [indeterminate]);

   return (
      <label
         data-slot="checkbox"
         className={cn(
            'inline-flex items-start gap-2.5 has-[:disabled]:cursor-not-allowed',
            className,
         )}
      >
         <input
            ref={inputRef}
            type="checkbox"
            className="peer sr-only"
            {...withoutRef(props)}
         />
         <span
            aria-hidden="true"
            data-state={indeterminate ? 'indeterminate' : 'idle'}
            className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-input bg-background transition-colors peer-checked:border-primary peer-checked:bg-primary peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background peer-disabled:opacity-50 peer-checked:[&>svg:first-child]:opacity-100 data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary"
         >
            {indeterminate ? (
               <MinusIcon
                  className="size-3 text-primary-foreground"
                  aria-hidden="true"
               />
            ) : (
               <CheckIcon
                  className="size-3 text-primary-foreground opacity-0"
                  aria-hidden="true"
               />
            )}
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
