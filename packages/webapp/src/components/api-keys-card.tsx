import { useEffect, useState } from 'react';
import { Check, Copy, KeyRound, Trash2 } from 'lucide-react';
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
   Checkbox,
   Field,
   Input,
   useToast,
} from '@postwren/ui';
import { ConfirmDialog } from '@/components/confirm-dialog';
import {
   API_KEY_SCOPES,
   create as createKey,
   list as listKeys,
   remove as removeKey,
   revoke as revokeKey,
} from '@/lib/api/api-keys';
import type { ApiKeyScope } from '@/lib/api/api-keys';
import type { ApiKey } from '@/lib/api/types';
import { errorMessage } from '@/lib/form-errors';
import { formatDate, relativeTime } from '@/lib/format';

const DEFAULT_SCOPES: ApiKeyScope[] = [
   'subscribers:read',
   'campaigns:read',
   'templates:read',
   'tags:read',
];

export function ApiKeysCard() {
   const { toast } = useToast();
   const [keys, setKeys] = useState<ApiKey[]>([]);
   const [loading, setLoading] = useState(true);
   const [loadError, setLoadError] = useState<string | null>(null);
   const [reloadKey, setReloadKey] = useState(0);

   const [name, setName] = useState('');
   const [scopes, setScopes] = useState<ApiKeyScope[]>(DEFAULT_SCOPES);
   const [creating, setCreating] = useState(false);
   const [createError, setCreateError] = useState<string | null>(null);
   const [created, setCreated] = useState<ApiKey | null>(null);
   const [copied, setCopied] = useState(false);

   const [revoking, setRevoking] = useState<ApiKey | null>(null);
   const [revokeBusy, setRevokeBusy] = useState(false);
   const [revokeError, setRevokeError] = useState<string | null>(null);

   const [deleting, setDeleting] = useState<ApiKey | null>(null);
   const [deleteBusy, setDeleteBusy] = useState(false);
   const [deleteError, setDeleteError] = useState<string | null>(null);

   useEffect(() => {
      let cancelled = false;
      setLoading(true);
      setLoadError(null);

      listKeys()
         .then((result) => {
            if (!cancelled) setKeys(result);
         })
         .catch((cause: unknown) => {
            if (!cancelled) setLoadError(errorMessage(cause, 'Could not load API keys'));
         })
         .finally(() => {
            if (!cancelled) setLoading(false);
         });

      return () => {
         cancelled = true;
      };
   }, [reloadKey]);

   function toggleScope(scope: ApiKeyScope, checked: boolean) {
      setScopes((current) =>
         checked
            ? [...current.filter((value) => value !== scope), scope]
            : current.filter((value) => value !== scope),
      );
   }

   async function submit(event: Event) {
      event.preventDefault();
      setCreateError(null);
      setCreated(null);
      setCopied(false);

      if (name.trim().length === 0) {
         setCreateError('Give the key a name so you can recognise it later.');
         return;
      }
      if (scopes.length === 0) {
         setCreateError('Choose at least one scope.');
         return;
      }

      setCreating(true);
      try {
         const key = await createKey({ name: name.trim(), scopes });
         setCreated(key);
         setName('');
         setScopes(DEFAULT_SCOPES);
         setReloadKey((value) => value + 1);
      } catch (cause) {
         setCreateError(errorMessage(cause, 'Could not create the API key'));
      } finally {
         setCreating(false);
      }
   }

   async function copySecret() {
      if (created?.key === undefined) return;
      try {
         await navigator.clipboard.writeText(created.key);
         setCopied(true);
         toast({ title: 'API key copied', variant: 'success' });
      } catch {
         toast({ title: 'Could not copy the key', variant: 'destructive' });
      }
   }

   async function confirmRevoke() {
      if (revoking === null) return;
      setRevokeBusy(true);
      setRevokeError(null);
      try {
         await revokeKey(revoking.id);
         setRevoking(null);
         setReloadKey((value) => value + 1);
      } catch (cause) {
         setRevokeError(errorMessage(cause, 'Could not revoke the API key'));
      } finally {
         setRevokeBusy(false);
      }
   }

   async function confirmDelete() {
      if (deleting === null) return;
      setDeleteBusy(true);
      setDeleteError(null);
      try {
         await removeKey(deleting.id);
         setDeleting(null);
         setReloadKey((value) => value + 1);
      } catch (cause) {
         setDeleteError(errorMessage(cause, 'Could not delete the API key'));
      } finally {
         setDeleteBusy(false);
      }
   }

   const activeKeys = keys.filter((key) => key.revoked_at === null);
   const revokedKeys = keys.filter((key) => key.revoked_at !== null);

   function renderKey(key: ApiKey) {
      const revoked = key.revoked_at !== null;
      return (
         <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border bg-background px-3 py-3">
            <div className="min-w-0">
               <div className="flex flex-wrap items-center gap-2">
                  <KeyRound
                     className="size-4 text-muted-foreground"
                     aria-hidden="true"
                  />
                  <span className="text-sm font-medium">{key.name}</span>
                  <code className="rounded bg-muted px-1.5 py-0.5 text-[11px]">{key.prefix}…</code>
                  {revoked && <Badge variant="outline">Revoked</Badge>}
               </div>
               <p className="mt-1 text-xs text-muted-foreground">{key.scopes.join(', ')}</p>
               <p className="mt-1 text-[11px] text-muted-foreground">
                  Created {formatDate(key.created_at)}
                  {key.last_used_at === null
                     ? ' · never used'
                     : ` · last used ${relativeTime(key.last_used_at)}`}
               </p>
            </div>
            {revoked ? (
               <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => {
                     setDeleteError(null);
                     setDeleting(key);
                  }}
               >
                  <Trash2 aria-hidden="true" />
                  Delete
               </Button>
            ) : (
               <Button
                  variant="outline"
                  size="sm"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => {
                     setRevokeError(null);
                     setRevoking(key);
                  }}
               >
                  <Trash2 aria-hidden="true" />
                  Revoke
               </Button>
            )}
         </div>
      );
   }

   return (
      <Card data-guide="settings-api-keys">
         <CardHeader>
            <CardTitle>API keys</CardTitle>
            <CardDescription>
               Scoped bearer keys for scripts and external apps calling <code>/api/v1</code>. The
               secret is shown once.
            </CardDescription>
         </CardHeader>
         <CardContent className="grid gap-5">
            {loadError !== null ? (
               <Alert variant="destructive">
                  <AlertTitle>Could not load API keys</AlertTitle>
                  <AlertDescription>
                     <p>{loadError}</p>
                     <Button
                        variant="outline"
                        size="sm"
                        className="mt-3"
                        onClick={() => setReloadKey((value) => value + 1)}
                     >
                        Try again
                     </Button>
                  </AlertDescription>
               </Alert>
            ) : loading ? (
               <p className="text-sm text-muted-foreground">Loading API keys…</p>
            ) : keys.length === 0 ? (
               <p className="text-sm text-muted-foreground">
                  No API keys yet. Create one when a script needs access.
               </p>
            ) : (
               <div className="grid gap-3">
                  {activeKeys.length === 0 ? (
                     <p className="text-sm text-muted-foreground">
                        No active keys. Revoked keys are kept below for the audit trail.
                     </p>
                  ) : (
                     <ul className="grid gap-2">
                        {activeKeys.map((key) => (
                           <li key={key.id}>{renderKey(key)}</li>
                        ))}
                     </ul>
                  )}

                  {revokedKeys.length > 0 && (
                     <details className="group rounded-lg border border-border bg-muted/20">
                        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-xs font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
                           <span>Revoked keys ({revokedKeys.length})</span>
                           <span className="text-[11px] font-normal">Kept for the audit trail</span>
                        </summary>
                        <ul className="grid gap-2 border-t border-border p-2">
                           {revokedKeys.map((key) => (
                              <li key={key.id}>{renderKey(key)}</li>
                           ))}
                        </ul>
                     </details>
                  )}
               </div>
            )}

            {created?.key !== undefined && (
               <Alert variant="success">
                  <AlertTitle>Copy this key now</AlertTitle>
                  <AlertDescription>
                     <p>It is not shown again after you leave this page.</p>
                     <div className="mt-2 flex flex-wrap items-center gap-2">
                        <code className="max-w-full overflow-x-auto rounded bg-background/70 px-2 py-1 font-mono text-xs">
                           {created.key}
                        </code>
                        <Button
                           variant="outline"
                           size="sm"
                           onClick={() => void copySecret()}
                        >
                           {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                           {copied ? 'Copied' : 'Copy'}
                        </Button>
                     </div>
                  </AlertDescription>
               </Alert>
            )}

            <form
               className="grid gap-4 border-t border-border pt-5"
               onSubmit={(event) => void submit(event)}
            >
               <div className="grid gap-1">
                  <h3 className="text-sm font-medium">Create a key</h3>
                  <p className="text-xs text-muted-foreground">
                     Give it only the scopes the script needs.
                  </p>
               </div>

               <Field
                  label="Name"
                  htmlFor="api-key-name"
                  hint="For example: Newsletter sync or CI deploy."
               >
                  <Input
                     id="api-key-name"
                     value={name}
                     maxLength={100}
                     placeholder="What will use this key?"
                     onInput={(event) => setName(event.currentTarget.value)}
                  />
               </Field>

               <fieldset className="grid gap-2">
                  <legend className="text-sm font-medium">Scopes</legend>
                  <div className="grid gap-2 sm:grid-cols-2">
                     {API_KEY_SCOPES.map((scope) => (
                        <Checkbox
                           key={scope}
                           checked={scopes.includes(scope)}
                           label={scope}
                           className="rounded-md border border-border px-2.5 py-2 text-xs"
                           onChange={(event) => toggleScope(scope, event.currentTarget.checked)}
                        />
                     ))}
                  </div>
               </fieldset>

               {createError !== null && (
                  <Alert variant="destructive">
                     <AlertDescription>{createError}</AlertDescription>
                  </Alert>
               )}

               <div className="flex justify-end">
                  <Button
                     type="submit"
                     disabled={creating}
                  >
                     {creating ? 'Creating…' : 'Create API key'}
                  </Button>
               </div>
            </form>
         </CardContent>

         <ConfirmDialog
            open={deleting !== null}
            onOpenChange={(open) => {
               if (!open) setDeleting(null);
            }}
            title="Delete API key"
            description={
               deleting === null
                  ? ''
                  : `Delete "${deleting.name}" permanently? Its audit entry disappears; scripts already stopped working when it was revoked.`
            }
            confirmLabel="Delete key"
            destructive
            loading={deleteBusy}
            error={deleteError}
            onConfirm={confirmDelete}
         />

         <ConfirmDialog
            open={revoking !== null}
            onOpenChange={(open) => {
               if (!open) setRevoking(null);
            }}
            title="Revoke API key"
            description={
               revoking === null
                  ? ''
                  : `Revoke "${revoking.name}"? Any script using it will start receiving 401 responses.`
            }
            confirmLabel="Revoke key"
            destructive
            loading={revokeBusy}
            error={revokeError}
            onConfirm={confirmRevoke}
         />
      </Card>
   );
}
