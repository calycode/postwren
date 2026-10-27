import { Button as ButtonPrimitive } from '@base-ui/react/button';

import { withoutRef } from '../lib/preact-compat';
import { cn } from '../lib/utils';
import { buttonVariants, type ButtonVariants } from '../lib/variants';

type BaseButtonProps = Omit<ButtonPrimitive.Props, 'className'> & {
   className?: string;
};

export type ButtonProps = BaseButtonProps & ButtonVariants;

export function Button({ className, variant, size, type = 'button', ...props }: ButtonProps) {
   return (
      <ButtonPrimitive
         data-slot="button"
         type={type}
         className={cn(buttonVariants({ variant, size }), className)}
         {...withoutRef(props)}
      />
   );
}

export { buttonVariants };
