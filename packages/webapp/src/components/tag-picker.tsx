import { useEffect, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Input, cn } from '@postwren/ui';
import { autocomplete as autocompleteTags, create as createTag } from '@/lib/api/tags';
import type { Tag } from '@/lib/api/types';
import { errorMessage } from '@/lib/form-errors';

export type TagPickerProps = {
   id: string;
   value: Tag[];
   onChange: (tags: Tag[]) => void;
   multiple?: boolean;
   disabled?: boolean;
   placeholder?: string;
   /** Offer to create the typed tag when it does not exist yet. */
   allowCreate?: boolean;
};

export function TagPicker({
   id,
   value,
   onChange,
   multiple = true,
   disabled = false,
   placeholder = 'Search tags…',
   allowCreate = true,
}: TagPickerProps) {
   const [query, setQuery] = useState('');
   const [options, setOptions] = useState<Tag[]>([]);
   const [open, setOpen] = useState(false);
   const [loading, setLoading] = useState(false);
   const [error, setError] = useState<string | null>(null);
   const [createError, setCreateError] = useState<string | null>(null);
   const [creating, setCreating] = useState(false);
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
   const trimmed = query.trim();
   const alreadyExists =
      trimmed.length === 0 ||
      value.some((tag) => tag.name.toLowerCase() === trimmed.toLowerCase()) ||
      options.some((tag) => tag.name.toLowerCase() === trimmed.toLowerCase());
   const creatable = allowCreate && !disabled && trimmed.length > 0 && !alreadyExists;

   function select(tag: Tag) {
      onChange(multiple ? [...value, tag] : [tag]);
      setQuery('');
      setOpen(false);
      setActiveIndex(-1);
      setCreateError(null);
      document.getElementById(id)?.focus();
   }

   async function createAndSelect() {
      if (!creatable || creating) return;

      setCreating(true);
      setCreateError(null);
      try {
         const tag = await createTag(trimmed.toLowerCase());
         select(tag);
      } catch (cause) {
         setCreateError(errorMessage(cause, 'Could not create the tag'));
      } finally {
         setCreating(false);
      }
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
         if (!open) return;
         event.preventDefault();
         if (active) select(active);
         else if (creatable) void createAndSelect();
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
                  setCreateError(null);
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
               ) : (
                  <>
                     {available.length === 0 && !creatable && (
                        <p className="px-3 py-2 text-sm text-muted-foreground">No tags found</p>
                     )}

                     {available.length > 0 && (
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
                                 className={cn(
                                    'flex cursor-pointer items-center justify-between rounded-md px-2 py-1.5 text-sm',
                                    index === activeIndex
                                       ? 'bg-accent text-accent-foreground'
                                       : 'hover:bg-accent hover:text-accent-foreground',
                                 )}
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

                     {creatable && (
                        <button
                           type="button"
                           aria-busy={creating}
                           className="flex w-full items-center gap-2 border-t border-border px-3 py-2 text-left text-sm outline-none hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent disabled:opacity-60"
                           disabled={creating}
                           onMouseDown={(event) => event.preventDefault()}
                           onClick={() => void createAndSelect()}
                        >
                           <Plus
                              className="size-4 text-muted-foreground"
                              aria-hidden="true"
                           />
                           {creating ? 'Creating…' : `Create tag “${trimmed}”`}
                        </button>
                     )}

                     {createError !== null && (
                        <p
                           role="alert"
                           className="border-t border-border px-3 py-2 text-xs text-destructive"
                        >
                           {createError}
                        </p>
                     )}
                  </>
               )}
            </div>
         )}
      </div>
   );
}
