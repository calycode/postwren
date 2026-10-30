import { useEffect, useState } from 'react';
import { useLocation } from 'preact-iso';
import { Mail } from 'lucide-react';
import {
   Alert,
   AlertDescription,
   Button,
   Card,
   CardContent,
   CardDescription,
   CardHeader,
   CardTitle,
   Field,
   Input,
} from '@postwren/ui';
import { requestMagicLink, verify } from '@/lib/api/auth';
import { ApiError } from '@/lib/api/client';
import { useAuth } from '@/lib/auth';
import { errorMessage, fieldErrorsFrom, isEmail } from '@/lib/form-errors';
import type { FieldErrors } from '@/lib/form-errors';

function safeNext(raw: string | undefined): string {
   if (raw && raw.startsWith('/') && !raw.startsWith('//') && !raw.startsWith('/login')) return raw;
   return '/subscribers';
}

const APP_PATH_PREFIXES = ['/subscribers', '/tags', '/templates', '/campaigns', '/settings'];

function isAppPath(path: string): boolean {
   const pathname = path.split('?')[0] ?? '';
   return (
      pathname === '/' ||
      APP_PATH_PREFIXES.some((base) => pathname === base || pathname.startsWith(`${base}/`))
   );
}

/**
 * Server-rendered routes such as the OAuth consent page are outside the SPA
 * router. Escape to a full navigation for those instead of showing NotFound.
 */
function goTo(route: (path: string) => void, next: string): void {
   if (isAppPath(next)) route(next);
   else window.location.assign(next);
}

export function Login() {
   const { query, route } = useLocation();
   const { status, refresh } = useAuth();
   const next = safeNext(query.next);

   const [email, setEmail] = useState('');
   const [phase, setPhase] = useState<'email' | 'sent'>('email');
   const [devToken, setDevToken] = useState<string | null>(null);
   const [busy, setBusy] = useState(false);
   const [error, setError] = useState<string | null>(null);
   const [errors, setErrors] = useState<FieldErrors>({});

   useEffect(() => {
      if (status === 'signed-in') goTo(route, next);
   }, [status, next, route]);

   useEffect(() => {
      const token = typeof query.token === 'string' ? query.token : '';
      if (token.length === 0 || status !== 'signed-out') return;

      let cancelled = false;
      setBusy(true);
      setError(null);

      verify(token)
         .then(async () => {
            if (cancelled) return;
            await refresh();
            goTo(route, next);
         })
         .catch((cause: unknown) => {
            if (!cancelled)
               setError(errorMessage(cause, 'This sign-in link is invalid or has expired.'));
         })
         .finally(() => {
            if (!cancelled) setBusy(false);
         });

      return () => {
         cancelled = true;
      };
   }, [query.token, status, next, route, refresh]);

   async function submit(event: Event) {
      event.preventDefault();
      setError(null);
      setErrors({});

      if (!isEmail(email)) {
         setErrors({ email: 'Enter a valid email address.' });
         return;
      }

      setBusy(true);
      try {
         const result = await requestMagicLink(email.trim());
         setDevToken(result.devToken ?? null);
         setPhase('sent');
      } catch (cause) {
         setError(errorMessage(cause, 'Could not send the sign-in link'));
         setErrors(cause instanceof ApiError ? fieldErrorsFrom(cause.details) : {});
      } finally {
         setBusy(false);
      }
   }

   async function signInWithDevToken(token: string) {
      setBusy(true);
      setError(null);
      try {
         await verify(token);
         await refresh();
         goTo(route, next);
      } catch (cause) {
         setError(errorMessage(cause, 'Could not verify the sign-in link'));
      } finally {
         setBusy(false);
      }
   }

   return (
      <main className="flex min-h-dvh items-center justify-center bg-background p-4 text-foreground">
         <Card className="w-full max-w-md">
            <CardHeader>
               <div className="mb-2 flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <Mail
                     className="size-5"
                     aria-hidden="true"
                  />
               </div>
               <CardTitle>
                  {phase === 'sent' ? 'Check your email' : 'Sign in to Postwren'}
               </CardTitle>
               <CardDescription>
                  {phase === 'sent'
                     ? `We sent a sign-in link to ${email.trim()}. Open it to continue.`
                     : 'Enter your email address and we will send you a magic sign-in link.'}
               </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
               {phase === 'email' ? (
                  <form
                     className="grid gap-4"
                     onSubmit={submit}
                     noValidate
                  >
                     <Field
                        label="Email address"
                        htmlFor="login-email"
                        error={errors.email}
                        required
                     >
                        <Input
                           id="login-email"
                           type="email"
                           autoComplete="email"
                           autoFocus
                           value={email}
                           aria-invalid={errors.email ? 'true' : undefined}
                           aria-describedby={errors.email ? 'login-email-error' : undefined}
                           onInput={(event) => setEmail(event.currentTarget.value)}
                        />
                     </Field>

                     {error !== null && (
                        <Alert variant="destructive">
                           <AlertDescription>{error}</AlertDescription>
                        </Alert>
                     )}

                     <Button
                        type="submit"
                        disabled={busy}
                        className="w-full"
                     >
                        {busy ? 'Sending…' : 'Send link'}
                     </Button>
                  </form>
               ) : (
                  <div className="grid gap-4">
                     {error !== null && (
                        <Alert variant="destructive">
                           <AlertDescription>{error}</AlertDescription>
                        </Alert>
                     )}

                     {devToken !== null && (
                        <div className="grid gap-2 rounded-lg border border-warning bg-warning p-3 text-sm text-warning-foreground">
                           <p className="font-medium">Development mode</p>
                           <p>Use a direct sign-in token instead of opening your email.</p>
                           <Button
                              variant="outline"
                              disabled={busy}
                              onClick={() => void signInWithDevToken(devToken)}
                           >
                              {busy ? 'Signing in…' : 'Sign in (dev)'}
                           </Button>
                        </div>
                     )}

                     <Button
                        variant="ghost"
                        disabled={busy}
                        onClick={() => {
                           setPhase('email');
                           setDevToken(null);
                           setError(null);
                        }}
                     >
                        Use a different email
                     </Button>
                  </div>
               )}
            </CardContent>
         </Card>
      </main>
   );
}
