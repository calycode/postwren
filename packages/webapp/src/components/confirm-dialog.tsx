import type { ComponentChildren } from 'preact';
import {
   Button,
   Dialog,
   DialogClose,
   DialogContent,
   DialogDescription,
   DialogFooter,
   DialogHeader,
   DialogTitle,
} from '@postwren/ui';

type ConfirmDialogProps = {
   open: boolean;
   onOpenChange: (open: boolean) => void;
   title: string;
   description: ComponentChildren;
   confirmLabel?: string;
   cancelLabel?: string;
   destructive?: boolean;
   loading?: boolean;
   error?: string | null;
   onConfirm: () => void | Promise<void>;
};

export function ConfirmDialog({
   open,
   onOpenChange,
   title,
   description,
   confirmLabel = 'Confirm',
   cancelLabel = 'Cancel',
   destructive = false,
   loading = false,
   error,
   onConfirm,
}: ConfirmDialogProps) {
   return (
      <Dialog
         open={open}
         onOpenChange={onOpenChange}
      >
         <DialogContent>
            <DialogHeader>
               <DialogTitle>{title}</DialogTitle>
               <DialogDescription>{description}</DialogDescription>
            </DialogHeader>
            {error !== undefined && error !== null && (
               <p
                  role="alert"
                  aria-live="polite"
                  className="text-sm text-destructive"
               >
                  {error}
               </p>
            )}
            <DialogFooter>
               <DialogClose disabled={loading}>{cancelLabel}</DialogClose>
               <Button
                  variant={destructive ? 'destructive' : 'default'}
                  disabled={loading}
                  onClick={() => {
                     void Promise.resolve(onConfirm()).catch(() => undefined);
                  }}
               >
                  {loading ? 'Working…' : confirmLabel}
               </Button>
            </DialogFooter>
         </DialogContent>
      </Dialog>
   );
}
