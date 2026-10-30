import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { Input } from '@postwren/ui';
import { autocomplete as autocompleteTags } from '@/lib/api/tags';
import type { Tag } from '@/lib/api/types';
import { errorMessage } from '@/lib/form-errors';

export type TagPickerProps = {
   id: string;
   value: Tag[];
   onChange: (tags: Tag[]) => void;
   multiple?: boolean;
   disabled?: boolean;
   placeholder?: string;
};

export function TagPicker({
   id,
   value,
   onChange,
   multiple = true,
   disabled = false,
   placeholder = 'Search tags…',
}: TagPickerProps) {
   const [query, setQuery] = useState('');
   const [options, setOptions] = useState<Tag[]>([]);
   const [open, setOpen] = useState(false);
   const [loading, setLoading] = useState(false);
   const [error, setError] = useState<string | null>(null);
   const [activeIndex, setActiveIndex] = useState(-1);

   useEffect(() => {
      if (!open) return;

      let cancelled = false;
      setLoading(true);
      setError(null);

      const timer = window.setTimeout(() => {
         autocompleteTags(query)
            .then((results) => {
               if (cancelled) return;
               setOptions(results);
               setActiveIndex(-1);
            })
            .catch((cause: unknown) => {
               if (!cancelled) setError(errorMessage(cause, 'Could not load tags'));
            })
            .finally(() => {
               if (!cancelled) setLoading(false);
            });
      }, 200);

      return () => {
         cancelled = true;
         window.clearTimeout(timer);
      };
   }, [open, query]);

   const selectedIds = new Set(value.map((tag) => tag.id));
   const available = multiple ? options.filter((tag) => !selectedIds.has(tag.id)) : options;
   const active = activeIndex >= 0 ? available[activeIndex] : undefined;

   function select(tag: Tag) {
      onChange(multiple ? [...value, tag] : [tag]);
      setQuery('');
      setOpen(false);
      setActiveIndex(-1);
      document.getElementById(id)?.focus();
   }

   function remove(tag: Tag) {
      onChange(value.filter((item) => item.id !== tag.id));
   }

   function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'ArrowDown') {
         event.preventDefault();
         setOpen(true);
         setActiveIndex((index) => Math.min(index + 1, available.length - 1));
         return;
      }

      if (event.key === 'ArrowUp') {
         event.preventDefault();
         setActiveIndex((index) => Math.max(index - 1, 0));
         return;
      }

      if (event.key === 'Enter') {
         if (open && active) {
            event.preventDefault();
            select(active);
         }
         return;
      }

      if (event.key === 'Escape') {
         setOpen(false);
         setActiveIndex(-1);
         return;
      }

      if (event.key === 'Backspace' && query.length === 0 && multiple && value.length > 0) {
         const last = value[value.length - 1];
         if (last) onChange(value.slice(0, -1));
      }
   }

   return (
      <div className="relative">
         <div className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border border-input bg-background px-2 py-1.5 shadow-xs focus-within:border-ring focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background">
            {value.map((tag) => (
               <span
                  key={tag.id}
                  className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground"
               >
                  {tag.name}
                  <button
                     type="button"
                     className="rounded-full p-0.5 outline-none hover:bg-background/60 focus-visible:ring-2 focus-visible:ring-ring"
                     aria-label={`Remove ${tag.name}`}
                     disabled={disabled}
                     onClick={() => remove(tag)}
                  >
                     <X
                        className="size-3"
                        aria-hidden="true"
                     />
                  </button>
               </span>
            ))}
            <Input
               id={id}
               role="combobox"
               aria-expanded={open}
               aria-controls={`${id}-listbox`}
               aria-autocomplete="list"
               aria-activedescendant={active ? `${id}-option-${active.id}` : undefined}
               autoComplete="off"
               disabled={disabled}
               value={query}
               placeholder={value.length === 0 ? placeholder : ''}
               className="h-7 min-w-24 flex-1 border-0 bg-transparent px-1 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
               onFocus={() => setOpen(true)}
               onBlur={() => setOpen(false)}
               onInput={(event) => {
                  setQuery(event.currentTarget.value);
                  setOpen(true);
               }}
               onKeyDown={handleKeyDown}
            />
         </div>

         {open && (
            <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-md">
               {loading ? (
                  <p className="px-3 py-2 text-sm text-muted-foreground">Searching…</p>
               ) : error ? (
                  <p
                     role="alert"
                     className="px-3 py-2 text-sm text-destructive"
                  >
                     {error}
                  </p>
               ) : available.length === 0 ? (
                  <p className="px-3 py-2 text-sm text-muted-foreground">No tags found</p>
               ) : (
                  <ul
                     id={`${id}-listbox`}
                     role="listbox"
                     className="max-h-56 overflow-y-auto p-1"
                  >
                     {available.map((tag, index) => (
                        <li
                           key={tag.id}
                           id={`${id}-option-${tag.id}`}
                           role="option"
                           aria-selected={index === activeIndex}
                           className={`flex cursor-pointer items-center justify-between rounded-md px-2 py-1.5 text-sm ${
                              index === activeIndex
                                 ? 'bg-accent text-accent-foreground'
                                 : 'hover:bg-accent hover:text-accent-foreground'
                           }`}
                           onMouseDown={(event) => event.preventDefault()}
                           onClick={() => select(tag)}
                        >
                           <span>{tag.name}</span>
                           <span className="text-xs text-muted-foreground">
                              {tag.subscriber_count}
                           </span>
                        </li>
                     ))}
                  </ul>
               )}
            </div>
         )}
      </div>
   );
}
