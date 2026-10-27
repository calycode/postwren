import { useEffect, useState } from 'react';
import type { Spacing } from '@mailer/email/ir';
import {
   Input,
   Label,
   Select,
   SelectContent,
   SelectItem,
   SelectTrigger,
   SelectValue,
} from '@mailer/ui';
import type { FieldOption } from '../lib/block-schema';
import { clampNumber, isHexColor, parseNumber } from '../lib/controls';

type NumberInputProps = {
   id?: string;
   value: number;
   min: number;
   max: number;
   fallback?: number;
   disabled?: boolean;
   ariaLabel?: string;
   onValueChange: (value: number) => void;
};

export function NumberInput({
   id,
   value,
   min,
   max,
   fallback = value,
   disabled = false,
   ariaLabel,
   onValueChange,
}: NumberInputProps) {
   const [draft, setDraft] = useState(String(value));

   useEffect(() => {
      setDraft(String(value));
   }, [value]);

   const commit = (raw: string) => {
      const next = parseNumber(raw, min, max, fallback);
      onValueChange(next);
      setDraft(String(next));
   };

   return (
      <Input
         id={id}
         type="number"
         inputMode="numeric"
         min={min}
         max={max}
         value={draft}
         disabled={disabled}
         aria-label={ariaLabel}
         onInput={(event) => setDraft(event.currentTarget.value)}
         onBlur={(event) => commit(event.currentTarget.value)}
         onKeyDown={(event) => {
            if (event.key === 'Enter') {
               event.preventDefault();
               commit(event.currentTarget.value);
               event.currentTarget.blur();
            }
            if (event.key === 'Escape') {
               setDraft(String(value));
               event.currentTarget.blur();
            }
         }}
      />
   );
}

type HexInputProps = {
   id?: string;
   value: string;
   fallback: string;
   disabled?: boolean;
   ariaLabel?: string;
   onValueChange: (value: string) => void;
};

export function HexInput({
   id,
   value,
   fallback,
   disabled = false,
   ariaLabel,
   onValueChange,
}: HexInputProps) {
   const [draft, setDraft] = useState(value);
   const valid = isHexColor(draft);

   useEffect(() => {
      setDraft(value);
   }, [value]);

   const commit = (raw: string) => {
      if (isHexColor(raw)) {
         onValueChange(raw.trim());
         setDraft(raw.trim());
         return;
      }
      setDraft(value);
   };

   return (
      <div className="grid gap-1">
         <div className="flex items-center gap-2">
            <span
               aria-hidden="true"
               className="size-8 shrink-0 rounded-md border border-border"
               style={{ backgroundColor: valid ? draft : fallback }}
            />
            <Input
               id={id}
               value={draft}
               disabled={disabled}
               aria-label={ariaLabel}
               aria-invalid={!valid}
               spellcheck={false}
               onInput={(event) => {
                  const raw = event.currentTarget.value;
                  setDraft(raw);
                  if (isHexColor(raw)) onValueChange(raw.trim());
               }}
               onBlur={(event) => commit(event.currentTarget.value)}
               onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                     event.preventDefault();
                     commit(event.currentTarget.value);
                     event.currentTarget.blur();
                  }
               }}
            />
         </div>
         {!valid && (
            <p className="text-xs font-medium text-destructive">Use a six digit hex colour</p>
         )}
      </div>
   );
}

type OptionSelectProps = {
   id?: string;
   value: string;
   options: readonly FieldOption[];
   placeholder?: string;
   disabled?: boolean;
   ariaLabel?: string;
   onValueChange: (value: string) => void;
};

export function OptionSelect({
   id,
   value,
   options,
   placeholder,
   disabled = false,
   ariaLabel,
   onValueChange,
}: OptionSelectProps) {
   return (
      <Select
         value={value}
         disabled={disabled}
         onValueChange={(next) => {
            if (next !== null) onValueChange(next);
         }}
      >
         <SelectTrigger
            id={id}
            aria-label={ariaLabel}
            disabled={disabled}
         >
            <SelectValue>
               {(current) =>
                  options.find((option) => option.value === current)?.label ?? placeholder ?? ''
               }
            </SelectValue>
         </SelectTrigger>
         <SelectContent>
            {options.map((option) => (
               <SelectItem
                  key={option.value}
                  value={option.value}
               >
                  {option.label}
               </SelectItem>
            ))}
         </SelectContent>
      </Select>
   );
}

const SPACING_SIDES = ['top', 'right', 'bottom', 'left'] as const;

type SpacingEditorProps = {
   value: Spacing;
   idPrefix: string;
   onValueChange: (value: Spacing) => void;
};

export function SpacingEditor({ value, idPrefix, onValueChange }: SpacingEditorProps) {
   return (
      <fieldset className="grid gap-2">
         <legend className="text-sm font-medium text-foreground">Padding</legend>
         <div className="grid grid-cols-2 gap-2">
            {SPACING_SIDES.map((side) => {
               const id = `${idPrefix}-spacing-${side}`;
               return (
                  <div
                     key={side}
                     className="grid gap-1"
                  >
                     <Label
                        htmlFor={id}
                        className="text-xs text-muted-foreground capitalize"
                     >
                        {side}
                     </Label>
                     <NumberInput
                        id={id}
                        value={value[side]}
                        min={0}
                        max={96}
                        ariaLabel={`Padding ${side}`}
                        onValueChange={(next) =>
                           onValueChange({ ...value, [side]: clampNumber(next, 0, 96) })
                        }
                     />
                  </div>
               );
            })}
         </div>
      </fieldset>
   );
}
