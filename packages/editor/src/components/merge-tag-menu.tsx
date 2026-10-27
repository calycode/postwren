import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuItem,
   DropdownMenuSeparator,
   DropdownMenuTrigger,
} from '@mailer/ui';
import { Link2 } from 'lucide-react';
import { MERGE_TAGS } from '../lib/block-schema';
import { mergeTagInsertion, unsubscribeInsertion } from '../lib/controls';

type MergeTagMenuProps = {
   kind: 'text' | 'href';
   onInsert: (snippet: string) => void;
   ariaLabel: string;
};

export function MergeTagMenu({ kind, onInsert, ariaLabel }: MergeTagMenuProps) {
   return (
      <DropdownMenu className="shrink-0">
         <DropdownMenuTrigger
            aria-label={ariaLabel}
            title="Insert merge tag"
            className="h-9 px-2"
         >
            <span
               aria-hidden="true"
               className="font-mono text-xs"
            >
               {'{{ }}'}
            </span>
         </DropdownMenuTrigger>
         <DropdownMenuContent className="max-h-80 w-64 overflow-y-auto">
            {MERGE_TAGS.map((tag) => (
               <DropdownMenuItem
                  key={tag.path}
                  onSelect={() => onInsert(mergeTagInsertion(tag.path))}
               >
                  <span>{tag.label}</span>
                  <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                     {tag.path}
                  </span>
               </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onInsert(unsubscribeInsertion(kind))}>
               <Link2 aria-hidden="true" />
               <span>Unsubscribe link</span>
            </DropdownMenuItem>
         </DropdownMenuContent>
      </DropdownMenu>
   );
}
