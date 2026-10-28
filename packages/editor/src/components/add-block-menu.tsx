import type { BlockType } from '@mailer/email/ir';
import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuItem,
   DropdownMenuTrigger,
} from '@mailer/ui';
import { Plus } from 'lucide-react';
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
         { type: 'divider', label: 'Divider' },
         { type: 'spacer', label: 'Spacer' },
      ],
   },
   {
      label: 'Layout',
      types: [{ type: 'columns', label: 'Columns' }],
   },
   {
      label: 'Social',
      types: [{ type: 'social', label: 'Social' }],
   },
];

export function AddBlockMenu({
   onAdd,
   className,
}: {
   onAdd: (type: BlockType) => void;
   className?: string;
}) {
   return (
      <DropdownMenu className={className}>
         <DropdownMenuTrigger
            aria-label="Add block"
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
         </DropdownMenuContent>
      </DropdownMenu>
   );
}
