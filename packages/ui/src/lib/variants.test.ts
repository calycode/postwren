import { describe, expect, it } from 'vitest';

import { alertVariants, badgeVariants, buttonVariants } from './variants';

describe('buttonVariants', () => {
   it('maps each variant to its token pair', () => {
      expect(buttonVariants({ variant: 'default' })).toContain(
         'bg-primary text-primary-foreground',
      );
      expect(buttonVariants({ variant: 'secondary' })).toContain(
         'bg-secondary text-secondary-foreground',
      );
      expect(buttonVariants({ variant: 'outline' })).toContain(
         'border-border bg-background text-foreground',
      );
      expect(buttonVariants({ variant: 'ghost' })).toContain('hover:bg-accent');
      expect(buttonVariants({ variant: 'destructive' })).toContain(
         'bg-destructive text-destructive-foreground',
      );
   });

   it('maps each size to its height', () => {
      expect(buttonVariants({ size: 'sm' })).toContain('h-8');
      expect(buttonVariants({ size: 'default' })).toContain('h-9');
      expect(buttonVariants({ size: 'lg' })).toContain('h-10');
      expect(buttonVariants({ size: 'icon' })).toContain('size-9');
   });

   it('falls back to the default variant and size', () => {
      const classes = buttonVariants();

      expect(classes).toContain('bg-primary text-primary-foreground');
      expect(classes).toContain('h-9');
   });
});

describe('badgeVariants', () => {
   it('maps each status variant to a verified token pair', () => {
      expect(badgeVariants({ variant: 'default' })).toContain('bg-primary text-primary-foreground');
      expect(badgeVariants({ variant: 'secondary' })).toContain(
         'bg-secondary text-secondary-foreground',
      );
      expect(badgeVariants({ variant: 'outline' })).toContain('border-border bg-transparent');
      expect(badgeVariants({ variant: 'success' })).toContain('bg-success text-success-foreground');
      expect(badgeVariants({ variant: 'warning' })).toContain('bg-warning text-warning-foreground');
      expect(badgeVariants({ variant: 'destructive' })).toContain(
         'bg-destructive text-destructive-foreground',
      );
   });
});

describe('alertVariants', () => {
   it('maps each variant to its surface tokens', () => {
      expect(alertVariants({ variant: 'default' })).toContain('border-border bg-card');
      expect(alertVariants({ variant: 'destructive' })).toContain(
         'bg-destructive text-destructive-foreground',
      );
      expect(alertVariants({ variant: 'warning' })).toContain('bg-warning text-warning-foreground');
      expect(alertVariants({ variant: 'success' })).toContain('bg-success text-success-foreground');
   });
});
