import { useState } from 'react';
import type { Block, Document } from '@postwren/email/ir';
import { cn } from '@postwren/ui';
import { GripVertical, MessageSquare } from 'lucide-react';
import { blockLabel } from '../lib/document-ops';
import type { DropPosition } from '../lib/document-ops';
import { BlockIcon } from './block-icon';

export type OutlineEntry = {
   id: string;
   type: Block['type'];
   label: string;
   depth: number;
   /** Identifies the sibling list. Only entries with the same key can be reordered. */
   groupKey: string;
   /** Optional small count, used by repeat previews. */
   badge?: string;
};

function entriesFor(block: Block, depth: number, prefix: string, groupKey: string): OutlineEntry[] {
   const entry: OutlineEntry = {
      id: block.id,
      type: block.type,
      label: `${prefix}${blockLabel(block)}`,
      depth,
      groupKey,
      ...(block.type === 'repeat' && (block.sample?.length ?? 0) > 0
         ? {
              badge: `${block.sample?.length} sample${block.sample?.length === 1 ? '' : 's'}`,
           }
         : {}),
   };

   if (block.type === 'columns') {
      return [
         entry,
         ...block.columns.flatMap((column, index) =>
            column.blocks.flatMap((child) =>
               entriesFor(
                  child,
                  depth + 1,
                  `Column ${index + 1} · `,
                  `column:${block.id}:${index}`,
               ),
            ),
         ),
      ];
   }

   if (block.type === 'section' || block.type === 'repeat') {
      return [
         entry,
         ...block.children.flatMap((child) =>
            entriesFor(child, depth + 1, '', `${block.type}:${block.id}`),
         ),
      ];
   }

   return [entry];
}

export function outlineEntries(doc: Document): OutlineEntry[] {
   return doc.children.flatMap((block) => entriesFor(block, 0, '', 'root'));
}

export function BlockTree({
   doc,
   selectedId,
   onSelect,
   onMove,
   commentCounts = {},
}: {
   doc: Document;
   selectedId: string | null;
   onSelect: (id: string) => void;
   onMove: (sourceId: string, targetId: string, position: DropPosition) => void;
   commentCounts?: Readonly<Record<string, number>>;
}) {
   const entries = outlineEntries(doc);
   const [draggingId, setDraggingId] = useState<string | null>(null);
   const [dropTarget, setDropTarget] = useState<{
      id: string;
      position: DropPosition;
   } | null>(null);

   if (entries.length === 0) {
      return (
         <p className="rounded-md border border-dashed border-border px-3 py-4 text-xs text-muted-foreground">
            No blocks yet. Add one from above and it will appear here.
         </p>
      );
   }

   return (
      <ul
         role="tree"
         aria-label="Document blocks"
         className="grid gap-0.5"
      >
         {entries.map((entry) => {
            const selected = entry.id === selectedId;
            const dragSource = entries.find((candidate) => candidate.id === draggingId);
            const canDrop =
               draggingId !== null &&
               draggingId !== entry.id &&
               dragSource !== undefined &&
               dragSource.groupKey === entry.groupKey;
            const dropping = canDrop && dropTarget?.id === entry.id ? dropTarget.position : null;

            return (
               <li
                  key={entry.id}
                  role="treeitem"
                  aria-selected={selected}
                  aria-level={entry.depth + 1}
               >
                  <div
                     role="button"
                     tabIndex={0}
                     draggable
                     aria-label={`${entry.label}. Drag to reorder.`}
                     onClick={() => onSelect(entry.id)}
                     onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                           event.preventDefault();
                           onSelect(entry.id);
                        }
                     }}
                     onDragStart={(event) => {
                        setDraggingId(entry.id);
                        if (event.dataTransfer) {
                           event.dataTransfer.effectAllowed = 'move';
                           event.dataTransfer.setData('text/plain', entry.id);
                        }
                     }}
                     onDragEnd={() => {
                        setDraggingId(null);
                        setDropTarget(null);
                     }}
                     onDragOver={(event) => {
                        if (!canDrop) return;
                        event.preventDefault();
                        if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
                        const rect = event.currentTarget.getBoundingClientRect();
                        const position: DropPosition =
                           event.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
                        setDropTarget({ id: entry.id, position });
                     }}
                     onDragLeave={() => {
                        setDropTarget((current) => (current?.id === entry.id ? null : current));
                     }}
                     onDrop={(event) => {
                        event.preventDefault();
                        const sourceId = event.dataTransfer?.getData('text/plain') ?? draggingId;
                        if (sourceId && sourceId !== entry.id && canDrop) {
                           const rect = event.currentTarget.getBoundingClientRect();
                           const position: DropPosition =
                              event.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
                           onMove(sourceId, entry.id, position);
                        }
                        setDraggingId(null);
                        setDropTarget(null);
                     }}
                     className={cn(
                        'group flex w-full cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-1.5 text-left text-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
                        selected
                           ? 'bg-accent text-accent-foreground'
                           : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
                        draggingId === entry.id && 'opacity-40',
                        dropping === 'before' && 'shadow-[inset_0_2px_0_0_var(--ring)]',
                        dropping === 'after' && 'shadow-[inset_0_-2px_0_0_var(--ring)]',
                     )}
                     style={{ paddingLeft: 6 + entry.depth * 12 }}
                  >
                     <GripVertical
                        className="size-3.5 shrink-0 cursor-grab text-muted-foreground/50 group-hover:text-muted-foreground"
                        aria-hidden="true"
                     />
                     <BlockIcon
                        type={entry.type}
                        className="size-3.5 shrink-0"
                     />
                     <span className="min-w-0 flex-1 truncate">{entry.label}</span>
                     {entry.badge !== undefined && (
                        <span className="shrink-0 text-[10px] text-muted-foreground">
                           {entry.badge}
                        </span>
                     )}
                     {(commentCounts[entry.id] ?? 0) > 0 && (
                        <span
                           className="inline-flex shrink-0 items-center gap-0.5 text-[10px] text-warning"
                           title={`${commentCounts[entry.id]} open note${commentCounts[entry.id] === 1 ? '' : 's'}`}
                        >
                           <MessageSquare
                              className="size-3"
                              aria-hidden="true"
                           />
                           {commentCounts[entry.id]}
                        </span>
                     )}
                  </div>
               </li>
            );
         })}
      </ul>
   );
}
