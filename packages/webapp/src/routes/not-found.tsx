import { Compass } from 'lucide-react';
import { buttonVariants, EmptyState } from '@postwren/ui';

export function NotFound() {
   return (
      <main className="flex min-h-dvh items-center justify-center bg-background p-4 text-foreground">
         <div className="w-full max-w-lg">
            <EmptyState
               icon={<Compass aria-hidden="true" />}
               title="Page not found"
               description="The address does not match any screen in the admin app."
               action={
                  <a
                     href="/subscribers"
                     className={buttonVariants()}
                  >
                     Go to subscribers
                  </a>
               }
            />
         </div>
      </main>
   );
}
