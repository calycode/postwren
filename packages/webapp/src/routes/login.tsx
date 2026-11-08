import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'preact-iso';
import { Mail, Send } from 'lucide-react';
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
import { requestMagicLink, verify, verifyCode } from '@/lib/api/auth';
import { ApiError } from '@/lib/api/client';
import { useAuth } from '@/lib/auth';
import { errorMessage, fieldErrorsFrom, isEmail } from '@/lib/form-errors';
import type { FieldErrors } from '@/lib/form-errors';

function safeNext(raw: string | undefined): string {
   if (raw && raw.startsWith('/') && !raw.startsWith('//') && !raw.startsWith('/login')) return raw;
   return '/';
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
   const [code, setCode] = useState('');
   const [devToken, setDevToken] = useState<string | null>(null);
   const [devCode, setDevCode] = useState<string | null>(null);
   const [busy, setBusy] = useState(false);
   const [error, setError] = useState<string | null>(null);
   const [errors, setErrors] = useState<FieldErrors>({});

   const finishSignIn = useCallback(async (): Promise<boolean> => {
      const user = await refresh();
      if (user === null) {
         setError(
            "Signed in, but the session could not be loaded. If this page is inside an iframe, the browser may be blocking Postwren's session cookie; the embedding site and Postwren must share a registrable domain.",
         );
         return false;
      }

      goTo(route, next);
      return true;
   }, [refresh, route, next]);

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
            await finishSignIn();
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
   }, [query.token, status, finishSignIn]);

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
         setDevCode(result.devCode ?? null);
         setCode('');
         setPhase('sent');
      } catch (cause) {
         setError(errorMessage(cause, 'Could not send the sign-in code'));
         setErrors(cause instanceof ApiError ? fieldErrorsFrom(cause.details) : {});
      } finally {
         setBusy(false);
      }
   }

   async function submitCode(event: Event) {
      event.preventDefault();
      setError(null);
      setErrors({});

      const trimmedEmail = email.trim();
      if (!isEmail(trimmedEmail)) {
         setErrors({ email: 'Enter a valid email address.' });
         setPhase('email');
         return;
      }

      if (!/^\d{6}$/.test(code)) {
         setErrors({ code: 'Enter the 6-digit code from the email.' });
         return;
      }

      setBusy(true);
      try {
         await verifyCode(trimmedEmail, code);
         await finishSignIn();
      } catch (cause) {
         setError(errorMessage(cause, 'That code is invalid or has expired.'));
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
         await finishSignIn();
      } catch (cause) {
         setError(errorMessage(cause, 'Could not verify the sign-in link'));
      } finally {
         setBusy(false);
      }
   }

   function resetEmail() {
      setPhase('email');
      setCode('');
      setDevToken(null);
      setDevCode(null);
      setError(null);
      setErrors({});
   }

   return (
      <main className="min-h-dvh bg-background text-foreground lg:grid lg:grid-cols-[1.1fr_1fr]">
         <section className="app-sidebar relative hidden overflow-hidden border-r border-border bg-sidebar lg:flex lg:flex-col lg:justify-between lg:p-12">
            <a
               href="/login"
               className="inline-flex items-center gap-3 text-foreground"
            >
               <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <Send
                     className="size-4"
                     aria-hidden="true"
                  />
               </span>
               <span className="font-display text-2xl font-medium tracking-tight">postwren</span>
            </a>

            <div className="grid max-w-lg gap-6">
               <p className="text-[11px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
                  Self-hosted email marketing
               </p>
               <h1 className="font-display text-5xl leading-[1.05] font-medium tracking-tight">
                  Own the list.
                  <br />
                  Own the send.
               </h1>
               <p className="max-w-md text-base leading-relaxed text-muted-foreground">
                  A visual email editor, tag-based audiences and scheduled campaigns, running on one
                  Cloudflare Worker. Your domain, your data, your sender reputation.
               </p>
            </div>

            <dl className="grid max-w-md gap-3 border-t border-border pt-6 text-sm">
               <div className="flex items-baseline justify-between gap-4">
                  <dt className="text-muted-foreground">Editor preview</dt>
                  <dd className="font-medium">Same render as the send</dd>
               </div>
               <div className="flex items-baseline justify-between gap-4">
                  <dt className="text-muted-foreground">Data</dt>
                  <dd className="font-medium">D1, R2 and Queues in your account</dd>
               </div>
               <div className="flex items-baseline justify-between gap-4">
                  <dt className="text-muted-foreground">Agent access</dt>
                  <dd className="font-medium">Scoped API keys and MCP</dd>
               </div>
            </dl>
         </section>

         <section className="flex min-h-dvh items-center justify-center p-4 sm:p-8">
            <div className="w-full max-w-md">
               <a
                  href="/login"
                  className="mb-6 inline-flex items-center gap-2.5 text-foreground lg:hidden"
               >
                  <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                     <Send
                        className="size-4"
                        aria-hidden="true"
                     />
                  </span>
                  <span className="font-display text-2xl font-medium tracking-tight">postwren</span>
               </a>

               <Card>
                  <CardHeader>
                     <div className="mb-1 flex size-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                        <Mail
                           className="size-5"
                           aria-hidden="true"
                        />
                     </div>
                     <CardTitle className="font-display text-2xl font-medium">
                        {phase === 'sent' ? 'Check your email' : 'Sign in to Postwren'}
                     </CardTitle>
                     <CardDescription>
                        {phase === 'sent'
                           ? `We sent a 6-digit code and a sign-in link to ${email.trim()}. Enter the code below, or open the link on this device.`
                           : 'Enter your email address and we will send a 6-digit sign-in code and a magic link.'}
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
                              {busy ? 'Sending…' : 'Send code'}
                           </Button>
                        </form>
                     ) : (
                        <div className="grid gap-4">
                           <form
                              className="grid gap-4"
                              onSubmit={submitCode}
                              noValidate
                           >
                              <Field
                                 label="6-digit code"
                                 htmlFor="login-code"
                                 error={errors.code}
                                 hint={`Sent to ${email.trim()}.`}
                              >
                                 <Input
                                    id="login-code"
                                    inputMode="numeric"
                                    autoComplete="one-time-code"
                                    pattern="[0-9]*"
                                    maxLength={6}
                                    autoFocus
                                    value={code}
                                    className="text-center font-mono text-lg tracking-[0.35em]"
                                    onInput={(event) =>
                                       setCode(
                                          event.currentTarget.value.replace(/\D/g, '').slice(0, 6),
                                       )
                                    }
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
                                 {busy ? 'Signing in…' : 'Sign in with code'}
                              </Button>
                           </form>

                           {(devCode !== null || devToken !== null) && (
                              <div className="grid gap-2 rounded-lg border border-warning bg-warning p-3 text-sm text-warning-foreground">
                                 <p className="font-medium">Development mode</p>
                                 <p>
                                    No email is sent. Use this code, or sign in with the direct
                                    link.
                                 </p>
                                 {devCode !== null && (
                                    <div className="flex flex-wrap items-center gap-2">
                                       <code className="rounded bg-background/70 px-2 py-1 font-mono text-base tracking-[0.25em]">
                                          {devCode}
                                       </code>
                                       <Button
                                          variant="outline"
                                          size="sm"
                                          disabled={busy}
                                          onClick={() => setCode(devCode)}
                                       >
                                          Use code
                                       </Button>
                                    </div>
                                 )}
                                 {devToken !== null && (
                                    <Button
                                       variant="outline"
                                       size="sm"
                                       disabled={busy}
                                       onClick={() => void signInWithDevToken(devToken)}
                                    >
                                       {busy ? 'Signing in…' : 'Sign in (dev link)'}
                                    </Button>
                                 )}
                              </div>
                           )}

                           <Button
                              variant="ghost"
                              disabled={busy}
                              onClick={resetEmail}
                           >
                              Use a different email
                           </Button>
                        </div>
                     )}
                  </CardContent>
               </Card>

               <p className="mt-4 text-center text-xs text-muted-foreground">
                  One Worker. Your whole list.
               </p>
            </div>
         </section>
      </main>
   );
}
