import type { JSX } from 'preact';

import { withoutRef } from '../lib/preact-compat';
import { cn } from '../lib/utils';

type DivProps = Omit<JSX.HTMLAttributes<HTMLDivElement>, 'className'> & {
   className?: string;
};

export function Card({ className, ...props }: DivProps) {
   return (
      <div
         data-slot="card"
         className={cn(
            'flex flex-col gap-6 rounded-xl border border-border bg-card py-6 text-card-foreground shadow-sm',
            className,
         )}
         {...withoutRef(props)}
      />
   );
}

export function CardHeader({ className, ...props }: DivProps) {
   return (
      <div
         data-slot="card-header"
         className={cn('grid gap-1.5 px-6', className)}
         {...withoutRef(props)}
      />
   );
}

type HeadingProps = Omit<JSX.HTMLAttributes<HTMLHeadingElement>, 'className'> & {
   className?: string;
};

export function CardTitle({ className, ...props }: HeadingProps) {
   return (
      <h3
         data-slot="card-title"
         className={cn('font-heading text-lg leading-none font-semibold tracking-tight', className)}
         {...withoutRef(props)}
      />
   );
}

type ParagraphProps = Omit<JSX.HTMLAttributes<HTMLParagraphElement>, 'className'> & {
   className?: string;
};

export function CardDescription({ className, ...props }: ParagraphProps) {
   return (
      <p
         data-slot="card-description"
         className={cn('text-sm text-muted-foreground', className)}
         {...withoutRef(props)}
      />
   );
}

export function CardContent({ className, ...props }: DivProps) {
   return (
      <div
         data-slot="card-content"
         className={cn('px-6', className)}
         {...withoutRef(props)}
      />
   );
}

export function CardFooter({ className, ...props }: DivProps) {
   return (
      <div
         data-slot="card-footer"
         className={cn('flex items-center px-6', className)}
         {...withoutRef(props)}
      />
   );
}
