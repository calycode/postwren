import { Select as SelectPrimitive } from '@base-ui/react/select';
import { CheckIcon, ChevronDownIcon } from 'lucide-react';

import { withoutRef } from '../lib/preact-compat';
import { cn } from '../lib/utils';

type RootProps = Omit<
   SelectPrimitive.Root.Props<string>,
   'value' | 'defaultValue' | 'onValueChange' | 'multiple'
>;

export type SelectProps = RootProps & {
   value?: string | null;
   defaultValue?: string | null;
   onValueChange?: (value: string | null) => void;
};

export function Select({ value, defaultValue, onValueChange, ...props }: SelectProps) {
   return (
      <SelectPrimitive.Root
         data-slot="select"
         value={value}
         defaultValue={defaultValue}
         onValueChange={(next) => onValueChange?.(next)}
         {...props}
      />
   );
}

type TriggerProps = Omit<SelectPrimitive.Trigger.Props, 'className'> & {
   className?: string;
};

export function SelectTrigger({ className, children, ...props }: TriggerProps) {
   return (
      <SelectPrimitive.Trigger
         data-slot="select-trigger"
         className={cn(
            'flex h-9 w-full min-w-0 items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-xs transition-colors outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-popup-open:border-ring',
            className,
         )}
         {...withoutRef(props)}
      >
         {children}
         <SelectPrimitive.Icon className="shrink-0 text-muted-foreground">
            <ChevronDownIcon
               className="size-4"
               aria-hidden="true"
            />
         </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
   );
}

type ValueProps = Omit<SelectPrimitive.Value.Props, 'className'> & {
   className?: string;
};

export function SelectValue({ className, ...props }: ValueProps) {
   return (
      <SelectPrimitive.Value
         data-slot="select-value"
         className={cn('truncate data-placeholder:text-muted-foreground', className)}
         {...withoutRef(props)}
      />
   );
}

type ContentProps = Omit<SelectPrimitive.Popup.Props, 'className'> & {
   className?: string;
   sideOffset?: number;
};

export function SelectContent({ className, children, sideOffset = 4, ...props }: ContentProps) {
   return (
      <SelectPrimitive.Portal>
         <SelectPrimitive.Positioner
            sideOffset={sideOffset}
            className="z-50 outline-none"
         >
            <SelectPrimitive.Popup
               data-slot="select-content"
               className={cn(
                  'min-w-(--anchor-width) rounded-lg border border-border bg-popover text-popover-foreground shadow-md outline-none',
                  className,
               )}
               {...withoutRef(props)}
            >
               <SelectPrimitive.List className="max-h-64 overflow-y-auto p-1">
                  {children}
               </SelectPrimitive.List>
            </SelectPrimitive.Popup>
         </SelectPrimitive.Positioner>
      </SelectPrimitive.Portal>
   );
}

type ItemProps = Omit<SelectPrimitive.Item.Props, 'className'> & {
   className?: string;
};

export function SelectItem({ className, children, ...props }: ItemProps) {
   return (
      <SelectPrimitive.Item
         data-slot="select-item"
         className={cn(
            'relative flex cursor-default items-center gap-2 rounded-sm py-1.5 pr-2 pl-8 text-sm outline-none select-none data-disabled:pointer-events-none data-disabled:opacity-50 data-highlighted:bg-accent data-highlighted:text-accent-foreground data-highlighted:ring-2 data-highlighted:ring-ring data-highlighted:ring-inset',
            className,
         )}
         {...withoutRef(props)}
      >
         <span className="absolute left-2 flex size-4 items-center justify-center">
            <SelectPrimitive.ItemIndicator>
               <CheckIcon
                  className="size-4"
                  aria-hidden="true"
               />
            </SelectPrimitive.ItemIndicator>
         </span>
         <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      </SelectPrimitive.Item>
   );
}
