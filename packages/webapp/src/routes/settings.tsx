import { useEffect, useState } from 'react';
import { CloudDownload, Info, Mail, Plus, Trash2 } from 'lucide-react';
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
   Tabs,
   TabsContent,
   TabsList,
   TabsTrigger,
   cn,
} from '@postwren/ui';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { EmbedSettingsCard } from '@/components/embed-settings-card';
import { ApiKeysCard } from '@/components/api-keys-card';
import { ApiQuickstartCard } from '@/components/api-quickstart-card';
import { PageHeader } from '@/components/page-header';
import { API_BASE_URL, ApiError } from '@/lib/api/client';
import {
   cloudflareStatus,
   createSender,
   discoverSenders,
   listSenders,
   removeSender,
   updateSender,
   verifySender,
} from '@/lib/api/settings';
import {
   create as createSubscribeKey,
   list as listSubscribeKeys,
   remove as removeSubscribeKey,
   revoke as revokeSubscribeKey,
} from '@/lib/api/subscribe-keys';
import type { SenderAddress, SenderSettings, SubscribeKey } from '@/lib/api/types';
import type { DiscoveredDomain } from '@/lib/api/types';
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

   const [discovery, setDiscovery] = useState<{
      configured: boolean;
      domains: DiscoveredDomain[];
   } | null>(null);
   const [discoverBusy, setDiscoverBusy] = useState(false);
   const [discoverError, setDiscoverError] = useState<string | null>(null);
   const [discoveredBusyId, setDiscoveredBusyId] = useState<string | null>(null);
   const [cloudflareConfigured, setCloudflareConfigured] = useState<boolean | null>(null);
   const [verifyingId, setVerifyingId] = useState<string | null>(null);
   const [verification, setVerification] = useState<
      Record<string, { verified: boolean; detail: string }>
   >({});

   const [keys, setKeys] = useState<SubscribeKey[]>([]);
   const [keysLoading, setKeysLoading] = useState(true);
   const [keysError, setKeysError] = useState<string | null>(null);
   const [keysReloadKey, setKeysReloadKey] = useState(0);
   const [keyName, setKeyName] = useState('');
   const [keyOrigins, setKeyOrigins] = useState('');
   const [keyTags, setKeyTags] = useState('');
   const [keyBusy, setKeyBusy] = useState(false);
   const [keyFormError, setKeyFormError] = useState<string | null>(null);
   const [newSecret, setNewSecret] = useState<string | null>(null);
   const [revoking, setRevoking] = useState<string | null>(null);
   const [deletingKey, setDeletingKey] = useState<SubscribeKey | null>(null);
   const [deleteKeyBusy, setDeleteKeyBusy] = useState(false);
   const [deleteKeyError, setDeleteKeyError] = useState<string | null>(null);
   const [keyActionError, setKeyActionError] = useState<string | null>(null);

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

   useEffect(() => {
      let cancelled = false;
      cloudflareStatus()
         .then((result) => {
            if (!cancelled) setCloudflareConfigured(result.configured);
         })
         .catch(() => {
            if (!cancelled) setCloudflareConfigured(false);
         });

      return () => {
         cancelled = true;
      };
   }, []);

   useEffect(() => {
      let cancelled = false;
      setKeysLoading(true);
      setKeysError(null);

      listSubscribeKeys()
         .then((result) => {
            if (!cancelled) setKeys(result);
         })
         .catch((cause: unknown) => {
            if (!cancelled) setKeysError(errorMessage(cause, 'Could not load subscribe keys'));
         })
         .finally(() => {
            if (!cancelled) setKeysLoading(false);
         });

      return () => {
         cancelled = true;
      };
   }, [keysReloadKey]);

   function parseList(value: string): string[] {
      return [
         ...new Set(
            value
               .split(/[\s,]+/)
               .map((entry) => entry.trim())
               .filter((entry) => entry.length > 0),
         ),
      ];
   }

   async function submitKey(event: Event) {
      event.preventDefault();
      setKeyFormError(null);
      setNewSecret(null);

      const name = keyName.trim();
      if (name.length === 0) {
         setKeyFormError('Enter a name for the key.');
         return;
      }

      setKeyBusy(true);
      try {
         const created = await createSubscribeKey({
            name,
            allowedOrigins: parseList(keyOrigins),
            defaultTags: parseList(keyTags).map((tag) => tag.toLowerCase()),
         });
         setNewSecret(created.key ?? null);
         setKeyName('');
         setKeyOrigins('');
         setKeyTags('');
         setKeysReloadKey((key) => key + 1);
      } catch (cause) {
         setKeyFormError(errorMessage(cause, 'Could not create the subscribe key'));
      } finally {
         setKeyBusy(false);
      }
   }

   async function revokeKey(id: string) {
      setKeyActionError(null);
      setRevoking(id);
      try {
         await revokeSubscribeKey(id);
         setKeysReloadKey((key) => key + 1);
      } catch (cause) {
         setKeyActionError(errorMessage(cause, 'Could not revoke the subscribe key'));
      } finally {
         setRevoking(null);
      }
   }

   async function confirmDeleteKey() {
      if (deletingKey === null) return;
      setDeleteKeyBusy(true);
      setDeleteKeyError(null);
      try {
         await removeSubscribeKey(deletingKey.id);
         setDeletingKey(null);
         setKeysReloadKey((key) => key + 1);
      } catch (cause) {
         setDeleteKeyError(errorMessage(cause, 'Could not delete the subscribe key'));
      } finally {
         setDeleteKeyBusy(false);
      }
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

   async function discoverFromCloudflare() {
      setDiscoverBusy(true);
      setDiscoverError(null);
      try {
         setDiscovery(await discoverSenders());
      } catch (cause) {
         setDiscoverError(errorMessage(cause, 'Could not reach Cloudflare'));
      } finally {
         setDiscoverBusy(false);
      }
   }

   async function checkVerification(address: SenderAddress) {
      setVerifyingId(address.id);
      setActionError(null);
      try {
         const result = await verifySender(address.id);
         setVerification((current) => ({
            ...current,
            [address.id]: { verified: result.verified, detail: result.detail },
         }));
         reload();
      } catch (cause) {
         setVerification((current) => ({
            ...current,
            [address.id]: {
               verified: false,
               detail: errorMessage(cause, 'Could not check verification'),
            },
         }));
      } finally {
         setVerifyingId(null);
      }
   }

   async function addDiscoveredAddress(domain: DiscoveredDomain) {
      setDiscoveredBusyId(domain.id);
      setDiscoverError(null);
      try {
         await createSender({ email: domain.suggestedAddress });
         reload();
      } catch (cause) {
         setDiscoverError(errorMessage(cause, 'Could not add the discovered address'));
      } finally {
         setDiscoveredBusyId(null);
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
   const activeKeys = keys.filter((key) => key.revoked_at === null);
   const revokedKeys = keys.filter((key) => key.revoked_at !== null);

   function renderSubscribeKey(key: SubscribeKey) {
      const revoked = key.revoked_at !== null;

      return (
         <div className="flex flex-col gap-2 rounded-lg border border-border bg-background p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="grid min-w-0 gap-1">
               <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate font-medium">{key.name}</span>
                  <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{key.prefix}…</code>
                  {revoked && <Badge variant="outline">Revoked</Badge>}
               </div>
               <span className="text-xs text-muted-foreground">
                  Origins:{' '}
                  {key.allowed_origins.length > 0
                     ? key.allowed_origins.join(', ')
                     : 'none (server-to-server only)'}
               </span>
               <span className="text-xs text-muted-foreground">
                  Default tags: {key.default_tags.length > 0 ? key.default_tags.join(', ') : 'none'}{' '}
                  · created {formatDate(key.created_at)}
               </span>
            </div>

            {revoked ? (
               <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => {
                     setDeleteKeyError(null);
                     setDeletingKey(key);
                  }}
               >
                  Delete
               </Button>
            ) : (
               <Button
                  variant="outline"
                  size="sm"
                  disabled={revoking === key.id}
                  onClick={() => void revokeKey(key.id)}
               >
                  {revoking === key.id ? 'Revoking…' : 'Revoke'}
               </Button>
            )}
         </div>
      );
   }

   return (
      <div className="grid max-w-4xl gap-6">
         <PageHeader
            title="Settings"
            description="Senders, credentials and embedding for this workspace."
         />

         <Tabs
            defaultValue="sending"
            id="settings-tabs"
            className="gap-6"
         >
            <TabsList className="h-auto w-full flex-wrap justify-start gap-1 p-1 sm:w-fit">
               <TabsTrigger value="sending">Sending</TabsTrigger>
               <TabsTrigger value="audience">Audience</TabsTrigger>
               <TabsTrigger value="api">API</TabsTrigger>
               <TabsTrigger value="embedding">Embedding</TabsTrigger>
               <TabsTrigger value="workspace">Workspace</TabsTrigger>
            </TabsList>

            <TabsContent
               value="sending"
               className="grid gap-6"
            >
               <Alert>
                  <Info aria-hidden="true" />
                  <AlertTitle>Domains are onboarded in Cloudflare</AlertTitle>
                  <AlertDescription>
                     <p>
                        Add your domain and set up DKIM and SPF in the Cloudflare dashboard under
                        Email Service. Onboarding a domain there is what Cloudflare verifies — not
                        individual addresses. Discover and Check verification read your zones and
                        sending domains when a Cloudflare API token is configured, but Cloudflare
                        stays the source of truth.
                     </p>
                  </AlertDescription>
               </Alert>

               <Card data-guide="settings-senders">
                  <CardHeader>
                     <CardTitle>Sending domains</CardTitle>
                     <CardDescription>
                        Addresses must be verified before a campaign can use them. Exactly one
                        address is the workspace default.
                     </CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-5">
                     {actionError !== null && (
                        <Alert variant="destructive">
                           <AlertDescription>{actionError}</AlertDescription>
                        </Alert>
                     )}

                     <div
                        className={cn(
                           'grid gap-3 rounded-lg border border-dashed p-3 transition-colors',
                           cloudflareConfigured === false
                              ? 'border-border bg-muted/20'
                              : 'border-border',
                        )}
                     >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                           <div className="grid gap-0.5">
                              <p className="flex items-center gap-2 text-sm font-medium">
                                 Discover from Cloudflare
                                 {cloudflareConfigured === false && (
                                    <Badge variant="outline">Not configured</Badge>
                                 )}
                                 {cloudflareConfigured === true && (
                                    <Badge variant="success">Token detected</Badge>
                                 )}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                 {cloudflareConfigured === false
                                    ? 'Add a read-only Cloudflare API token to list your zones, check DNS, and confirm Email Sending onboarding.'
                                    : 'List zones, check DNS, and confirm which domains are onboarded for Email Sending.'}
                              </p>
                              {cloudflareConfigured === false && (
                                 <p className="text-xs text-muted-foreground">
                                    Set the{' '}
                                    <code className="rounded bg-muted px-1 py-0.5">
                                       CLOUDFLARE_API_TOKEN
                                    </code>{' '}
                                    secret (Zone Read, DNS Read, Email Sending Read), then reload
                                    this page.
                                 </p>
                              )}
                           </div>
                           <Button
                              variant="outline"
                              size="sm"
                              disabled={discoverBusy || cloudflareConfigured === false}
                              title={
                                 cloudflareConfigured === false
                                    ? 'CLOUDFLARE_API_TOKEN is not set'
                                    : undefined
                              }
                              onClick={() => void discoverFromCloudflare()}
                           >
                              <CloudDownload aria-hidden="true" />
                              {discoverBusy ? 'Checking…' : 'Discover'}
                           </Button>
                        </div>

                        {discoverError !== null && (
                           <p
                              role="alert"
                              className="text-xs text-destructive"
                           >
                              {discoverError}
                           </p>
                        )}

                        {discovery !== null && !discovery.configured && (
                           <p className="text-xs text-muted-foreground">
                              Set{' '}
                              <code className="rounded bg-muted px-1 py-0.5">
                                 CLOUDFLARE_API_TOKEN
                              </code>{' '}
                              to let Postwren list your zones.
                           </p>
                        )}

                        {discovery !== null &&
                           discovery.configured &&
                           discovery.domains.length === 0 && (
                              <p className="text-xs text-muted-foreground">
                                 No zones were returned by Cloudflare.
                              </p>
                           )}

                        {discovery?.configured === true && discovery.domains.length > 0 && (
                           <ul className="grid gap-2">
                              {discovery.domains.map((domain) => {
                                 const already = addresses.some(
                                    (address) => address.email === domain.suggestedAddress,
                                 );
                                 const checks: [string, boolean][] = [
                                    ['MX', domain.mx],
                                    ['SPF', domain.spf],
                                    ['DKIM', domain.dkim],
                                    ['DMARC', domain.dmarc],
                                 ];
                                 return (
                                    <li
                                       key={domain.id}
                                       className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-background px-3 py-2"
                                    >
                                       <span className="min-w-0 flex-1">
                                          <span className="block truncate text-sm font-medium">
                                             {domain.name}
                                          </span>
                                          <span className="mt-1 flex flex-wrap gap-1">
                                             {checks.map(([label, present]) => (
                                                <Badge
                                                   key={String(label)}
                                                   variant={present ? 'success' : 'outline'}
                                                   title={
                                                      present
                                                         ? `${label} found`
                                                         : `${label} missing`
                                                   }
                                                >
                                                   {label}
                                                </Badge>
                                             ))}
                                          </span>
                                       </span>
                                       <Button
                                          variant="outline"
                                          size="sm"
                                          disabled={already || discoveredBusyId === domain.id}
                                          onClick={() => void addDiscoveredAddress(domain)}
                                       >
                                          {already
                                             ? 'Added'
                                             : discoveredBusyId === domain.id
                                               ? 'Adding…'
                                               : `Add ${domain.suggestedAddress}`}
                                       </Button>
                                    </li>
                                 );
                              })}
                           </ul>
                        )}
                     </div>

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
                                       const deleteBlocked = isOnlySender(
                                          address,
                                          addresses.length,
                                       );

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
                                                   <Badge
                                                      variant={verified ? 'success' : 'warning'}
                                                   >
                                                      {verified ? 'Verified' : 'Not verified'}
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
                                                {verification[address.id] !== undefined && (
                                                   <span
                                                      className={cn(
                                                         'text-[11px]',
                                                         verification[address.id]?.verified
                                                            ? 'text-success'
                                                            : 'text-muted-foreground',
                                                      )}
                                                   >
                                                      {verification[address.id]?.detail}
                                                   </span>
                                                )}
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

                                                {cloudflareConfigured === true ? (
                                                   <Button
                                                      variant="outline"
                                                      size="sm"
                                                      disabled={busy || verifyingId === address.id}
                                                      title="Ask Cloudflare whether this domain is onboarded for Email Sending"
                                                      onClick={() =>
                                                         void checkVerification(address)
                                                      }
                                                   >
                                                      {verifyingId === address.id
                                                         ? 'Checking…'
                                                         : 'Check verification'}
                                                   </Button>
                                                ) : (
                                                   <label className="inline-flex items-center gap-1.5 text-xs font-medium">
                                                      <input
                                                         type="checkbox"
                                                         className="size-4 accent-primary"
                                                         checked={verified}
                                                         disabled={busy}
                                                         title="Without a Cloudflare API token Postwren cannot check the domain, so mark it manually."
                                                         onChange={() =>
                                                            void toggleVerified(address)
                                                         }
                                                      />
                                                      Verified manually
                                                   </label>
                                                )}

                                                <Button
                                                   variant="ghost"
                                                   size="icon"
                                                   className="text-muted-foreground hover:text-destructive"
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
                        className="grid gap-4 rounded-lg border border-border bg-muted/20 p-4"
                        onSubmit={submitAddress}
                        noValidate
                     >
                        <div className="grid gap-1">
                           <h3 className="text-sm font-medium">Add a sending address</h3>
                           <p className="text-xs text-muted-foreground">
                              The domain has to be active in Cloudflare Email Service first. New
                              addresses start unverified.
                           </p>
                        </div>
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
                                 aria-describedby={
                                    createErrors.email ? 'sender-email-error' : undefined
                                 }
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
                                 aria-describedby={
                                    createErrors.name ? 'sender-name-error' : undefined
                                 }
                                 onInput={(event) => setName(event.currentTarget.value)}
                              />
                           </Field>
                        </div>

                        {createError !== null && (
                           <Alert variant="destructive">
                              <AlertDescription>{createError}</AlertDescription>
                           </Alert>
                        )}

                        <div className="flex justify-end border-t border-border/70 pt-3">
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
            </TabsContent>

            <TabsContent
               value="audience"
               className="grid gap-6"
            >
               <Card>
                  <CardHeader>
                     <CardTitle>Public subscribe keys</CardTitle>
                     <CardDescription>
                        Publishable <code className="rounded bg-muted px-1 py-0.5">pk_live_…</code>{' '}
                        keys let other sites call{' '}
                        <code className="rounded bg-muted px-1 py-0.5">
                           POST /api/public/subscribe
                        </code>{' '}
                        without a session. The key is shown once.
                     </CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-5">
                     {keyActionError !== null && (
                        <Alert variant="destructive">
                           <AlertDescription>{keyActionError}</AlertDescription>
                        </Alert>
                     )}

                     {keysLoading ? (
                        <p className="text-sm text-muted-foreground">Loading subscribe keys…</p>
                     ) : keysError !== null ? (
                        <Alert variant="destructive">
                           <AlertTitle>Could not load subscribe keys</AlertTitle>
                           <AlertDescription>
                              <p>{keysError}</p>
                              <Button
                                 variant="outline"
                                 size="sm"
                                 className="mt-3"
                                 onClick={() => setKeysReloadKey((key) => key + 1)}
                              >
                                 Try again
                              </Button>
                           </AlertDescription>
                        </Alert>
                     ) : keys.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No subscribe keys yet.</p>
                     ) : (
                        <div className="grid gap-3">
                           {activeKeys.length === 0 ? (
                              <p className="text-sm text-muted-foreground">
                                 No active keys. Revoked keys are kept below for the audit trail.
                              </p>
                           ) : (
                              <ul className="grid gap-2">
                                 {activeKeys.map((key) => (
                                    <li key={key.id}>{renderSubscribeKey(key)}</li>
                                 ))}
                              </ul>
                           )}

                           {revokedKeys.length > 0 && (
                              <details className="group rounded-lg border border-border bg-muted/20">
                                 <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-xs font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
                                    <span>Revoked keys ({revokedKeys.length})</span>
                                    <span className="text-[11px] font-normal">
                                       Kept for the audit trail
                                    </span>
                                 </summary>
                                 <ul className="grid gap-2 border-t border-border p-2">
                                    {revokedKeys.map((key) => (
                                       <li key={key.id}>{renderSubscribeKey(key)}</li>
                                    ))}
                                 </ul>
                              </details>
                           )}
                        </div>
                     )}

                     {newSecret !== null && (
                        <Alert variant="warning">
                           <AlertTitle>Copy this key now</AlertTitle>
                           <AlertDescription>
                              <p>
                                 It is not shown again. Use it as a bearer token on the public
                                 endpoint.
                              </p>
                              <code className="mt-2 block overflow-x-auto rounded bg-muted px-2 py-1 text-xs">
                                 {newSecret}
                              </code>
                           </AlertDescription>
                        </Alert>
                     )}

                     <Separator />

                     <form
                        className="grid max-w-xl gap-3"
                        onSubmit={(event) => void submitKey(event)}
                        noValidate
                     >
                        <h3 className="text-sm font-medium">Create key</h3>
                        <Field
                           label="Name"
                           htmlFor="subscribe-key-name"
                           error={keyFormError ?? undefined}
                           required
                        >
                           <Input
                              id="subscribe-key-name"
                              value={keyName}
                              placeholder="Marketing site"
                              onInput={(event) => setKeyName(event.currentTarget.value)}
                           />
                        </Field>
                        <Field
                           label="Allowed origins"
                           htmlFor="subscribe-key-origins"
                           hint="Comma or space separated, for example https://example.com. Leave empty to block browser calls."
                        >
                           <Input
                              id="subscribe-key-origins"
                              value={keyOrigins}
                              placeholder="https://example.com"
                              onInput={(event) => setKeyOrigins(event.currentTarget.value)}
                           />
                        </Field>
                        <Field
                           label="Default tags"
                           htmlFor="subscribe-key-tags"
                           hint="Every signup through this key receives these tags."
                        >
                           <Input
                              id="subscribe-key-tags"
                              value={keyTags}
                              placeholder="newsletter"
                              onInput={(event) => setKeyTags(event.currentTarget.value)}
                           />
                        </Field>
                        <div>
                           <Button
                              type="submit"
                              disabled={keyBusy}
                           >
                              <Plus aria-hidden="true" />
                              {keyBusy ? 'Creating…' : 'Create subscribe key'}
                           </Button>
                        </div>
                     </form>
                  </CardContent>
               </Card>
            </TabsContent>

            <TabsContent
               value="api"
               className="grid gap-6"
            >
               <ApiKeysCard />
               <ApiQuickstartCard defaultFrom={settings?.defaultFrom ?? ''} />
            </TabsContent>

            <TabsContent
               value="embedding"
               className="grid gap-6"
            >
               <EmbedSettingsCard />
            </TabsContent>

            <TabsContent
               value="workspace"
               className="grid gap-6"
            >
               <details className="rounded-xl border border-border bg-card px-6 py-5">
                  <summary className="cursor-pointer text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring">
                     Environment
                  </summary>
                  <div className="mt-4 grid gap-3 border-t border-border pt-4 text-sm">
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
                  </div>
               </details>
            </TabsContent>
         </Tabs>

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

         <ConfirmDialog
            open={deletingKey !== null}
            onOpenChange={(open) => {
               if (!open) setDeletingKey(null);
            }}
            title="Delete subscribe key"
            description={
               deletingKey === null
                  ? ''
                  : `Delete "${deletingKey.name}" permanently? Its audit entry disappears; sites already stopped working when it was revoked.`
            }
            confirmLabel="Delete key"
            destructive
            loading={deleteKeyBusy}
            error={deleteKeyError}
            onConfirm={confirmDeleteKey}
         />
      </div>
   );
}
