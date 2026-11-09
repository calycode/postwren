import type { ComponentChildren } from 'preact';
import {
   Alert,
   AlertDescription,
   AlertTitle,
   Button,
   Checkbox,
   EmptyState,
   Skeleton,
   Table,
   TableBody,
   TableCell,
   TableHead,
   TableHeader,
   TableRow,
   cn,
} from '@postwren/ui';

export type DataTableColumn<Row> = {
   id: string;
   header: ComponentChildren;
   cell: (row: Row) => ComponentChildren;
   className?: string;
   headerClassName?: string;
};

export type DataTableEmpty = {
   title: ComponentChildren;
   description?: ComponentChildren;
   action?: ComponentChildren;
   icon?: ComponentChildren;
};

type DataTableProps<Row> = {
   columns: readonly DataTableColumn<Row>[];
   rows: readonly Row[];
   rowKey: (row: Row) => string;
   loading?: boolean;
   error?: string | null;
   onRetry?: () => void;
   empty?: DataTableEmpty;
   skeletonRows?: number;
   caption?: string;
   selectable?: boolean;
   selectedKeys?: ReadonlySet<string>;
   onSelectionChange?: (keys: Set<string>) => void;
   /** Double-clicking anywhere on a row is a shortcut for its primary action. */
   onRowDoubleClick?: (row: Row) => void;
   /** Single click on a row, ignoring clicks on buttons, links and inputs. */
   onRowClick?: (row: Row) => void;
   /** Marks the row that owns the open detail view without selecting it. */
   highlightedKey?: string | null;
};

export function DataTable<Row>({
   columns,
   rows,
   rowKey,
   loading = false,
   error,
   onRetry,
   empty,
   skeletonRows = 5,
   caption,
   selectable = false,
   selectedKeys,
   onSelectionChange,
   onRowDoubleClick,
   onRowClick,
   highlightedKey,
}: DataTableProps<Row>) {
   if (error) {
      return (
         <Alert variant="destructive">
            <AlertTitle>Could not load this list</AlertTitle>
            <AlertDescription>
               <p>{error}</p>
               {onRetry !== undefined && (
                  <Button
                     variant="outline"
                     size="sm"
                     className="mt-3"
                     onClick={onRetry}
                  >
                     Try again
                  </Button>
               )}
            </AlertDescription>
         </Alert>
      );
   }

   if (!loading && rows.length === 0 && empty !== undefined) {
      return (
         <EmptyState
            title={empty.title}
            description={empty.description}
            action={empty.action}
            icon={empty.icon}
         />
      );
   }

   const pageKeys = rows.map(rowKey);
   const selected = selectedKeys ?? new Set<string>();
   const allSelected = pageKeys.length > 0 && pageKeys.every((key) => selected.has(key));
   const someSelected = pageKeys.some((key) => selected.has(key));

   function toggleAll() {
      if (onSelectionChange === undefined) return;
      const next = new Set(selected);
      for (const key of pageKeys) {
         if (allSelected) next.delete(key);
         else next.add(key);
      }
      onSelectionChange(next);
   }

   function toggleRow(key: string) {
      if (onSelectionChange === undefined) return;
      const next = new Set(selected);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      onSelectionChange(next);
   }

   return (
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
         <Table>
            {caption !== undefined && <caption className="sr-only">{caption}</caption>}
            <TableHeader>
               <TableRow>
                  {selectable && (
                     <TableHead className="w-10">
                        <Checkbox
                           aria-label={allSelected ? 'Clear this page' : 'Select this page'}
                           checked={allSelected}
                           indeterminate={!allSelected && someSelected}
                           disabled={loading || rows.length === 0}
                           onChange={toggleAll}
                        />
                     </TableHead>
                  )}
                  {columns.map((column) => (
                     <TableHead
                        key={column.id}
                        className={column.headerClassName}
                     >
                        {column.header}
                     </TableHead>
                  ))}
               </TableRow>
            </TableHeader>
            <TableBody>
               {loading && rows.length === 0
                  ? Array.from({ length: skeletonRows }, (_, rowIndex) => (
                       <TableRow key={`skeleton-${rowIndex}`}>
                          {selectable && (
                             <TableCell>
                                <Skeleton className="size-4" />
                             </TableCell>
                          )}
                          {columns.map((column) => (
                             <TableCell key={column.id}>
                                <Skeleton className="h-4 w-full max-w-40" />
                             </TableCell>
                          ))}
                       </TableRow>
                    ))
                  : rows.map((row) => {
                       const key = rowKey(row);
                       const isSelected = selected.has(key);
                       const isHighlighted = highlightedKey === key;

                       return (
                          <TableRow
                             key={key}
                             data-row-key={key}
                             data-state={isSelected ? 'selected' : undefined}
                             aria-selected={isHighlighted || undefined}
                             className={cn(
                                (onRowDoubleClick !== undefined || onRowClick !== undefined) &&
                                   'cursor-pointer select-none',
                                isHighlighted && 'bg-accent/55 hover:bg-accent/60',
                             )}
                             onClick={
                                onRowClick === undefined
                                   ? undefined
                                   : (event) => {
                                        const target = event.target;
                                        if (
                                           target instanceof Element &&
                                           target.closest('button, a, input, label, select') !==
                                              null
                                        ) {
                                           return;
                                        }
                                        onRowClick(row);
                                     }
                             }
                             onDblClick={
                                onRowDoubleClick === undefined
                                   ? undefined
                                   : () => onRowDoubleClick(row)
                             }
                          >
                             {selectable && (
                                <TableCell>
                                   <Checkbox
                                      aria-label={`Select ${key}`}
                                      checked={isSelected}
                                      onChange={() => toggleRow(key)}
                                   />
                                </TableCell>
                             )}
                             {columns.map((column) => (
                                <TableCell
                                   key={column.id}
                                   className={column.className}
                                >
                                   {column.cell(row)}
                                </TableCell>
                             ))}
                          </TableRow>
                       );
                    })}
            </TableBody>
         </Table>
      </div>
   );
}
