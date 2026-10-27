import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { XIcon } from 'lucide-react';
import type { JSX } from 'preact';

import { withoutRef } from '../lib/preact-compat';
import { cn } from '../lib/utils';
import { buttonVariants } from '../lib/variants';

export type DialogProps = DialogPrimitive.Root.Props;

export function Dialog(props: DialogProps) {
   return (
      <DialogPrimitive.Root
         data-slot="dialog"
         {...props}
      />
   );
}

type TriggerProps = Omit<DialogPrimitive.Trigger.Props, 'className'> & {
   className?: string;
};

export function DialogTrigger({ nativeButton, className, ...props }: TriggerProps) {
   return (
      <DialogPrimitive.Trigger
         data-slot="dialog-trigger"
         nativeButton={nativeButton ?? true}
         className={cn(buttonVariants(), className)}
         {...withoutRef(props)}
      />
   );
}

type ContentProps = Omit<DialogPrimitive.Popup.Props, 'className'> & {
   className?: string;
   showCloseButton?: boolean;
};

export function DialogContent({
   className,
   children,
   showCloseButton = true,
   ...props
}: ContentProps) {
   return (
      <DialogPrimitive.Portal data-slot="dialog-portal">
         <DialogPrimitive.Backdrop
            data-slot="dialog-backdrop"
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0"
         />
         <DialogPrimitive.Popup
            data-slot="dialog-content"
            className={cn(
               'fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl border border-border bg-popover p-6 text-popover-foreground shadow-lg outline-none transition-[opacity,transform] duration-150 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0 sm:max-w-lg',
               className,
            )}
            {...withoutRef(props)}
         >
            {children}
            {showCloseButton && (
               <DialogPrimitive.Close
                  data-slot="dialog-close"
                  nativeButton
                  className="absolute top-4 right-4 inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
               >
                  <XIcon
                     className="size-4"
                     aria-hidden="true"
                  />
                  <span className="sr-only">Close</span>
               </DialogPrimitive.Close>
            )}
         </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
   );
}

type HeaderProps = Omit<JSX.HTMLAttributes<HTMLDivElement>, 'className'> & {
   className?: string;
};

export function DialogHeader({ className, ...props }: HeaderProps) {
   return (
      <div
         data-slot="dialog-header"
         className={cn('flex flex-col gap-1.5 pr-8', className)}
         {...withoutRef(props)}
      />
   );
}

export function DialogFooter({ className, ...props }: HeaderProps) {
   return (
      <div
         data-slot="dialog-footer"
         className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)}
         {...withoutRef(props)}
      />
   );
}

type TitleProps = Omit<DialogPrimitive.Title.Props, 'className'> & {
   className?: string;
};

export function DialogTitle({ className, ...props }: TitleProps) {
   return (
      <DialogPrimitive.Title
         data-slot="dialog-title"
         className={cn('font-heading text-lg leading-none font-semibold', className)}
         {...withoutRef(props)}
      />
   );
}

type DescriptionProps = Omit<DialogPrimitive.Description.Props, 'className'> & {
   className?: string;
};

export function DialogDescription({ className, ...props }: DescriptionProps) {
   return (
      <DialogPrimitive.Description
         data-slot="dialog-description"
         className={cn('text-sm text-muted-foreground', className)}
         {...withoutRef(props)}
      />
   );
}

type CloseProps = Omit<DialogPrimitive.Close.Props, 'className'> & {
   className?: string;
};

export function DialogClose({ nativeButton, className, ...props }: CloseProps) {
   return (
      <DialogPrimitive.Close
         data-slot="dialog-close"
         nativeButton={nativeButton ?? true}
         className={cn(buttonVariants({ variant: 'outline' }), className)}
         {...withoutRef(props)}
      />
   );
}
