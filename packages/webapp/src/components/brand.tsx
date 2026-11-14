import { cn } from '@postwren/ui';

const SOURCES = {
   mark: '/brand/postwren-mark.png',
   wordmark: '/brand/postwren-wordmark.png',
} as const;

type BrandLogoProps = {
   /** The square-ish bird mark, or the stacked `postwren.` lockup. */
   variant?: keyof typeof SOURCES;
   className?: string;
   /** Pass a name where the logo is the only label; the default hides it from assistive tech. */
   alt?: string;
};

/** Wordmark and mark share one intrinsic aspect ratio; height alone sizes both. */
export function BrandLogo({ variant = 'wordmark', className, alt = '' }: BrandLogoProps) {
   return (
      <img
         src={SOURCES[variant]}
         alt={alt}
         draggable={false}
         className={cn('w-auto max-w-full shrink-0 select-none', className)}
      />
   );
}
