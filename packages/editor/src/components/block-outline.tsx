import type { Block, Document } from '@postwren/email/ir';
import {
   Badge,
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuItem,
   DropdownMenuTrigger,
   cn,
} from '@postwren/ui';
import { ListTree } from 'lucide-react';
import { blockLabel } from '../lib/document-ops';
import { BlockIcon } from './block-icon';

type OutlineEntry = {
   id: string;
   type: Block['type'];
   label: string;
   depth: number;
};

function entriesFor(block: Block, depth: number, prefix: string): OutlineEntry[] {
   const entry: OutlineEntry = {
      id: block.id,
      type: block.type,
      label: `${prefix}${blockLabel(block)}`,
      depth,
   };

   if (block.type === 'columns') {
      return [
         entry,
         ...block.columns.flatMap((column, index) =>
            column.blocks.flatMap((child) =>
               entriesFor(child, depth + 1, `Column ${index + 1} · `),
            ),
         ),
      ];
   }

   if (block.type === 'section') {
      return [entry, ...block.children.flatMap((child) => entriesFor(child, depth + 1, ''))];
   }

   return [entry];
}

function outlineEntries(doc: Document): OutlineEntry[] {
   return doc.children.flatMap((block) => entriesFor(block, 0, ''));
}

export function BlockOutline({
   doc,
   selectedId,
   onSelect,
}: {
   doc: Document;
   selectedId: string | null;
   onSelect: (id: string) => void;
}) {
   const entries = outlineEntries(doc);

   return (
      <DropdownMenu>
         <DropdownMenuTrigger
            aria-label="Blocks"
            title="Jump to a block"
            className="h-8 px-2 text-xs"
         >
            <ListTree
               className="size-4"
               aria-hidden="true"
            />
            Blocks
            <Badge variant="secondary">{entries.length}</Badge>
         </DropdownMenuTrigger>
         <DropdownMenuContent className="right-auto left-0 max-h-96 w-64 overflow-y-auto">
            {entries.length === 0 ? (
               <p className="px-2 py-3 text-sm text-muted-foreground">No blocks yet</p>
            ) : (
               entries.map((entry) => (
                  <DropdownMenuItem
                     key={entry.id}
                     aria-current={entry.id === selectedId ? 'true' : undefined}
                     onSelect={() => onSelect(entry.id)}
                     className={cn(
                        'gap-2 px-2 py-1.5',
                        entry.depth > 0 && 'pl-6 text-xs text-muted-foreground',
                        entry.id === selectedId && 'bg-accent text-accent-foreground',
                     )}
                  >
                     <BlockIcon
                        type={entry.type}
                        className="size-4 shrink-0"
                     />
                     <span className="truncate">{entry.label}</span>
                  </DropdownMenuItem>
               ))
            )}
         </DropdownMenuContent>
      </DropdownMenu>
   );
}
