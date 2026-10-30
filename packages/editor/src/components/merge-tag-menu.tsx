import { useState } from 'preact/hooks';
import {
   Button,
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuItem,
   DropdownMenuSeparator,
   DropdownMenuTrigger,
   Input,
   Select,
   SelectContent,
   SelectItem,
   SelectTrigger,
   SelectValue,
} from '@mailer/ui';
import { Link2 } from 'lucide-react';
import { MERGE_TAGS } from '../lib/block-schema';
import { mergeTagInsertion, unsubscribeInsertion } from '../lib/controls';

type MergeTagMenuProps = {
   kind: 'text' | 'href';
   onInsert: (snippet: string) => void;
   ariaLabel: string;
};

type MetaScope = 'subscriber' | 'campaign';

const META_KEY = /^[a-z][a-z0-9_]{0,63}$/;

export function MergeTagMenu({ kind, onInsert, ariaLabel }: MergeTagMenuProps) {
   const [scope, setScope] = useState<MetaScope>('subscriber');
   const [key, setKey] = useState('');
   const validKey = META_KEY.test(key);

   function insertMeta(): void {
      if (!validKey) return;
      onInsert(mergeTagInsertion(`${scope}.meta.${key}`));
      setKey('');
   }

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
         <DropdownMenuContent className="max-h-80 w-72 overflow-y-auto">
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
            <DropdownMenuSeparator />
            <div className="grid gap-2 p-1">
               <span className="text-xs font-medium">Custom field</span>
               <div className="flex items-center gap-1">
                  <Select
                     value={scope}
                     onValueChange={(value) => {
                        if (value === 'subscriber' || value === 'campaign') setScope(value);
                     }}
                  >
                     <SelectTrigger
                        className="h-9 w-28"
                        aria-label="Custom field scope"
                     >
                        <SelectValue />
                     </SelectTrigger>
                     <SelectContent>
                        <SelectItem value="subscriber">Subscriber</SelectItem>
                        <SelectItem value="campaign">Campaign</SelectItem>
                     </SelectContent>
                  </Select>
                  <Input
                     value={key}
                     placeholder="plan"
                     aria-label="Custom field key"
                     autoComplete="off"
                     className="h-9 font-mono text-xs"
                     onInput={(event) => setKey(event.currentTarget.value)}
                     onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                           event.preventDefault();
                           insertMeta();
                        }
                     }}
                  />
               </div>
               <Button
                  type="button"
                  size="sm"
                  disabled={!validKey}
                  onClick={insertMeta}
               >
                  Insert custom field
               </Button>
               <p className="text-[10px] text-muted-foreground">
                  {`Uses {{ ${scope}.meta.${key.length > 0 ? key : 'key'} }}`}
               </p>
            </div>
         </DropdownMenuContent>
      </DropdownMenu>
   );
}
