import { useRef, useState } from 'react';
import type { RefObject } from 'react';
import type {
   Block,
   BlockType,
   Column,
   ColumnsBlock,
   Document,
   DocumentSettings,
   SocialBlock,
   SocialLink,
   SocialNetwork,
   Spacing,
} from '@mailer/email/ir';
import { createBlock } from '@mailer/email/ir';
import {
   Badge,
   Button,
   Checkbox,
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuItem,
   DropdownMenuTrigger,
   Field,
   Input,
   Label,
   Textarea,
} from '@mailer/ui';
import { Check, Copy, Plus, Trash, X } from 'lucide-react';
import {
   ALIGN_OPTIONS,
   BLOCK_FIELDS,
   BLOCK_TYPE_OPTIONS,
   FONT_FAMILY_OPTIONS,
   SOCIAL_NETWORK_OPTIONS,
   type FieldSpec,
} from '../lib/block-schema';
import {
   clampNumber,
   distributeColumnWidths,
   hrefIssue,
   imageSrcIssue,
   insertAtCaret,
   isHttpsUrlValue,
} from '../lib/controls';
import {
   blockLabel,
   findBlock,
   normaliseColumns,
   removeBlock,
   updateBlock,
} from '../lib/document-ops';
import { HexInput, NumberInput, OptionSelect, SpacingEditor } from './field-controls';
import { MergeTagMenu } from './merge-tag-menu';

const TEXTAREA_CLASS =
   'flex min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-xs transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/30';

const MERGEABLE_FIELDS: Partial<Record<BlockType, readonly string[]>> = {
   heading: ['text'],
   text: ['text'],
   button: ['text', 'href'],
   image: ['alt', 'href'],
   list: ['items'],
   quote: ['text', 'attribution'],
   code: ['text'],
   link: ['text', 'href'],
};

type PropertyPanelProps = {
   doc: Document;
   selectedId: string | null;
   onSelect: (id: string) => void;
   onChange: (next: Document) => void;
};

export function PropertyPanel({ doc, selectedId, onSelect, onChange }: PropertyPanelProps) {
   const block = selectedId ? findBlock(doc, selectedId) : null;

   return (
      <div className="grid gap-5 p-4">
         <div className="grid gap-1">
            <h2 className="font-heading text-sm font-semibold text-foreground">Properties</h2>
            <p className="text-xs text-muted-foreground">
               {block ? blockLabel(block) : 'Nothing selected'}
            </p>
         </div>

         {block ? (
            <BlockProperties
               doc={doc}
               block={block}
               onChange={onChange}
               onSelect={onSelect}
            />
         ) : (
            <div className="grid gap-3">
               <p className="rounded-md border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
                  Select a block in the canvas to edit it.
               </p>
               <DocumentSummary doc={doc} />
            </div>
         )}
      </div>
   );
}

function DocumentSummary({ doc }: { doc: Document }) {
   const font =
      FONT_FAMILY_OPTIONS.find((option) => option.value === doc.settings.fontFamily)?.label ??
      doc.settings.fontFamily;

   return (
      <dl className="grid gap-1.5 rounded-md border border-border px-3 py-2 text-xs">
         <div className="flex items-baseline justify-between gap-2">
            <dt className="text-muted-foreground">Width</dt>
            <dd className="font-medium">{doc.settings.width}px</dd>
         </div>
         <div className="flex items-baseline justify-between gap-2">
            <dt className="text-muted-foreground">Font</dt>
            <dd className="font-medium">{font}</dd>
         </div>
         <div className="flex items-baseline justify-between gap-2">
            <dt className="shrink-0 text-muted-foreground">Preheader</dt>
            <dd
               className="truncate text-right font-medium"
               title={doc.preheader ?? ''}
            >
               {doc.preheader && doc.preheader.length > 0 ? doc.preheader : 'None'}
            </dd>
         </div>
      </dl>
   );
}

function setKey(patch: (next: Partial<Block>) => void, key: string, value: unknown) {
   patch({ [key]: value } as unknown as Partial<Block>);
}

function BlockProperties({
   doc,
   block,
   onChange,
   onSelect,
}: {
   doc: Document;
   block: Block;
   onChange: (next: Document) => void;
   onSelect: (id: string) => void;
}) {
   const patch = (next: Partial<Block>) => onChange(updateBlock(doc, block.id, next));
   const textRef = useRef<HTMLTextAreaElement>(null);

   return (
      <div className="grid gap-4">
         <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{block.type}</Badge>
            <BlockIdField id={block.id} />
         </div>

         {BLOCK_FIELDS[block.type].map((spec) => (
            <SchemaField
               key={spec.key}
               spec={spec}
               block={block}
               settings={doc.settings}
               patch={patch}
               textareaRef={spec.key === 'text' && block.type === 'text' ? textRef : undefined}
            />
         ))}

         {block.type === 'image' && (
            <div className="grid gap-1">
               <Label>Preview</Label>
               {isHttpsUrlValue(block.src) ? (
                  <img
                     src={block.src}
                     alt={block.alt}
                     className="max-h-44 w-full rounded-md border border-border bg-muted object-contain"
                  />
               ) : (
                  <div className="rounded-md border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
                     Paste an https image URL to see a preview
                  </div>
               )}
            </div>
         )}

         {block.type === 'columns' && (
            <ColumnsEditor
               doc={doc}
               block={block}
               onChange={onChange}
               onSelect={onSelect}
            />
         )}

         {block.type === 'social' && (
            <SocialEditor
               doc={doc}
               block={block}
               onChange={onChange}
            />
         )}
      </div>
   );
}

function BlockIdField({ id }: { id: string }) {
   const [copied, setCopied] = useState(false);

   const copy = () => {
      if (!navigator.clipboard) return;
      void navigator.clipboard
         .writeText(id)
         .then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
         })
         .catch(() => setCopied(false));
   };

   return (
      <div className="grid w-full gap-1">
         <Label
            htmlFor={`block-id-${id}`}
            className="text-xs text-muted-foreground"
         >
            Block id (analytics key)
         </Label>
         <div className="flex gap-1">
            <Input
               id={`block-id-${id}`}
               value={id}
               readOnly
               aria-label="Block id"
               className="font-mono text-xs"
            />
            <Button
               size="icon"
               variant="outline"
               aria-label="Copy block id"
               onClick={copy}
               className="shrink-0"
            >
               {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            </Button>
         </div>
         <p className="text-xs text-muted-foreground">Used as the click analytics key.</p>
      </div>
   );
}

type SchemaFieldProps = {
   spec: FieldSpec;
   block: Block;
   settings: DocumentSettings;
   patch: (next: Partial<Block>) => void;
   textareaRef?: RefObject<HTMLTextAreaElement>;
};

function SchemaField({ spec, block, settings, patch, textareaRef }: SchemaFieldProps) {
   const values = block as unknown as Record<string, unknown>;
   const raw = values[spec.key];
   const id = `prop-${block.id}-${spec.key}`;
   const stringValue = typeof raw === 'string' ? raw : '';

   let error: string | undefined;
   if (spec.required) {
      if (spec.validate === 'href') {
         error = hrefIssue(stringValue);
      } else if (stringValue.trim().length === 0) {
         error = `${spec.label} is required`;
      }
   }
   if (!error) {
      if (spec.validate === 'https') {
         error = imageSrcIssue(stringValue);
      } else if (spec.validate === 'href' && stringValue.trim().length > 0) {
         error = hrefIssue(stringValue);
      }
   }

   const mergeable = (MERGEABLE_FIELDS[block.type] ?? []).includes(spec.key);
   const mergeKind: 'text' | 'href' = spec.validate === 'href' ? 'href' : 'text';
   const insertMerge = (snippet: string) => {
      const textarea = textareaRef?.current;
      if (textarea) {
         const result = insertAtCaret(
            stringValue,
            snippet,
            textarea.selectionStart,
            textarea.selectionEnd,
         );
         setKey(patch, spec.key, result.value);
         window.requestAnimationFrame(() => {
            textarea.focus();
            textarea.setSelectionRange(result.caret, result.caret);
         });
         return;
      }
      setKey(patch, spec.key, stringValue + snippet);
   };
   const mergeButton = mergeable ? (
      <MergeTagMenu
         kind={mergeKind}
         onInsert={insertMerge}
         ariaLabel={`Insert merge tag into ${spec.label}`}
      />
   ) : null;

   if (spec.kind === 'boolean') {
      return (
         <Checkbox
            id={id}
            checked={raw === true}
            label={spec.label}
            onChange={(event) => setKey(patch, spec.key, event.currentTarget.checked)}
         />
      );
   }

   if (spec.kind === 'spacing') {
      const spacing = raw as Spacing;
      return (
         <SpacingEditor
            value={spacing}
            idPrefix={block.id}
            onValueChange={(next) => setKey(patch, spec.key, next)}
         />
      );
   }

   if (spec.kind === 'hex') {
      if (spec.optional) {
         return (
            <OptionalColourField
               id={id}
               label={spec.label}
               value={typeof raw === 'string' ? raw : undefined}
               themeColor={settings.textColor}
               onValueChange={(next) => setKey(patch, spec.key, next)}
            />
         );
      }

      return (
         <Field
            label={spec.label}
            htmlFor={id}
         >
            <HexInput
               id={id}
               value={stringValue}
               fallback={settings.backgroundColor}
               ariaLabel={spec.label}
               onValueChange={(next) => setKey(patch, spec.key, next)}
            />
         </Field>
      );
   }

   if (spec.kind === 'number') {
      const value = typeof raw === 'number' ? raw : (spec.min ?? 0);
      return (
         <Field
            label={spec.label}
            htmlFor={id}
            error={error}
         >
            <NumberInput
               id={id}
               value={value}
               min={spec.min ?? 0}
               max={spec.max ?? 100}
               ariaLabel={spec.label}
               onValueChange={(next) => setKey(patch, spec.key, next)}
            />
         </Field>
      );
   }

   if (spec.kind === 'range') {
      const value = typeof raw === 'number' ? raw : (spec.min ?? 0);
      const min = spec.min ?? 0;
      const max = spec.max ?? 100;
      return (
         <Field
            label={`${spec.label} (${value}px)`}
            htmlFor={id}
         >
            <div className="flex items-center gap-2">
               <input
                  id={id}
                  type="range"
                  min={min}
                  max={max}
                  step={spec.step ?? 1}
                  value={value}
                  aria-label={spec.label}
                  className="h-2 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  onInput={(event) =>
                     setKey(
                        patch,
                        spec.key,
                        clampNumber(Number(event.currentTarget.value), min, max, value),
                     )
                  }
               />
               <div className="w-20 shrink-0">
                  <NumberInput
                     value={value}
                     min={min}
                     max={max}
                     ariaLabel={`${spec.label} number`}
                     onValueChange={(next) => setKey(patch, spec.key, next)}
                  />
               </div>
            </div>
         </Field>
      );
   }

   if (spec.kind === 'select' || spec.kind === 'align') {
      const options = spec.kind === 'align' ? ALIGN_OPTIONS : (spec.options ?? []);
      return (
         <Field
            label={spec.label}
            htmlFor={id}
         >
            <OptionSelect
               id={id}
               value={String(raw ?? '')}
               options={options}
               ariaLabel={spec.label}
               onValueChange={(next) => setKey(patch, spec.key, spec.numeric ? Number(next) : next)}
            />
         </Field>
      );
   }

   if (spec.kind === 'textarea') {
      if (textareaRef) {
         return (
            <Field
               label={spec.label}
               htmlFor={id}
               hint={spec.hint}
               error={error}
            >
               <div className="flex items-start gap-1">
                  <textarea
                     id={id}
                     ref={textareaRef}
                     rows={6}
                     value={stringValue}
                     aria-invalid={error ? true : undefined}
                     className={TEXTAREA_CLASS}
                     onInput={(event) => setKey(patch, spec.key, event.currentTarget.value)}
                  />
                  {mergeButton}
               </div>
            </Field>
         );
      }

      return (
         <Field
            label={spec.label}
            htmlFor={id}
            hint={spec.hint}
            error={error}
         >
            <div className="flex items-start gap-1">
               <Textarea
                  id={id}
                  rows={4}
                  value={stringValue}
                  onInput={(event) => setKey(patch, spec.key, event.currentTarget.value)}
               />
               {mergeButton}
            </div>
         </Field>
      );
   }

   return (
      <Field
         label={spec.label}
         htmlFor={id}
         hint={spec.hint}
         error={error}
      >
         <div className="flex items-center gap-1">
            <Input
               id={id}
               value={stringValue}
               placeholder={spec.placeholder}
               aria-invalid={error ? true : undefined}
               onInput={(event) => setKey(patch, spec.key, event.currentTarget.value)}
            />
            {mergeButton}
         </div>
      </Field>
   );
}

function OptionalColourField({
   id,
   label,
   value,
   themeColor,
   onValueChange,
}: {
   id: string;
   label: string;
   value: string | undefined;
   themeColor: string;
   onValueChange: (value: string | undefined) => void;
}) {
   const usingTheme = value === undefined;

   return (
      <div className="grid gap-2">
         <Label htmlFor={id}>{label}</Label>
         <Checkbox
            id={`${id}-theme`}
            checked={usingTheme}
            label="Use theme colour"
            onChange={(event) =>
               onValueChange(event.currentTarget.checked ? undefined : themeColor)
            }
         />
         {!usingTheme && (
            <HexInput
               id={id}
               value={value}
               fallback={themeColor}
               ariaLabel={label}
               onValueChange={onValueChange}
            />
         )}
      </div>
   );
}

function ColumnBlockMenu({ onAdd }: { onAdd: (type: Exclude<BlockType, 'columns'>) => void }) {
   const options = BLOCK_TYPE_OPTIONS.filter(
      (option): option is { type: Exclude<BlockType, 'columns'>; label: string } =>
         option.type !== 'columns',
   );

   return (
      <DropdownMenu className="w-full">
         <DropdownMenuTrigger className="w-full justify-center text-xs">
            + Add block
         </DropdownMenuTrigger>
         <DropdownMenuContent className="w-44">
            {options.map((option) => (
               <DropdownMenuItem
                  key={option.type}
                  onSelect={() => onAdd(option.type)}
               >
                  {option.label}
               </DropdownMenuItem>
            ))}
         </DropdownMenuContent>
      </DropdownMenu>
   );
}

function ColumnsEditor({
   doc,
   block,
   onChange,
   onSelect,
}: {
   doc: Document;
   block: ColumnsBlock;
   onChange: (next: Document) => void;
   onSelect: (id: string) => void;
}) {
   const [confirmingChildId, setConfirmingChildId] = useState<string | null>(null);

   const updateColumns = (columns: Column[]) => {
      onChange(updateBlock(doc, block.id, { columns }));
   };

   const setCount = (count: 2 | 3) => {
      if (count === block.columns.length) return;
      const next =
         count === 2
            ? block.columns.slice(0, 2)
            : [...block.columns, { widthPercent: 0, blocks: [] }];
      updateColumns(normaliseColumns(next.map((column) => ({ ...column, widthPercent: 0 }))));
   };

   const setWidth = (index: number, widthPercent: number) => {
      updateColumns(normaliseColumns(distributeColumnWidths(block.columns, index, widthPercent)));
   };

   const addBlock = (columnIndex: number, type: Exclude<BlockType, 'columns'>) => {
      updateColumns(
         block.columns.map((column, index) =>
            index === columnIndex
               ? { ...column, blocks: [...column.blocks, createBlock(type)] }
               : column,
         ),
      );
   };

   return (
      <div className="grid gap-3 rounded-md border border-border p-3">
         <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium">Columns</span>
            <div className="flex gap-1">
               <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-xs"
                  disabled={block.columns.length >= 3}
                  onClick={() => setCount(3)}
               >
                  <Plus className="size-3.5" />
                  Add
               </Button>
               <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-xs"
                  disabled={block.columns.length <= 2}
                  onClick={() => setCount(2)}
               >
                  <X className="size-3.5" />
                  Remove
               </Button>
            </div>
         </div>

         {block.columns.map((column, index) => (
            <div
               key={index}
               className="grid gap-2 rounded-md border border-border/70 p-2"
            >
               <div className="grid gap-1">
                  <Label
                     htmlFor={`col-${block.id}-${index}`}
                     className="text-xs text-muted-foreground"
                  >
                     Column {index + 1} width %
                  </Label>
                  <NumberInput
                     id={`col-${block.id}-${index}`}
                     value={column.widthPercent}
                     min={1}
                     max={99}
                     ariaLabel={`Column ${index + 1} width percent`}
                     onValueChange={(next) => setWidth(index, next)}
                  />
               </div>

               <div className="grid gap-1">
                  {column.blocks.length === 0 ? (
                     <p className="text-xs text-muted-foreground">No blocks in this column.</p>
                  ) : (
                     column.blocks.map((child) => (
                        <div
                           key={child.id}
                           className="flex items-center gap-1 rounded border border-border/70 px-2 py-1"
                        >
                           <button
                              type="button"
                              className="min-w-0 flex-1 truncate rounded text-left text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              onClick={() => onSelect(child.id)}
                           >
                              {blockLabel(child)}
                           </button>
                           {confirmingChildId === child.id ? (
                              <div className="flex items-center gap-1">
                                 <span className="text-[10px] font-medium text-destructive">
                                    Delete?
                                 </span>
                                 <Button
                                    size="sm"
                                    variant="destructive"
                                    className="h-6 px-1.5 text-[10px]"
                                    onClick={() => {
                                       onChange(removeBlock(doc, child.id));
                                       setConfirmingChildId(null);
                                    }}
                                 >
                                    Delete
                                 </Button>
                                 <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-6 px-1.5 text-[10px]"
                                    onClick={() => setConfirmingChildId(null)}
                                 >
                                    Cancel
                                 </Button>
                              </div>
                           ) : (
                              <Button
                                 size="icon"
                                 variant="ghost"
                                 className="size-6 text-muted-foreground hover:text-destructive"
                                 aria-label={`Remove ${blockLabel(child)}`}
                                 onClick={() => setConfirmingChildId(child.id)}
                              >
                                 <Trash className="size-3" />
                              </Button>
                           )}
                        </div>
                     ))
                  )}
               </div>

               <ColumnBlockMenu onAdd={(type) => addBlock(index, type)} />
            </div>
         ))}
      </div>
   );
}

function SocialEditor({
   doc,
   block,
   onChange,
}: {
   doc: Document;
   block: SocialBlock;
   onChange: (next: Document) => void;
}) {
   const updateLinks = (links: SocialLink[]) => {
      onChange(updateBlock(doc, block.id, { links }));
   };

   const updateLink = (index: number, patch: Partial<SocialLink>) => {
      updateLinks(
         block.links.map((link, linkIndex) => (linkIndex === index ? { ...link, ...patch } : link)),
      );
   };

   return (
      <div className="grid gap-3 rounded-md border border-border p-3">
         <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium">Social links</span>
            <Button
               size="sm"
               variant="outline"
               className="h-7 px-2 text-xs"
               onClick={() =>
                  updateLinks([...block.links, { network: 'website', href: 'https://example.com' }])
               }
            >
               <Plus className="size-3.5" />
               Add
            </Button>
         </div>

         {block.links.length === 0 && (
            <p className="text-xs text-muted-foreground">Add at least one link.</p>
         )}

         {block.links.map((link, index) => {
            const issue = hrefIssue(link.href);
            return (
               <div
                  key={index}
                  className="grid gap-2 rounded-md border border-border/70 p-2"
               >
                  <div className="flex items-center justify-between gap-2">
                     <span className="text-xs font-medium">Link {index + 1}</span>
                     <Button
                        size="icon"
                        variant="ghost"
                        className="size-6 text-muted-foreground hover:text-destructive"
                        aria-label={`Remove link ${index + 1}`}
                        onClick={() =>
                           updateLinks(block.links.filter((_, linkIndex) => linkIndex !== index))
                        }
                     >
                        <Trash className="size-3" />
                     </Button>
                  </div>

                  <div className="grid gap-1">
                     <Label
                        htmlFor={`social-network-${block.id}-${index}`}
                        className="text-xs text-muted-foreground"
                     >
                        Network
                     </Label>
                     <OptionSelect
                        id={`social-network-${block.id}-${index}`}
                        value={link.network}
                        options={SOCIAL_NETWORK_OPTIONS}
                        ariaLabel="Social network"
                        onValueChange={(next) =>
                           updateLink(index, { network: next as SocialNetwork })
                        }
                     />
                  </div>

                  <div className="grid gap-1">
                     <Label
                        htmlFor={`social-href-${block.id}-${index}`}
                        className="text-xs text-muted-foreground"
                     >
                        URL
                     </Label>
                     <div className="flex items-center gap-1">
                        <Input
                           id={`social-href-${block.id}-${index}`}
                           value={link.href}
                           aria-invalid={issue ? true : undefined}
                           onInput={(event) =>
                              updateLink(index, { href: event.currentTarget.value })
                           }
                        />
                        <MergeTagMenu
                           kind="href"
                           ariaLabel={`Insert merge tag into link ${index + 1} URL`}
                           onInsert={(snippet) => updateLink(index, { href: link.href + snippet })}
                        />
                     </div>
                     {issue && <p className="text-xs font-medium text-destructive">{issue}</p>}
                  </div>
               </div>
            );
         })}
      </div>
   );
}
