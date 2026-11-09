import { useState } from 'react';
import type { Block, BlockType } from '@postwren/email/ir';
import { Input, cn } from '@postwren/ui';
import { Bookmark, Info, LayoutTemplate, Search, Trash2 } from 'lucide-react';
import { BLOCK_PATTERNS } from '../lib/patterns';
import type { BlockPattern } from '../lib/patterns';
import { BlockIcon } from './block-icon';

export type SavedBlockSummary = {
   id: string;
   name: string;
   block: Block;
};

export const BLOCK_GROUPS: readonly {
   label: string;
   types: readonly { type: BlockType; label: string }[];
}[] = [
   {
      label: 'Text',
      types: [
         { type: 'heading', label: 'Heading' },
         { type: 'text', label: 'Text' },
         { type: 'markdown', label: 'Markdown' },
         { type: 'list', label: 'List' },
         { type: 'quote', label: 'Quote' },
         { type: 'code', label: 'Code' },
         { type: 'link', label: 'Link' },
      ],
   },
   {
      label: 'Action',
      types: [{ type: 'button', label: 'Button' }],
   },
   {
      label: 'Media',
      types: [
         { type: 'image', label: 'Image' },
         { type: 'avatar', label: 'Avatar' },
         { type: 'gallery', label: 'Gallery' },
         { type: 'divider', label: 'Divider' },
         { type: 'spacer', label: 'Spacer' },
      ],
   },
   {
      label: 'Layout',
      types: [
         { type: 'section', label: 'Section' },
         { type: 'columns', label: 'Columns' },
         { type: 'repeat', label: 'Repeat' },
         { type: 'table', label: 'Table' },
      ],
   },
   {
      label: 'Social',
      types: [{ type: 'social', label: 'Social' }],
   },
];

export type LibraryDrag =
   | { kind: 'type'; type: BlockType }
   | { kind: 'block'; block: Block }
   | { kind: 'pattern'; pattern: BlockPattern };

export function BlockLibrary({
   onAdd,
   onAddPattern,
   afterLabel,
   savedBlocks = [],
   onAddSavedBlock,
   onDeleteSavedBlock,
   onDragItemStart,
   onDragItemEnd,
   hint,
   className,
}: {
   onAdd: (type: BlockType) => void;
   onAddPattern: (pattern: BlockPattern) => void;
   /** Label of the selected block; new blocks are inserted right after it. */
   afterLabel?: string | null;
   savedBlocks?: readonly SavedBlockSummary[];
   onAddSavedBlock?: (block: Block) => void;
   onDeleteSavedBlock?: (id: string) => void;
   /** Starts a cross-panel drag into the email canvas. */
   onDragItemStart?: (payload: LibraryDrag) => void;
   onDragItemEnd?: () => void;
   /** Overrides the placement hint, for container selections. */
   hint?: string;
   className?: string;
}) {
   const [query, setQuery] = useState('');
   const needle = query.trim().toLowerCase();

   const groups = BLOCK_GROUPS.map((group) => ({
      ...group,
      types: group.types.filter((option) => option.label.toLowerCase().includes(needle)),
   })).filter((group) => group.types.length > 0);

   const patterns = BLOCK_PATTERNS.filter(
      (pattern) =>
         pattern.label.toLowerCase().includes(needle) ||
         pattern.description.toLowerCase().includes(needle),
   );

   const visibleSavedBlocks = savedBlocks.filter((item) =>
      item.name.toLowerCase().includes(needle),
   );

   const insertionHint =
      hint ??
      (afterLabel !== undefined && afterLabel !== null
         ? `New blocks are added after ${afterLabel}.`
         : 'New blocks are added at the end of the email.');

   const noResults =
      needle.length > 0 &&
      groups.length === 0 &&
      patterns.length === 0 &&
      visibleSavedBlocks.length === 0;

   return (
      <div className={cn('grid gap-3', className)}>
         <div className="flex items-center gap-2">
            <div className="relative min-w-0 flex-1">
               <Search
                  className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
               />
               <Input
                  aria-label="Search blocks"
                  value={query}
                  placeholder="Find a block"
                  className="h-8 pl-8 text-xs"
                  onInput={(event) => setQuery(event.currentTarget.value)}
               />
            </div>
            <span
               role="img"
               aria-label={insertionHint}
               title={insertionHint}
               className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            >
               <Info
                  className="size-3.5"
                  aria-hidden="true"
               />
            </span>
         </div>

         {noResults && (
            <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
               No blocks match "{query.trim()}".
            </p>
         )}

         {visibleSavedBlocks.length > 0 && onAddSavedBlock !== undefined && (
            <section className="grid gap-1.5">
               <h3 className="text-[10px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
                  Your blocks
               </h3>
               <div className="grid gap-1">
                  {visibleSavedBlocks.map((item) => (
                     <div
                        key={item.id}
                        className="flex items-center gap-1 rounded-md border border-border bg-background"
                     >
                        <button
                           type="button"
                           draggable={onDragItemStart !== undefined}
                           onClick={() => onAddSavedBlock(item.block)}
                           onDragStart={(event) => {
                              if (onDragItemStart === undefined) {
                                 event.preventDefault();
                                 return;
                              }
                              event.dataTransfer?.setData(
                                 'application/x-postwren-block',
                                 'saved-block',
                              );
                              if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy';
                              onDragItemStart({ kind: 'block', block: item.block });
                           }}
                           onDragEnd={() => onDragItemEnd?.()}
                           className="flex min-w-0 flex-1 cursor-grab items-center gap-1.5 px-2 py-1.5 text-left text-xs font-medium outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
                        >
                           <BlockIcon
                              type={item.block.type}
                              className="size-3.5 shrink-0 text-muted-foreground"
                           />
                           <Bookmark
                              className="size-3 shrink-0 text-ochre"
                              aria-hidden="true"
                           />
                           <span className="truncate">{item.name}</span>
                        </button>
                        {onDeleteSavedBlock !== undefined && (
                           <button
                              type="button"
                              aria-label={`Delete saved block ${item.name}`}
                              title="Delete saved block"
                              onClick={() => onDeleteSavedBlock(item.id)}
                              className="mr-1 inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring"
                           >
                              <Trash2
                                 className="size-3.5"
                                 aria-hidden="true"
                              />
                           </button>
                        )}
                     </div>
                  ))}
               </div>
            </section>
         )}

         {groups.map((group) => (
            <section
               key={group.label}
               className="grid gap-1.5"
            >
               <h3 className="text-[10px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
                  {group.label}
               </h3>
               <div className="grid grid-cols-2 gap-1.5">
                  {group.types.map((option) => (
                     <button
                        key={option.type}
                        type="button"
                        draggable={onDragItemStart !== undefined}
                        onClick={() => onAdd(option.type)}
                        onDragStart={(event) => {
                           if (onDragItemStart === undefined) {
                              event.preventDefault();
                              return;
                           }
                           event.dataTransfer?.setData('application/x-postwren-block', option.type);
                           if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy';
                           onDragItemStart({ kind: 'type', type: option.type });
                        }}
                        onDragEnd={() => onDragItemEnd?.()}
                        className="flex cursor-grab items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1.5 text-left text-xs font-medium outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
                     >
                        <BlockIcon
                           type={option.type}
                           className="size-3.5 shrink-0 text-muted-foreground"
                        />
                        <span className="truncate">{option.label}</span>
                     </button>
                  ))}
               </div>
            </section>
         ))}

         {patterns.length > 0 && (
            <section className="grid gap-1.5">
               <h3 className="text-[10px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
                  Patterns
               </h3>
               <div className="grid gap-1">
                  {patterns.map((pattern) => (
                     <button
                        key={pattern.id}
                        type="button"
                        title={pattern.description}
                        draggable={onDragItemStart !== undefined}
                        onClick={() => onAddPattern(pattern)}
                        onDragStart={(event) => {
                           if (onDragItemStart === undefined) {
                              event.preventDefault();
                              return;
                           }
                           event.dataTransfer?.setData('application/x-postwren-block', pattern.id);
                           if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy';
                           onDragItemStart({ kind: 'pattern', pattern });
                        }}
                        onDragEnd={() => onDragItemEnd?.()}
                        className="flex cursor-grab items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-xs font-medium outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
                     >
                        <LayoutTemplate
                           className="size-3.5 shrink-0 text-muted-foreground"
                           aria-hidden="true"
                        />
                        <span className="truncate">{pattern.label}</span>
                     </button>
                  ))}
               </div>
            </section>
         )}
      </div>
   );
}
