import type { ComponentChildren } from 'preact';
import { useEffect } from 'react';
import { useLocation } from 'preact-iso';
import { Skeleton } from '@mailer/ui';
import { useAuth } from '@/lib/auth';

export function RequireAuth({ children }: { children: ComponentChildren }) {
   const { status } = useAuth();
   const { url, route } = useLocation();

   useEffect(() => {
      if (status === 'signed-out') {
         route(`/login?next=${encodeURIComponent(url)}`);
      }
   }, [status, url, route]);

   if (status === 'loading') {
      return (
         <div className="mx-auto grid w-full max-w-5xl gap-4 p-6">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-full max-w-md" />
            <Skeleton className="h-64 w-full" />
         </div>
      );
   }

   if (status === 'signed-out') return null;
   return <>{children}</>;
}
