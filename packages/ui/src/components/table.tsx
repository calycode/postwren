import type { JSX } from 'preact';

import { withoutRef } from '../lib/preact-compat';
import { cn } from '../lib/utils';

type TableProps = Omit<JSX.TableHTMLAttributes<HTMLTableElement>, 'className'> & {
   className?: string;
};

export function Table({ className, ...props }: TableProps) {
   return (
      <div
         data-slot="table-container"
         className="relative w-full overflow-x-auto"
      >
         <table
            data-slot="table"
            className={cn('w-full caption-bottom text-sm', className)}
            {...withoutRef(props)}
         />
      </div>
   );
}

type SectionProps = Omit<JSX.HTMLAttributes<HTMLTableSectionElement>, 'className'> & {
   className?: string;
};

export function TableHeader({ className, ...props }: SectionProps) {
   return (
      <thead
         data-slot="table-header"
         className={cn('[&_tr]:border-b', className)}
         {...withoutRef(props)}
      />
   );
}

export function TableBody({ className, ...props }: SectionProps) {
   return (
      <tbody
         data-slot="table-body"
         className={cn('[&_tr:last-child]:border-0', className)}
         {...withoutRef(props)}
      />
   );
}

export function TableFooter({ className, ...props }: SectionProps) {
   return (
      <tfoot
         data-slot="table-footer"
         className={cn('border-t bg-muted/50 font-medium [&>tr]:last:border-b-0', className)}
         {...withoutRef(props)}
      />
   );
}

type RowProps = Omit<JSX.HTMLAttributes<HTMLTableRowElement>, 'className'> & {
   className?: string;
};

export function TableRow({ className, ...props }: RowProps) {
   return (
      <tr
         data-slot="table-row"
         className={cn(
            'border-b border-border transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted',
            className,
         )}
         {...withoutRef(props)}
      />
   );
}

type HeadProps = Omit<JSX.ThHTMLAttributes<HTMLTableCellElement>, 'className'> & {
   className?: string;
};

export function TableHead({ className, ...props }: HeadProps) {
   return (
      <th
         data-slot="table-head"
         className={cn(
            'h-10 px-2 text-left align-middle text-xs font-medium whitespace-nowrap text-muted-foreground [&:has([role=checkbox])]:pr-0',
            className,
         )}
         {...withoutRef(props)}
      />
   );
}

type CellProps = Omit<JSX.TdHTMLAttributes<HTMLTableCellElement>, 'className'> & {
   className?: string;
};

export function TableCell({ className, ...props }: CellProps) {
   return (
      <td
         data-slot="table-cell"
         className={cn('p-2 align-middle [&:has([role=checkbox])]:pr-0', className)}
         {...withoutRef(props)}
      />
   );
}

type CaptionProps = Omit<JSX.HTMLAttributes<HTMLTableCaptionElement>, 'className'> & {
   className?: string;
};

export function TableCaption({ className, ...props }: CaptionProps) {
   return (
      <caption
         data-slot="table-caption"
         className={cn('mt-4 text-sm text-muted-foreground', className)}
         {...withoutRef(props)}
      />
   );
}
