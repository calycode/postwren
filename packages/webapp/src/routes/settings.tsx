import { useEffect, useState } from 'react';
import { AlertTriangle, Info, Mail, Plus, Trash2 } from 'lucide-react';
import {
   Alert,
   AlertDescription,
   AlertTitle,
   Badge,
   Button,
   Card,
   CardContent,
   CardDescription,
   CardHeader,
   CardTitle,
   Field,
   Input,
   Separator,
} from '@mailer/ui';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { PageHeader } from '@/components/page-header';
import { API_BASE_URL, ApiError } from '@/lib/api/client';
import { createSender, listSenders, removeSender, updateSender } from '@/lib/api/settings';
import type { SenderAddress, SenderSettings } from '@/lib/api/types';
import { errorMessage, fieldErrorsFrom, isEmail } from '@/lib/form-errors';
import type { FieldErrors } from '@/lib/form-errors';
import { formatDate } from '@/lib/format';
import { groupByDomain, isOnlySender } from '@/lib/senders';

export function Settings() {
   const environment = import.meta.env.PROD ? 'production' : 'development';

   const [settings, setSettings] = useState<SenderSettings | null>(null);
   const [loading, setLoading] = useState(true);
   const [loadError, setLoadError] = useState<string | null>(null);
   const [reloadKey, setReloadKey] = useState(0);

   const [actionError, setActionError] = useState<string | null>(null);
   const [busyId, setBusyId] = useState<string | null>(null);

   const [email, setEmail] = useState('');
   const [name, setName] = useState('');
   const [creating, setCreating] = useState(false);
   const [createError, setCreateError] = useState<string | null>(null);
   const [createErrors, setCreateErrors] = useState<FieldErrors>({});

   const [deleting, setDeleting] = useState<SenderAddress | null>(null);
   const [deleteBusy, setDeleteBusy] = useState(false);
   const [deleteError, setDeleteError] = useState<string | null>(null);

   useEffect(() => {
      let cancelled = false;
      setLoading(true);
      setLoadError(null);

      listSenders()
         .then((result) => {
            if (!cancelled) setSettings(result);
         })
         .catch((cause: unknown) => {
            if (!cancelled) setLoadError(errorMessage(cause, 'Could not load sender addresses'));
         })
         .finally(() => {
            if (!cancelled) setLoading(false);
         });

      return () => {
         cancelled = true;
      };
   }, [reloadKey]);

   function reload() {
      setReloadKey((key) => key + 1);
   }

   async function submitAddress(event: Event) {
      event.preventDefault();
      setCreateError(null);
      setCreateErrors({});

      const trimmedEmail = email.trim();
      const trimmedName = name.trim();
      const nextErrors: FieldErrors = {};

      if (!isEmail(trimmedEmail)) nextErrors.email = 'Enter a valid email address.';
      if (trimmedName.length > 100)
         nextErrors.name = 'Display name must be 100 characters or fewer.';

      if (Object.keys(nextErrors).length > 0) {
         setCreateErrors(nextErrors);
         return;
      }

      setCreating(true);
      try {
         await createSender({
            email: trimmedEmail,
            ...(trimmedName.length > 0 ? { name: trimmedName } : {}),
         });
         setEmail('');
         setName('');
         reload();
      } catch (cause) {
         setCreateError(errorMessage(cause, 'Could not add the sender address'));
         setCreateErrors(cause instanceof ApiError ? fieldErrorsFrom(cause.details) : {});
      } finally {
         setCreating(false);
      }
   }

   async function makeDefault(address: SenderAddress) {
      setActionError(null);
      setBusyId(address.id);
      try {
         await updateSender(address.id, { isDefault: true });
         reload();
      } catch (cause) {
         setActionError(errorMessage(cause, 'Could not change the default sender'));
      } finally {
         setBusyId(null);
      }
   }

   async function toggleVerified(address: SenderAddress) {
      setActionError(null);
      setBusyId(address.id);
      try {
         await updateSender(address.id, { verified: address.verified_at === null });
         reload();
      } catch (cause) {
         setActionError(errorMessage(cause, 'Could not update the verification state'));
      } finally {
         setBusyId(null);
      }
   }

   async function confirmDelete() {
      if (!deleting) return;
      setDeleteBusy(true);
      setDeleteError(null);
      try {
         await removeSender(deleting.id);
         setDeleting(null);
         reload();
      } catch (cause) {
         setDeleteError(errorMessage(cause, 'Could not delete the sender address'));
      } finally {
         setDeleteBusy(false);
      }
   }

   const addresses = settings?.addresses ?? [];
   const groups = groupByDomain(addresses, settings?.domains ?? []);

   return (
      <div className="grid max-w-4xl gap-6">
         <PageHeader
            title="Settings"
            description="Choose which verified sender addresses campaigns may use. Domains are verified in Cloudflare, not here."
         />

         <Alert>
            <Info aria-hidden="true" />
            <AlertTitle>Domains are onboarded in Cloudflare</AlertTitle>
            <AlertDescription>
               <p>
                  Add your domain and set up DKIM and SPF in the Cloudflare dashboard under Email
                  Service. This screen only manages which of those verified domains and addresses
                  campaigns may send from. It does not verify anything itself.
               </p>
            </AlertDescription>
         </Alert>

         <Card>
            <CardHeader>
               <CardTitle>Sending domains</CardTitle>
               <CardDescription>
                  Addresses must be verified before a campaign can use them. Exactly one address is
                  the workspace default.
               </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-5">
               {actionError !== null && (
                  <Alert variant="destructive">
                     <AlertDescription>{actionError}</AlertDescription>
                  </Alert>
               )}

               {loading ? (
                  <p className="text-sm text-muted-foreground">Loading sender addresses…</p>
               ) : loadError !== null ? (
                  <Alert variant="destructive">
                     <AlertTitle>Could not load sender addresses</AlertTitle>
                     <AlertDescription>
                        <p>{loadError}</p>
                        <Button
                           variant="outline"
                           size="sm"
                           className="mt-3"
                           onClick={reload}
                        >
                           Try again
                        </Button>
                     </AlertDescription>
                  </Alert>
               ) : groups.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                     No sender addresses yet. Add one below.
                  </p>
               ) : (
                  <div className="grid gap-6">
                     {groups.map((group) => (
                        <section
                           key={group.domain}
                           className="grid gap-2"
                        >
                           <div className="flex flex-wrap items-center justify-between gap-2">
                              <h3 className="flex items-center gap-2 text-sm font-medium">
                                 <Mail
                                    className="size-4 text-muted-foreground"
                                    aria-hidden="true"
                                 />
                                 {group.domain}
                              </h3>
                              <span className="text-xs text-muted-foreground">
                                 {group.addresses.length}{' '}
                                 {group.addresses.length === 1 ? 'address' : 'addresses'}
                              </span>
                           </div>

                           <ul className="grid gap-2">
                              {group.addresses.map((address) => {
                                 const busy = busyId === address.id || creating;
                                 const verified = address.verified_at !== null;
                                 const deleteBlocked = isOnlySender(address, addresses.length);

                                 return (
                                    <li
                                       key={address.id}
                                       className="flex flex-col gap-3 rounded-lg border border-border p-3 sm:flex-row sm:items-center sm:justify-between"
                                    >
                                       <div className="grid min-w-0 gap-1">
                                          <div className="flex flex-wrap items-center gap-2">
                                             <span className="truncate font-medium">
                                                {address.email}
                                             </span>
                                             <Badge variant={verified ? 'success' : 'warning'}>
                                                {verified ? 'Verified' : 'Pending'}
                                             </Badge>
                                             {address.is_default === 1 && (
                                                <Badge variant="secondary">Default</Badge>
                                             )}
                                          </div>
                                          <span className="text-xs text-muted-foreground">
                                             {address.name.trim().length > 0
                                                ? address.name
                                                : 'No display name'}{' '}
                                             · added {formatDate(address.created_at)}
                                          </span>
                                       </div>

                                       <div className="flex flex-wrap items-center gap-2">
                                          <label className="inline-flex items-center gap-1.5 text-xs font-medium">
                                             <input
                                                type="radio"
                                                name="default-sender"
                                                className="size-4 accent-primary"
                                                checked={address.is_default === 1}
                                                disabled={busy || address.is_default === 1}
                                                onChange={() => void makeDefault(address)}
                                             />
                                             Default
                                          </label>

                                          <Button
                                             variant="outline"
                                             size="sm"
                                             disabled={busy}
                                             title="Record the verification status you set in Cloudflare"
                                             onClick={() => void toggleVerified(address)}
                                          >
                                             {verified ? 'Record pending' : 'Record verified'}
                                          </Button>

                                          <Button
                                             variant="ghost"
                                             size="icon"
                                             className="text-destructive hover:text-destructive"
                                             aria-label={`Delete ${address.email}`}
                                             disabled={busy || deleteBlocked}
                                             title={
                                                deleteBlocked
                                                   ? 'The default and last addresses cannot be deleted'
                                                   : undefined
                                             }
                                             onClick={() => {
                                                setDeleting(address);
                                                setDeleteError(null);
                                             }}
                                          >
                                             <Trash2 aria-hidden="true" />
                                          </Button>
                                       </div>
                                    </li>
                                 );
                              })}
                           </ul>
                        </section>
                     ))}
                  </div>
               )}

               <Separator />

               <form
                  className="grid max-w-xl gap-3"
                  onSubmit={submitAddress}
                  noValidate
               >
                  <h3 className="text-sm font-medium">Add address</h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                     <Field
                        label="Email address"
                        htmlFor="sender-email"
                        error={createErrors.email}
                        required
                     >
                        <Input
                           id="sender-email"
                           type="email"
                           autoComplete="email"
                           value={email}
                           placeholder="news@yourdomain.com"
                           aria-invalid={createErrors.email ? 'true' : undefined}
                           aria-describedby={createErrors.email ? 'sender-email-error' : undefined}
                           onInput={(event) => setEmail(event.currentTarget.value)}
                        />
                     </Field>

                     <Field
                        label="Display name"
                        htmlFor="sender-name"
                        error={createErrors.name}
                        hint="Optional. Shown next to the address in inboxes."
                     >
                        <Input
                           id="sender-name"
                           autoComplete="organization"
                           value={name}
                           placeholder="Example News"
                           aria-invalid={createErrors.name ? 'true' : undefined}
                           aria-describedby={createErrors.name ? 'sender-name-error' : undefined}
                           onInput={(event) => setName(event.currentTarget.value)}
                        />
                     </Field>
                  </div>

                  {createError !== null && (
                     <Alert variant="destructive">
                        <AlertDescription>{createError}</AlertDescription>
                     </Alert>
                  )}

                  <div>
                     <Button
                        type="submit"
                        disabled={creating}
                     >
                        <Plus aria-hidden="true" />
                        {creating ? 'Adding…' : 'Add address'}
                     </Button>
                  </div>
               </form>
            </CardContent>
         </Card>

         <Card>
            <CardHeader>
               <CardTitle>Environment</CardTitle>
               <CardDescription>What this browser bundle is talking to.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm">
               <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-muted-foreground">Frontend mode</span>
                  <Badge variant={environment === 'production' ? 'success' : 'secondary'}>
                     {environment}
                  </Badge>
               </div>
               <Separator />
               <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-muted-foreground">API base URL</span>
                  <code className="rounded bg-muted px-2 py-1 text-xs">
                     {API_BASE_URL.length > 0 ? API_BASE_URL : 'same origin'}
                  </code>
               </div>
            </CardContent>
         </Card>

         <Card className="border-destructive/40">
            <CardHeader>
               <CardTitle className="flex items-center gap-2 text-destructive">
                  <AlertTriangle
                     className="size-4"
                     aria-hidden="true"
                  />
                  Danger zone
               </CardTitle>
               <CardDescription>
                  Destructive workspace actions are not wired in this wave. Nothing here can run
                  yet.
               </CardDescription>
            </CardHeader>
            <CardContent>
               <Button
                  variant="destructive"
                  disabled
                  title="Not available in this wave"
               >
                  Delete all subscribers
               </Button>
            </CardContent>
         </Card>

         <ConfirmDialog
            open={deleting !== null}
            onOpenChange={(open) => {
               if (!open) setDeleting(null);
            }}
            title="Delete sender address"
            description={
               deleting !== null
                  ? `Delete ${deleting.email}? Campaigns can no longer send from it.`
                  : ''
            }
            confirmLabel="Delete address"
            destructive
            loading={deleteBusy}
            error={deleteError}
            onConfirm={confirmDelete}
         />
      </div>
   );
}
