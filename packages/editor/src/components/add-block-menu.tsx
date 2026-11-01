import type { BlockType } from '@postwren/email/ir';
import { cn } from '@postwren/ui';
import { Sparkles } from 'lucide-react';
import { BLOCK_PATTERNS } from '../lib/patterns';
import type { BlockPattern } from '../lib/patterns';
import { BlockIcon } from './block-icon';

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
         { type: 'table', label: 'Table' },
      ],
   },
   {
      label: 'Social',
      types: [{ type: 'social', label: 'Social' }],
   },
];

export function BlockLibrary({
   onAdd,
   onAddPattern,
   afterLabel,
   className,
}: {
   onAdd: (type: BlockType) => void;
   onAddPattern: (pattern: BlockPattern) => void;
   /** Label of the selected block; new blocks are inserted right after it. */
   afterLabel?: string | null;
   className?: string;
}) {
   const insertionHint =
      afterLabel !== undefined && afterLabel !== null
         ? `New blocks are added after ${afterLabel}.`
         : 'New blocks are added at the end of the email.';

   return (
      <div className={cn('grid gap-3', className)}>
         <p className="text-[11px] leading-snug text-muted-foreground">{insertionHint}</p>

         {BLOCK_GROUPS.map((group) => (
            <section
               key={group.label}
               className="grid gap-1.5"
            >
               <h3 className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
                  {group.label}
               </h3>
               <div className="grid grid-cols-2 gap-1.5">
                  {group.types.map((option) => (
                     <button
                        key={option.type}
                        type="button"
                        onClick={() => onAdd(option.type)}
                        className="flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1.5 text-left text-xs font-medium outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring"
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

         <section className="grid gap-1.5">
            <h3 className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
               Patterns
            </h3>
            <div className="grid gap-1">
               {BLOCK_PATTERNS.map((pattern) => (
                  <button
                     key={pattern.id}
                     type="button"
                     title={pattern.description}
                     onClick={() => onAddPattern(pattern)}
                     className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-xs font-medium outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring"
                  >
                     <Sparkles
                        className="size-3.5 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                     />
                     <span className="truncate">{pattern.label}</span>
                  </button>
               ))}
            </div>
         </section>
      </div>
   );
}
