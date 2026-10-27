import type { JSX } from 'preact';

import { withoutRef } from '../lib/preact-compat';
import { cn } from '../lib/utils';
import { alertVariants, type AlertVariants } from '../lib/variants';

export type AlertProps = Omit<JSX.HTMLAttributes<HTMLDivElement>, 'className'> &
   AlertVariants & {
      className?: string;
   };

export function Alert({ className, variant, ...props }: AlertProps) {
   return (
      <div
         data-slot="alert"
         role="alert"
         className={cn(alertVariants({ variant }), className)}
         {...withoutRef(props)}
      />
   );
}

type TitleProps = Omit<JSX.HTMLAttributes<HTMLHeadingElement>, 'className'> & {
   className?: string;
};

export function AlertTitle({ className, ...props }: TitleProps) {
   return (
      <h5
         data-slot="alert-title"
         className={cn('mb-1 leading-none font-medium tracking-tight', className)}
         {...withoutRef(props)}
      />
   );
}

type DescriptionProps = Omit<JSX.HTMLAttributes<HTMLParagraphElement>, 'className'> & {
   className?: string;
};

export function AlertDescription({ className, ...props }: DescriptionProps) {
   return (
      <div
         data-slot="alert-description"
         className={cn('text-sm [&_p]:leading-relaxed', className)}
         {...withoutRef(props)}
      />
   );
}

export { alertVariants };
