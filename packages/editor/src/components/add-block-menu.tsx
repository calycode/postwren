import type { BlockType } from '@postwren/email/ir';
import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuItem,
   DropdownMenuTrigger,
} from '@postwren/ui';
import { Plus, Sparkles } from 'lucide-react';
import { BLOCK_PATTERNS } from '../lib/patterns';
import type { BlockPattern } from '../lib/patterns';
import { BlockIcon } from './block-icon';

const GROUPS: readonly {
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

export function AddBlockMenu({
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
   const insertionTitle =
      afterLabel !== undefined && afterLabel !== null
         ? `Adds after the selected block (${afterLabel})`
         : 'Adds at the end of the document';

   return (
      <DropdownMenu className={className}>
         <DropdownMenuTrigger
            aria-label="Add block"
            title={insertionTitle}
            className="h-8 px-2 text-xs"
         >
            <Plus
               className="size-4"
               aria-hidden="true"
            />
            Add block
         </DropdownMenuTrigger>
         <DropdownMenuContent className="right-auto left-0 max-h-96 w-56 overflow-y-auto">
            {GROUPS.map((group) => (
               <div key={group.label}>
                  <p className="px-2 pt-2 pb-1 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
                     {group.label}
                  </p>
                  {group.types.map((option) => (
                     <DropdownMenuItem
                        key={option.type}
                        onSelect={() => onAdd(option.type)}
                     >
                        <BlockIcon
                           type={option.type}
                           className="size-4 text-muted-foreground"
                        />
                        {option.label}
                     </DropdownMenuItem>
                  ))}
               </div>
            ))}
            <div>
               <p className="px-2 pt-2 pb-1 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
                  Patterns
               </p>
               {BLOCK_PATTERNS.map((pattern) => (
                  <DropdownMenuItem
                     key={pattern.id}
                     title={pattern.description}
                     onSelect={() => onAddPattern(pattern)}
                  >
                     <Sparkles
                        className="size-4 text-muted-foreground"
                        aria-hidden="true"
                     />
                     {pattern.label}
                  </DropdownMenuItem>
               ))}
            </div>
         </DropdownMenuContent>
      </DropdownMenu>
   );
}
