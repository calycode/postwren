import { useEffect, useState } from 'react';
import {
   ArrowDown,
   ArrowUp,
   Clock,
   GripVertical,
   Mail,
   Plus,
   SlidersHorizontal,
   Tag as TagIcon,
   Trash2,
} from 'lucide-react';
import {
   Button,
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuItem,
   DropdownMenuTrigger,
   Field,
   Input,
   Select,
   SelectContent,
   SelectItem,
   SelectTrigger,
   cn,
} from '@postwren/ui';
import type { AutomationStep } from '@/lib/api/types';
import { titleCase } from '@/lib/format';

export function stepTitle(step: AutomationStep): string {
   switch (step.type) {
      case 'wait':
         return 'Wait';
      case 'send':
         return 'Send email';
      case 'add_tag':
         return 'Add tag';
      case 'remove_tag':
         return 'Remove tag';
      case 'set_metadata':
         return 'Set custom field';
      case 'exit':
         return 'Exit';
   }
}

export function stepIcon(step: AutomationStep) {
   switch (step.type) {
      case 'wait':
         return <Clock aria-hidden="true" />;
      case 'send':
         return <Mail aria-hidden="true" />;
      case 'set_metadata':
         return <SlidersHorizontal aria-hidden="true" />;
      default:
         return <TagIcon aria-hidden="true" />;
   }
}

export function newStep(type: AutomationStep['type']): AutomationStep {
   const id = `stp_${crypto.randomUUID()}`;
   switch (type) {
      case 'wait':
         return { id, type: 'wait', amount: 1, unit: 'days' };
      case 'send':
         return { id, type: 'send', templateId: '' };
      case 'add_tag':
         return { id, type: 'add_tag', tag: 'welcomed' };
      case 'remove_tag':
         return { id, type: 'remove_tag', tag: 'trial' };
      case 'set_metadata':
         return { id, type: 'set_metadata', key: 'plan', value: 'trial' };
      case 'exit':
         return { id, type: 'exit' };
   }
}

export function AddStepMenu({
   onAdd,
   label = 'Add step',
   ariaLabel,
   className,
}: {
   onAdd: (type: AutomationStep['type']) => void;
   label?: string;
   ariaLabel?: string;
   className?: string;
}) {
   return (
      <DropdownMenu>
         <DropdownMenuTrigger
            aria-label={ariaLabel}
            className={cn(
               'h-8 w-fit gap-1.5 border-dashed px-2.5 text-xs text-muted-foreground',
               className,
            )}
         >
            <Plus aria-hidden="true" />
            {label}
         </DropdownMenuTrigger>
         <DropdownMenuContent className="left-0 right-auto">
            <DropdownMenuItem onSelect={() => onAdd('send')}>
               <Mail aria-hidden="true" />
               Send email
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onAdd('wait')}>
               <Clock aria-hidden="true" />
               Wait
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onAdd('add_tag')}>
               <TagIcon aria-hidden="true" />
               Add tag
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onAdd('remove_tag')}>
               <TagIcon aria-hidden="true" />
               Remove tag
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onAdd('set_metadata')}>
               <SlidersHorizontal aria-hidden="true" />
               Set custom field
            </DropdownMenuItem>
         </DropdownMenuContent>
      </DropdownMenu>
   );
}

export function StepEditor({
   step,
   index,
   total,
   templates,
   disabled,
   dragging,
   onChange,
   onMove,
   onRemove,
   onAddAfter,
   onDragStart,
   onDrop,
   onDragEnd,
   showAddAfter = true,
   dragActive = false,
}: {
   step: AutomationStep;
   index: number;
   total: number;
   templates: { id: string; name: string; revision: number }[];
   disabled: boolean;
   dragging: boolean;
   onChange: (step: AutomationStep) => void;
   onMove: (direction: -1 | 1) => void;
   onRemove: () => void;
   onAddAfter: (type: AutomationStep['type']) => void;
   onDragStart: (index: number) => void;
   onDrop: (from: number, to: number, position: 'before' | 'after') => void;
   onDragEnd: () => void;
   showAddAfter?: boolean;
   dragActive?: boolean;
}) {
   const locked = step.type === 'exit';
   const [dropPosition, setDropPosition] = useState<'before' | 'after' | null>(null);

   useEffect(() => {
      if (!dragActive) setDropPosition(null);
   }, [dragActive]);

   return (
      <div
         className={cn(
            'relative grid grid-cols-[2rem_minmax(0,1fr)] gap-3 transition-opacity',
            dragging && 'opacity-45',
         )}
         onDragOver={(event) => {
            if (disabled || locked) return;
            event.preventDefault();
            if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
            const rect = event.currentTarget.getBoundingClientRect();
            const next = event.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
            setDropPosition((current) => (current === next ? current : next));
         }}
         onDragLeave={(event) => {
            if (
               event.relatedTarget instanceof Node &&
               event.currentTarget.contains(event.relatedTarget)
            ) {
               return;
            }
            setDropPosition(null);
         }}
         onDrop={(event) => {
            if (disabled || locked) return;
            event.preventDefault();
            setDropPosition(null);
            const rect = event.currentTarget.getBoundingClientRect();
            const position: 'before' | 'after' =
               event.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
            const raw = event.dataTransfer?.getData('text/plain') ?? '';
            const from = Number.parseInt(raw, 10);
            onDrop(Number.isNaN(from) ? index : from, index, position);
         }}
      >
         {dropPosition !== null && (
            <div
               aria-hidden="true"
               className={cn(
                  'pointer-events-none absolute -inset-x-1 z-20 grid grid-cols-[2rem_minmax(0,1fr)] gap-3',
                  dropPosition === 'before' ? 'top-0' : 'bottom-0',
               )}
            >
               <span
                  className={cn(
                     'col-start-2 h-0.5 rounded-full bg-ochre shadow-[0_0_0_3px] shadow-ochre/20',
                     dropPosition === 'before' ? '-translate-y-1/2' : 'translate-y-1/2',
                  )}
               />
            </div>
         )}
         <div className="relative z-10 flex justify-center">
            <span className="mt-3 flex size-8 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm [&_svg]:size-4">
               {stepIcon(step)}
            </span>
         </div>

         <div className="group relative min-w-0 rounded-xl border border-border bg-background/70 p-4">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
               {!locked && !disabled && (
                  <span
                     draggable
                     aria-label={`Drag step ${index + 1}`}
                     title="Drag to reorder"
                     className="cursor-grab text-muted-foreground active:cursor-grabbing"
                     onDragStart={(event) => {
                        event.dataTransfer?.setData('text/plain', String(index));
                        if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
                        onDragStart(index);
                     }}
                     onDragEnd={onDragEnd}
                  >
                     <GripVertical
                        className="size-4"
                        aria-hidden="true"
                     />
                  </span>
               )}
               <span className="text-[10px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
                  Step {index + 1}
               </span>
               <span className="text-sm font-medium">{stepTitle(step)}</span>
               {!locked && (
                  <div className="ml-auto flex items-center">
                     <Button
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        aria-label={`Move step ${index + 1} up`}
                        disabled={disabled || index === 0}
                        onClick={() => onMove(-1)}
                     >
                        <ArrowUp aria-hidden="true" />
                     </Button>
                     <Button
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        aria-label={`Move step ${index + 1} down`}
                        disabled={disabled || index === total - 1}
                        onClick={() => onMove(1)}
                     >
                        <ArrowDown aria-hidden="true" />
                     </Button>
                     <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 text-muted-foreground hover:text-destructive"
                        aria-label={`Delete step ${index + 1}`}
                        disabled={disabled}
                        onClick={onRemove}
                     >
                        <Trash2 aria-hidden="true" />
                     </Button>
                  </div>
               )}
               {locked && (
                  <span className="ml-auto text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
                     Always last
                  </span>
               )}
            </div>

            <div className="mt-3 grid gap-3">
               {step.type === 'wait' && (
                  <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
                     <Field
                        label="Amount"
                        htmlFor={`step-${step.id}-amount`}
                     >
                        <Input
                           id={`step-${step.id}-amount`}
                           type="number"
                           min={1}
                           max={365}
                           value={step.amount}
                           disabled={disabled}
                           onInput={(event) =>
                              onChange({
                                 ...step,
                                 amount: Math.max(1, Number(event.currentTarget.value) || 1),
                              })
                           }
                        />
                     </Field>
                     <Field
                        label="Unit"
                        htmlFor={`step-${step.id}-unit`}
                     >
                        <Select
                           value={step.unit}
                           disabled={disabled}
                           onValueChange={(value) => {
                              if (value === 'minutes' || value === 'hours' || value === 'days') {
                                 onChange({ ...step, unit: value });
                              }
                           }}
                        >
                           <SelectTrigger id={`step-${step.id}-unit`}>
                              <span>{titleCase(step.unit)}</span>
                           </SelectTrigger>
                           <SelectContent>
                              <SelectItem value="minutes">Minutes</SelectItem>
                              <SelectItem value="hours">Hours</SelectItem>
                              <SelectItem value="days">Days</SelectItem>
                           </SelectContent>
                        </Select>
                     </Field>
                  </div>
               )}

               {step.type === 'send' && (
                  <div className="grid gap-3 sm:grid-cols-2">
                     <Field
                        label="Template"
                        htmlFor={`step-${step.id}-template`}
                     >
                        <select
                           id={`step-${step.id}-template`}
                           value={step.templateId}
                           disabled={disabled}
                           onChange={(event) =>
                              onChange({ ...step, templateId: event.currentTarget.value })
                           }
                           className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                        >
                           <option value="">Choose a template</option>
                           {templates.map((template) => (
                              <option
                                 key={template.id}
                                 value={template.id}
                              >
                                 {template.name} (v{template.revision})
                              </option>
                           ))}
                        </select>
                     </Field>
                     <Field
                        label="Subject"
                        htmlFor={`step-${step.id}-subject`}
                        hint="Leave empty to use the template subject."
                     >
                        <Input
                           id={`step-${step.id}-subject`}
                           value={step.subject ?? ''}
                           disabled={disabled}
                           maxLength={998}
                           onInput={(event) =>
                              onChange({
                                 ...step,
                                 subject: event.currentTarget.value,
                              })
                           }
                        />
                     </Field>
                     <p className="text-xs text-muted-foreground sm:col-span-2">
                        Automation custom fields resolve in this template as{' '}
                        <code className="rounded bg-muted px-1 py-0.5">
                           {'{{ automation.meta.key }}'}
                        </code>
                        .
                     </p>
                  </div>
               )}

               {(step.type === 'add_tag' || step.type === 'remove_tag') && (
                  <Field
                     label="Tag"
                     htmlFor={`step-${step.id}-tag`}
                  >
                     <Input
                        id={`step-${step.id}-tag`}
                        value={step.tag}
                        disabled={disabled}
                        maxLength={64}
                        onInput={(event) => onChange({ ...step, tag: event.currentTarget.value })}
                     />
                  </Field>
               )}

               {step.type === 'set_metadata' && (
                  <div className="grid gap-3 sm:grid-cols-2">
                     <Field
                        label="Field key"
                        htmlFor={`step-${step.id}-key`}
                        hint="Lowercase letters, digits and underscores."
                     >
                        <Input
                           id={`step-${step.id}-key`}
                           value={step.key}
                           disabled={disabled}
                           maxLength={64}
                           onInput={(event) =>
                              onChange({ ...step, key: event.currentTarget.value })
                           }
                        />
                     </Field>
                     <Field
                        label="Value"
                        htmlFor={`step-${step.id}-value`}
                     >
                        <Input
                           id={`step-${step.id}-value`}
                           value={step.value}
                           disabled={disabled}
                           maxLength={1024}
                           onInput={(event) =>
                              onChange({ ...step, value: event.currentTarget.value })
                           }
                        />
                     </Field>
                  </div>
               )}

               {step.type === 'exit' && (
                  <p className="text-xs text-muted-foreground">
                     Ends the run here. Unsubscribes and bounces also end a run before this step.
                  </p>
               )}
            </div>

            {!disabled && step.type !== 'exit' && showAddAfter && (
               <div className="mt-3 md:absolute md:top-full md:-mt-px md:left-4 md:z-20 md:pointer-events-none md:opacity-0 md:transition-opacity md:group-hover:pointer-events-auto md:group-hover:opacity-100 md:focus-within:pointer-events-auto md:focus-within:opacity-100 md:has-[details[open]]:pointer-events-auto md:has-[details[open]]:opacity-100">
                  <AddStepMenu
                     onAdd={onAddAfter}
                     label="Add step after"
                     ariaLabel={`Add step after step ${index + 1}`}
                     className="h-7"
                  />
               </div>
            )}
         </div>
      </div>
   );
}
