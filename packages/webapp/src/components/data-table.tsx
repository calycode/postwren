import type { ComponentChildren } from 'preact';
import {
   Alert,
   AlertDescription,
   AlertTitle,
   Button,
   EmptyState,
   Skeleton,
   Table,
   TableBody,
   TableCell,
   TableHead,
   TableHeader,
   TableRow,
} from '@mailer/ui';

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

   return (
      <Table>
         {caption !== undefined && <caption className="sr-only">{caption}</caption>}
         <TableHeader>
            <TableRow>
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
                       {columns.map((column) => (
                          <TableCell key={column.id}>
                             <Skeleton className="h-4 w-full max-w-40" />
                          </TableCell>
                       ))}
                    </TableRow>
                 ))
               : rows.map((row) => (
                    <TableRow key={rowKey(row)}>
                       {columns.map((column) => (
                          <TableCell
                             key={column.id}
                             className={column.className}
                          >
                             {column.cell(row)}
                          </TableCell>
                       ))}
                    </TableRow>
                 ))}
         </TableBody>
      </Table>
   );
}
