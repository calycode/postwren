import { cva, type VariantProps } from 'class-variance-authority';

export const buttonVariants = cva(
   'inline-flex shrink-0 items-center justify-center gap-2 rounded-md border border-transparent text-sm font-medium whitespace-nowrap transition-colors outline-none select-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*=size-])]:size-4',
   {
      variants: {
         variant: {
            default: 'bg-primary text-primary-foreground hover:bg-primary/90',
            secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
            outline:
               'border-border bg-background text-foreground hover:bg-accent hover:text-accent-foreground',
            ghost: 'text-foreground hover:bg-accent hover:text-accent-foreground',
            destructive:
               'bg-destructive text-destructive-foreground hover:bg-destructive/95 focus-visible:ring-destructive',
         },
         size: {
            sm: 'h-8 gap-1.5 px-3 text-xs',
            default: 'h-9 px-4 py-2',
            lg: 'h-10 px-6 text-base',
            icon: 'size-9',
         },
      },
      defaultVariants: {
         variant: 'default',
         size: 'default',
      },
   },
);

export type ButtonVariants = VariantProps<typeof buttonVariants>;

export const badgeVariants = cva(
   'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap [&_svg]:size-3 [&_svg]:shrink-0',
   {
      variants: {
         variant: {
            default: 'border-transparent bg-primary text-primary-foreground',
            secondary: 'border-transparent bg-secondary text-secondary-foreground',
            outline: 'border-border bg-transparent text-foreground',
            success: 'border-transparent bg-success text-success-foreground',
            warning: 'border-transparent bg-warning text-warning-foreground',
            destructive: 'border-transparent bg-destructive text-destructive-foreground',
         },
      },
      defaultVariants: {
         variant: 'default',
      },
   },
);

export type BadgeVariants = VariantProps<typeof badgeVariants>;

export const alertVariants = cva(
   'relative w-full rounded-lg border px-4 py-3 text-sm [&>svg]:absolute [&>svg]:top-4 [&>svg]:left-4 [&>svg]:size-4 [&>svg+div]:translate-y-px [&>svg~*]:pl-7',
   {
      variants: {
         variant: {
            default: 'border-border bg-card text-card-foreground',
            destructive: 'border-destructive bg-destructive text-destructive-foreground',
            warning: 'border-warning bg-warning text-warning-foreground',
            success: 'border-success bg-success text-success-foreground',
         },
      },
      defaultVariants: {
         variant: 'default',
      },
   },
);

export type AlertVariants = VariantProps<typeof alertVariants>;
