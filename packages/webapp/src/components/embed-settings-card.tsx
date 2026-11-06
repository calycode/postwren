import { useEffect, useState } from 'react';
import { Plus, ShieldAlert, Trash2 } from 'lucide-react';
import {
   Alert,
   AlertDescription,
   AlertTitle,
   Button,
   Card,
   CardContent,
   CardDescription,
   CardHeader,
   CardTitle,
   Field,
   Input,
   Separator,
} from '@postwren/ui';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { getEmbedOrigins, updateEmbedOrigins } from '@/lib/api/settings';
import { errorMessage } from '@/lib/form-errors';

export function EmbedSettingsCard() {
   const [origins, setOrigins] = useState<string[]>([]);
   const [loading, setLoading] = useState(true);
   const [loadError, setLoadError] = useState<string | null>(null);
   const [actionError, setActionError] = useState<string | null>(null);
   const [reloadKey, setReloadKey] = useState(0);

   const [originInput, setOriginInput] = useState('');
   const [formError, setFormError] = useState<string | null>(null);
   const [busy, setBusy] = useState(false);

   const [pendingOrigin, setPendingOrigin] = useState<string | null>(null);
   const [dialogError, setDialogError] = useState<string | null>(null);

   useEffect(() => {
      let cancelled = false;
      setLoading(true);
      setLoadError(null);

      getEmbedOrigins()
         .then((result) => {
            if (!cancelled) setOrigins(result.origins);
         })
         .catch((cause: unknown) => {
            if (!cancelled)
               setLoadError(errorMessage(cause, 'Could not load the iframe embedding policy'));
         })
         .finally(() => {
            if (!cancelled) setLoading(false);
         });

      return () => {
         cancelled = true;
      };
   }, [reloadKey]);

   function requestOrigin(event: Event) {
      event.preventDefault();
      setFormError(null);

      const origin = originInput.trim();
      if (origin.length === 0) {
         setFormError('Enter an origin.');
         return;
      }

      if (origins.includes(origin)) {
         setFormError('That origin is already allowed.');
         return;
      }

      setDialogError(null);
      setPendingOrigin(origin);
   }

   async function allowOrigin() {
      if (pendingOrigin === null) return;

      setBusy(true);
      setDialogError(null);
      setActionError(null);
      try {
         const result = await updateEmbedOrigins([...origins, pendingOrigin]);
         setOrigins(result.origins);
         setOriginInput('');
         setPendingOrigin(null);
      } catch (cause) {
         setDialogError(errorMessage(cause, 'Could not allow that origin'));
      } finally {
         setBusy(false);
      }
   }

   async function removeOrigin(origin: string) {
      setBusy(true);
      setActionError(null);
      try {
         const result = await updateEmbedOrigins(origins.filter((entry) => entry !== origin));
         setOrigins(result.origins);
      } catch (cause) {
         setActionError(errorMessage(cause, 'Could not remove that origin'));
      } finally {
         setBusy(false);
      }
   }

   return (
      <>
         <Card>
            <CardHeader>
               <CardTitle>Iframe embedding</CardTitle>
               <CardDescription>
                  Choose which external sites may embed this admin app in an iframe. Every other
                  origin is refused with{' '}
                  <code className="rounded bg-muted px-1 py-0.5">frame-ancestors</code>.
               </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-5">
               <Alert variant="warning">
                  <ShieldAlert aria-hidden="true" />
                  <AlertTitle>Framing lets another page control this UI</AlertTitle>
                  <AlertDescription>
                     <p>
                        A site in this list can place Postwren inside its own page and overlay or
                        disguise controls. A signed-in owner can then be tricked into sending a
                        campaign, changing a sender, or creating an API key. Only add origins you
                        control, and remove them as soon as you no longer need the embed.
                     </p>
                  </AlertDescription>
               </Alert>

               {actionError !== null && (
                  <Alert variant="destructive">
                     <AlertDescription>{actionError}</AlertDescription>
                  </Alert>
               )}

               {loading ? (
                  <p className="text-sm text-muted-foreground">Loading embedding policy…</p>
               ) : loadError !== null ? (
                  <Alert variant="destructive">
                     <AlertTitle>Could not load the embedding policy</AlertTitle>
                     <AlertDescription>
                        <p>{loadError}</p>
                        <Button
                           variant="outline"
                           size="sm"
                           className="mt-3"
                           onClick={() => setReloadKey((key) => key + 1)}
                        >
                           Try again
                        </Button>
                     </AlertDescription>
                  </Alert>
               ) : (
                  <>
                     {origins.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                           No external origins are allowed. Only this Worker's own origin can frame
                           the admin app.
                        </p>
                     ) : (
                        <ul className="grid gap-2">
                           {origins.map((origin) => (
                              <li
                                 key={origin}
                                 className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-center sm:justify-between"
                              >
                                 <code className="min-w-0 truncate text-sm">{origin}</code>
                                 <Button
                                    variant="ghost"
                                    size="icon"
                                    className="text-destructive hover:text-destructive"
                                    aria-label={`Stop allowing ${origin} to embed Postwren`}
                                    disabled={busy}
                                    onClick={() => void removeOrigin(origin)}
                                 >
                                    <Trash2 aria-hidden="true" />
                                 </Button>
                              </li>
                           ))}
                        </ul>
                     )}

                     <div className="grid gap-1">
                        <span className="text-xs font-medium text-muted-foreground">
                           Response header
                        </span>
                        <code className="min-w-0 overflow-x-auto rounded bg-muted px-2 py-1 text-xs">
                           Content-Security-Policy:{' '}
                           {origins.length === 0
                              ? "frame-ancestors 'self'"
                              : `frame-ancestors 'self' ${origins.join(' ')}`}
                        </code>
                     </div>

                     <Separator />

                     <form
                        className="grid max-w-xl gap-3"
                        onSubmit={requestOrigin}
                        noValidate
                     >
                        <h3 className="text-sm font-medium">Allow an origin</h3>
                        <Field
                           label="Origin"
                           htmlFor="embed-origin"
                           error={formError ?? undefined}
                           hint="Exact origin only: scheme, host, and optional port. No paths or wildcards; a trailing slash is ignored."
                        >
                           <Input
                              id="embed-origin"
                              value={originInput}
                              placeholder="https://cms.example.com"
                              autoComplete="off"
                              spellcheck={false}
                              onInput={(event) => setOriginInput(event.currentTarget.value)}
                           />
                        </Field>
                        <div>
                           <Button
                              type="submit"
                              disabled={busy}
                           >
                              <Plus aria-hidden="true" />
                              {busy ? 'Saving…' : 'Allow origin'}
                           </Button>
                        </div>
                     </form>

                     <p className="text-xs text-muted-foreground">
                        The embedded app still uses its own sign-in. Browsers only send its session
                        cookie inside the iframe when the embedding site and this Worker are on the
                        same registrable domain; cross-site iframes may stay signed out.
                     </p>
                  </>
               )}
            </CardContent>
         </Card>

         <ConfirmDialog
            open={pendingOrigin !== null}
            onOpenChange={(open) => {
               if (!open) {
                  setPendingOrigin(null);
                  setDialogError(null);
               }
            }}
            title="Allow iframe embedding?"
            description={
               pendingOrigin !== null
                  ? `${pendingOrigin} will be able to embed this admin app. A page on that origin can overlay or disguise controls and trick a signed-in owner into sending a campaign, changing a sender, or creating an API key. Only continue if you control that origin.`
                  : ''
            }
            confirmLabel="Allow origin"
            loading={busy}
            error={dialogError}
            onConfirm={allowOrigin}
         />
      </>
   );
}
