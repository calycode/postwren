import {
   Alert,
   AlertDescription,
   Field,
   Input,
   Select,
   SelectContent,
   SelectItem,
   SelectTrigger,
   SelectValue,
   Skeleton,
   Tooltip,
} from '@postwren/ui';
import { Info } from 'lucide-react';
import type { SenderAddress } from '@/lib/api/types';

export type SenderSelectProps = {
   id: string;
   value: string;
   senders: SenderAddress[];
   loading: boolean;
   error: string | null;
   disabled?: boolean;
   validationError?: string;
   onRetry: () => void;
   onChange: (email: string) => void;
};

export function SenderSelect({
   id,
   value,
   senders,
   loading,
   error,
   disabled = false,
   validationError,
   onRetry,
   onChange,
}: SenderSelectProps) {
   const verified = senders.filter((address) => address.verified_at !== null);

   if (loading) {
      return (
         <Field
            label="From email"
            htmlFor={id}
            required
         >
            <Skeleton className="h-9 w-full" />
         </Field>
      );
   }

   if (error !== null) {
      return (
         <Field
            label="From email"
            htmlFor={id}
            required
            error={validationError}
         >
            <Alert variant="warning">
               <AlertDescription>
                  {error}{' '}
                  <button
                     type="button"
                     className="font-medium underline underline-offset-2"
                     onClick={onRetry}
                  >
                     Retry
                  </button>
               </AlertDescription>
            </Alert>
         </Field>
      );
   }

   if (verified.length === 0) {
      return (
         <Field
            label="From email"
            htmlFor={id}
            required
            error={validationError}
            hint={
               <>
                  No verified sending address yet.{' '}
                  <a
                     href="/settings"
                     className="font-medium underline underline-offset-2"
                  >
                     Add one in Settings
                  </a>
                  .
               </>
            }
         >
            <Input
               id={id}
               type="email"
               value={value}
               disabled={disabled}
               autoComplete="email"
               onInput={(event) => onChange(event.currentTarget.value)}
            />
         </Field>
      );
   }

   return (
      <Field
         label={
            <span className="inline-flex items-center gap-1.5">
               From email
               <Tooltip
                  content="Only addresses verified in Settings can send."
                  tabIndex={0}
                  aria-label="Only verified senders can send"
               >
                  <Info
                     className="size-3.5 text-muted-foreground"
                     aria-hidden="true"
                  />
               </Tooltip>
            </span>
         }
         htmlFor={id}
         required
         error={validationError}
      >
         <Select
            value={value.length > 0 ? value : null}
            onValueChange={(next) => onChange(next ?? '')}
            disabled={disabled}
         >
            <SelectTrigger id={id}>
               <SelectValue placeholder="Choose a sending address" />
            </SelectTrigger>
            <SelectContent>
               {verified.map((address) => (
                  <SelectItem
                     key={address.id}
                     value={address.email}
                  >
                     {address.name.length > 0
                        ? `${address.name} <${address.email}>`
                        : address.email}
                  </SelectItem>
               ))}
            </SelectContent>
         </Select>
      </Field>
   );
}
