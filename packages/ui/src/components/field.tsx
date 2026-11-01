import { Fragment, cloneElement, isValidElement } from 'preact';
import type { ComponentChildren, JSX, VNode } from 'preact';

import { withoutRef } from '../lib/preact-compat';
import { cn } from '../lib/utils';
import { Label } from './label';

export type FieldProps = Omit<
   JSX.HTMLAttributes<HTMLDivElement>,
   'className' | 'children' | 'label'
> & {
   className?: string;
   children: ComponentChildren;
   label?: ComponentChildren;
   htmlFor?: string;
   hint?: ComponentChildren;
   error?: ComponentChildren;
   required?: boolean;
};

type ControlProps = Record<string, unknown>;

function singleControl(children: ComponentChildren): VNode<ControlProps> | null {
   const candidates = (Array.isArray(children) ? children : [children]).filter(
      (child) => child !== null && child !== undefined && child !== false && child !== '',
   );
   if (candidates.length !== 1) return null;

   const [candidate] = candidates;
   if (!isValidElement(candidate) || candidate.type === Fragment) return null;
   return candidate as VNode<ControlProps>;
}

function describeControl(
   control: VNode<ControlProps>,
   describedById: string | undefined,
   invalid: boolean,
): VNode<ControlProps> {
   const existing = control.props['aria-describedby'];
   const ids =
      typeof existing === 'string' ? existing.split(/\s+/).filter((id) => id.length > 0) : [];
   if (describedById !== undefined && !ids.includes(describedById)) ids.push(describedById);

   const props: ControlProps = { ...control.props };
   if (ids.length > 0) props['aria-describedby'] = ids.join(' ');
   if (invalid && props['aria-invalid'] === undefined) props['aria-invalid'] = true;

   return cloneElement(control, props) as VNode<ControlProps>;
}

export function Field({
   className,
   children,
   label,
   htmlFor,
   hint,
   error,
   required = false,
   ...props
}: FieldProps) {
   const hintId = htmlFor ? `${htmlFor}-hint` : undefined;
   const errorId = htmlFor ? `${htmlFor}-error` : undefined;
   const showsError = error !== undefined;
   const showsHint = !showsError && hint !== undefined;

   const control = singleControl(children);
   const describedById = showsError ? errorId : showsHint ? hintId : undefined;
   const content = control ? describeControl(control, describedById, showsError) : children;

   return (
      <div
         data-slot="field"
         className={cn('grid content-start gap-2', className)}
         {...withoutRef(props)}
      >
         {label !== undefined && (
            <Label htmlFor={htmlFor}>
               {label}
               {required && (
                  <span
                     aria-hidden="true"
                     className="ml-0.5 text-destructive"
                  >
                     *
                  </span>
               )}
            </Label>
         )}
         {content}
         {showsError ? (
            <p
               id={errorId}
               className="text-xs font-medium text-destructive"
            >
               {error}
            </p>
         ) : showsHint ? (
            <p
               id={hintId}
               className="text-xs text-muted-foreground"
            >
               {hint}
            </p>
         ) : null}
      </div>
   );
}
