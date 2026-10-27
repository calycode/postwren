import { createContext, type JSX } from 'preact';
import { useContext, useState } from 'preact/hooks';

import { nextTabIndex } from '../lib/tabs-keyboard';
import { withoutRef } from '../lib/preact-compat';
import { cn } from '../lib/utils';

type TabsContextValue = {
   value: string;
   setValue: (value: string) => void;
   baseId?: string;
};

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabsContext() {
   const context = useContext(TabsContext);
   if (!context) throw new Error('Tabs components must be used inside <Tabs>.');
   return context;
}

export type TabsProps = Omit<
   JSX.HTMLAttributes<HTMLDivElement>,
   'className' | 'onChange' | 'id'
> & {
   className?: string;
   id?: string;
   value?: string;
   defaultValue?: string;
   onValueChange?: (value: string) => void;
};

export function Tabs({
   className,
   id,
   value,
   defaultValue = '',
   onValueChange,
   children,
   ...props
}: TabsProps) {
   const [internalValue, setInternalValue] = useState(defaultValue);
   const currentValue = value ?? internalValue;

   const setValue = (next: string) => {
      if (value === undefined) setInternalValue(next);
      onValueChange?.(next);
   };

   return (
      <TabsContext.Provider
         value={{
            value: currentValue,
            setValue,
            baseId: id,
         }}
      >
         <div
            data-slot="tabs"
            id={id}
            className={cn('flex flex-col gap-3', className)}
            {...withoutRef(props)}
         >
            {children}
         </div>
      </TabsContext.Provider>
   );
}

type ListProps = Omit<JSX.HTMLAttributes<HTMLDivElement>, 'className'> & {
   className?: string;
};

export function TabsList({ className, ...props }: ListProps) {
   return (
      <div
         data-slot="tabs-list"
         role="tablist"
         aria-orientation="horizontal"
         className={cn(
            'inline-flex h-9 w-fit items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground',
            className,
         )}
         {...withoutRef(props)}
      />
   );
}

type TriggerProps = Omit<
   JSX.ButtonHTMLAttributes<HTMLButtonElement>,
   'className' | 'type' | 'value'
> & {
   className?: string;
   value: string;
};

export function TabsTrigger({
   className,
   value,
   onClick,
   onKeyDown,
   children,
   ...props
}: TriggerProps) {
   const context = useTabsContext();
   const selected = context.value === value;
   const baseId = context.baseId;

   return (
      <button
         data-slot="tabs-trigger"
         type="button"
         role="tab"
         id={baseId ? `${baseId}-tab-${value}` : undefined}
         aria-controls={baseId ? `${baseId}-panel-${value}` : undefined}
         aria-selected={selected}
         data-state={selected ? 'active' : 'inactive'}
         tabIndex={selected || !context.value ? 0 : -1}
         onClick={(event) => {
            onClick?.(event);
            context.setValue(value);
         }}
         onKeyDown={(event) => {
            onKeyDown?.(event);
            if (event.defaultPrevented) return;

            const tabList = event.currentTarget.closest('[role="tablist"]');
            const tabs = Array.from(
               tabList?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ?? [],
            );
            const nextIndex = nextTabIndex(
               tabs.indexOf(event.currentTarget),
               event.key,
               tabs.length,
            );
            if (nextIndex === null) return;

            event.preventDefault();
            const nextTab = tabs[nextIndex];
            nextTab?.focus();
            nextTab?.click();
         }}
         className={cn(
            'inline-flex items-center justify-center rounded-md px-3 py-1 text-sm font-medium whitespace-nowrap transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm',
            className,
         )}
         {...withoutRef(props)}
      >
         {children}
      </button>
   );
}

type ContentProps = Omit<JSX.HTMLAttributes<HTMLDivElement>, 'className'> & {
   className?: string;
   value: string;
};

export function TabsContent({ className, value, children, ...props }: ContentProps) {
   const context = useTabsContext();
   const selected = context.value === value;
   const baseId = context.baseId;

   return (
      <div
         data-slot="tabs-content"
         role="tabpanel"
         id={baseId ? `${baseId}-panel-${value}` : undefined}
         aria-labelledby={baseId ? `${baseId}-tab-${value}` : undefined}
         hidden={!selected}
         tabIndex={0}
         className={cn('outline-none focus-visible:ring-2 focus-visible:ring-ring', className)}
         {...withoutRef(props)}
      >
         {children}
      </div>
   );
}
