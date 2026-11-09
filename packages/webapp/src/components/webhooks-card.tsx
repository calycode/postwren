import { useEffect, useState } from 'react';
import { Check, Copy, Plus, RefreshCw, Send, Trash2, Webhook } from 'lucide-react';
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
   Separator,
} from '@postwren/ui';
import { WEBHOOK_EVENTS } from '@postwren/shared/webhooks';
import { ConfirmDialog } from '@/components/confirm-dialog';
import {
   create,
   deliveries as listDeliveries,
   list,
   remove,
   retryDelivery,
   test,
   update,
} from '@/lib/api/webhooks';
import type { WebhookDelivery, WebhookEndpoint, WebhookEvent } from '@/lib/api/types';
import { errorMessage } from '@/lib/form-errors';
import { formatDate, relativeTime, titleCase } from '@/lib/format';

const SELECTABLE_EVENTS = WEBHOOK_EVENTS.filter((event) => event !== 'webhook.test');
const DEFAULT_EVENTS: WebhookEvent[] = [
   'subscriber.created',
   'subscriber.confirmed',
   'subscriber.unsubscribed',
   'campaign.sent',
];

function statusVariant(status: WebhookDelivery['status']) {
   if (status === 'succeeded') return 'success' as const;
   if (status === 'failed') return 'destructive' as const;
   return 'outline' as const;
}

function eventLabel(event: string): string {
   return titleCase(event.replace('.', ' · '));
}

export function WebhooksCard() {
   const [endpoints, setEndpoints] = useState<WebhookEndpoint[]>([]);
   const [loading, setLoading] = useState(true);
   const [loadError, setLoadError] = useState<string | null>(null);
   const [reloadKey, setReloadKey] = useState(0);

   const [url, setUrl] = useState('');
   const [description, setDescription] = useState('');
   const [events, setEvents] = useState<WebhookEvent[]>(DEFAULT_EVENTS);
   const [creating, setCreating] = useState(false);
   const [createError, setCreateError] = useState<string | null>(null);
   const [created, setCreated] = useState<WebhookEndpoint | null>(null);
   const [copied, setCopied] = useState(false);

   const [busyId, setBusyId] = useState<string | null>(null);
   const [actionError, setActionError] = useState<string | null>(null);
   const [deleting, setDeleting] = useState<WebhookEndpoint | null>(null);
   const [deleteBusy, setDeleteBusy] = useState(false);
   const [deleteError, setDeleteError] = useState<string | null>(null);

   const [deliveries, setDeliveries] = useState<Record<string, WebhookDelivery[]>>({});
   const [loadingDeliveries, setLoadingDeliveries] = useState<string | null>(null);

   useEffect(() => {
      let cancelled = false;
      setLoading(true);
      setLoadError(null);

      list()
         .then((result) => {
            if (!cancelled) setEndpoints(result);
         })
         .catch((cause: unknown) => {
            if (!cancelled) setLoadError(errorMessage(cause, 'Could not load webhook endpoints'));
         })
         .finally(() => {
            if (!cancelled) setLoading(false);
         });

      return () => {
         cancelled = true;
      };
   }, [reloadKey]);

   function toggleEvent(event: WebhookEvent, checked: boolean) {
      setEvents((current) =>
         checked
            ? [...new Set([...current, event])]
            : current.filter((candidate) => candidate !== event),
      );
   }

   async function copySecret() {
      if (created?.secret === undefined) return;
      try {
         await navigator.clipboard.writeText(created.secret);
         setCopied(true);
      } catch {
         // Clipboard access can be denied; the value stays selectable.
      }
   }

   async function submit(event: Event) {
      event.preventDefault();
      setCreating(true);
      setCreateError(null);
      try {
         const endpoint = await create({
            url: url.trim(),
            description: description.trim().length > 0 ? description.trim() : undefined,
            events,
         });
         setCreated(endpoint);
         setUrl('');
         setDescription('');
         setEvents(DEFAULT_EVENTS);
         setReloadKey((value) => value + 1);
      } catch (cause) {
         setCreateError(errorMessage(cause, 'Could not create the webhook endpoint'));
      } finally {
         setCreating(false);
      }
   }

   async function toggleEnabled(endpoint: WebhookEndpoint) {
      setBusyId(endpoint.id);
      setActionError(null);
      try {
         await update(endpoint.id, { enabled: !endpoint.enabled });
         setReloadKey((value) => value + 1);
      } catch (cause) {
         setActionError(errorMessage(cause, 'Could not update the endpoint'));
      } finally {
         setBusyId(null);
      }
   }

   async function sendTest(endpoint: WebhookEndpoint) {
      setBusyId(endpoint.id);
      setActionError(null);
      try {
         await test(endpoint.id);
         setReloadKey((value) => value + 1);
         await loadDeliveries(endpoint.id);
      } catch (cause) {
         setActionError(errorMessage(cause, 'Could not send a test delivery'));
      } finally {
         setBusyId(null);
      }
   }

   async function loadDeliveries(id: string) {
      setLoadingDeliveries(id);
      try {
         const rows = await listDeliveries(id);
         setDeliveries((current) => ({ ...current, [id]: rows }));
      } catch (cause) {
         setActionError(errorMessage(cause, 'Could not load deliveries'));
      } finally {
         setLoadingDeliveries(null);
      }
   }

   async function retry(delivery: WebhookDelivery) {
      setBusyId(delivery.id);
      setActionError(null);
      try {
         const updated = await retryDelivery(delivery.id);
         setDeliveries((current) => ({
            ...current,
            [delivery.endpoint_id]: (current[delivery.endpoint_id] ?? []).map((row) =>
               row.id === delivery.id && updated !== null ? updated : row,
            ),
         }));
      } catch (cause) {
         setActionError(errorMessage(cause, 'Could not retry the delivery'));
      } finally {
         setBusyId(null);
      }
   }

   async function confirmDelete() {
      if (deleting === null) return;
      setDeleteBusy(true);
      setDeleteError(null);
      try {
         await remove(deleting.id);
         setDeleting(null);
         setReloadKey((value) => value + 1);
      } catch (cause) {
         setDeleteError(errorMessage(cause, 'Could not delete the endpoint'));
      } finally {
         setDeleteBusy(false);
      }
   }

   function renderEndpoint(endpoint: WebhookEndpoint) {
      const rows = deliveries[endpoint.id];

      return (
         <div className="grid gap-3 rounded-lg border border-border bg-background p-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
               <div className="grid min-w-0 gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                     <Webhook
                        className="size-4 text-muted-foreground"
                        aria-hidden="true"
                     />
                     <code className="max-w-full truncate text-sm font-medium">{endpoint.url}</code>
                     <Badge variant={endpoint.enabled ? 'success' : 'outline'}>
                        {endpoint.enabled ? 'Active' : 'Disabled'}
                     </Badge>
                     {endpoint.failure_count > 0 && (
                        <Badge variant="destructive">{endpoint.failure_count} failures</Badge>
                     )}
                  </div>
                  {endpoint.description !== null && endpoint.description.length > 0 && (
                     <p className="text-xs text-muted-foreground">{endpoint.description}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                     {endpoint.events.map(eventLabel).join(', ')}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                     Created {formatDate(endpoint.created_at)}
                     {endpoint.last_success_at === null
                        ? ' · no successful delivery yet'
                        : ` · last success ${relativeTime(endpoint.last_success_at)}`}
                     {endpoint.last_failure_at === null
                        ? ''
                        : ` · last failure ${relativeTime(endpoint.last_failure_at)}`}
                  </p>
               </div>

               <div className="flex flex-wrap gap-2">
                  <Button
                     variant="outline"
                     size="sm"
                     disabled={busyId === endpoint.id}
                     onClick={() => void sendTest(endpoint)}
                  >
                     <Send aria-hidden="true" />
                     Test
                  </Button>
                  <Button
                     variant="outline"
                     size="sm"
                     disabled={busyId === endpoint.id}
                     onClick={() => void toggleEnabled(endpoint)}
                  >
                     {endpoint.enabled ? 'Disable' : 'Enable'}
                  </Button>
                  <Button
                     variant="ghost"
                     size="sm"
                     className="text-muted-foreground hover:text-destructive"
                     onClick={() => {
                        setDeleteError(null);
                        setDeleting(endpoint);
                     }}
                  >
                     <Trash2 aria-hidden="true" />
                     Delete
                  </Button>
               </div>
            </div>

            <details
               className="rounded-md border border-border/70 bg-muted/20"
               onToggle={(event) => {
                  if (event.currentTarget.open && rows === undefined) {
                     void loadDeliveries(endpoint.id);
                  }
               }}
            >
               <summary className="cursor-pointer list-none px-3 py-2 text-xs font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
                  Recent deliveries
               </summary>
               <div className="border-t border-border/70 p-2">
                  {loadingDeliveries === endpoint.id ? (
                     <p className="p-2 text-xs text-muted-foreground">Loading deliveries…</p>
                  ) : rows === undefined || rows.length === 0 ? (
                     <p className="p-2 text-xs text-muted-foreground">
                        Nothing has been sent to this endpoint yet.
                     </p>
                  ) : (
                     <ul className="grid gap-1">
                        {rows.map((delivery) => (
                           <li
                              key={delivery.id}
                              className="flex flex-wrap items-center justify-between gap-2 rounded px-2 py-1.5 text-xs odd:bg-background/60"
                           >
                              <span className="flex min-w-0 flex-wrap items-center gap-2">
                                 <Badge variant={statusVariant(delivery.status)}>
                                    {delivery.status}
                                 </Badge>
                                 <span className="font-medium">{eventLabel(delivery.event)}</span>
                                 <span className="text-muted-foreground">
                                    {delivery.status === 'succeeded'
                                       ? `delivered ${relativeTime(delivery.delivered_at)}`
                                       : `${delivery.attempts} attempt${delivery.attempts === 1 ? '' : 's'}`}
                                    {delivery.response_status === null
                                       ? ''
                                       : ` · HTTP ${delivery.response_status}`}
                                    {delivery.error === null ? '' : ` · ${delivery.error}`}
                                 </span>
                              </span>
                              {delivery.status === 'failed' && (
                                 <Button
                                    variant="ghost"
                                    size="sm"
                                    disabled={busyId === delivery.id}
                                    onClick={() => void retry(delivery)}
                                 >
                                    <RefreshCw aria-hidden="true" />
                                    Retry
                                 </Button>
                              )}
                           </li>
                        ))}
                     </ul>
                  )}
               </div>
            </details>
         </div>
      );
   }

   return (
      <Card data-guide="settings-webhooks">
         <CardHeader>
            <CardTitle>Webhook endpoints</CardTitle>
            <CardDescription>
               Signed POST requests when a subscriber or campaign changes. Deliveries retry with
               backoff and every attempt is logged.
            </CardDescription>
         </CardHeader>
         <CardContent className="grid gap-5">
            {actionError !== null && (
               <Alert variant="destructive">
                  <AlertDescription>{actionError}</AlertDescription>
               </Alert>
            )}

            {loading ? (
               <p className="text-sm text-muted-foreground">Loading webhook endpoints…</p>
            ) : loadError !== null ? (
               <Alert variant="destructive">
                  <AlertTitle>Could not load webhook endpoints</AlertTitle>
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
            ) : endpoints.length === 0 ? (
               <p className="text-sm text-muted-foreground">No webhook endpoints yet.</p>
            ) : (
               <div className="grid gap-3">{endpoints.map(renderEndpoint)}</div>
            )}

            {created?.secret !== undefined && (
               <Alert variant="warning">
                  <AlertTitle>Copy this signing secret now</AlertTitle>
                  <AlertDescription>
                     <p>
                        Verify{' '}
                        <code className="rounded bg-muted px-1 py-0.5">X-Postwren-Signature</code>{' '}
                        against{' '}
                        <code className="rounded bg-muted px-1 py-0.5">
                           t=&lt;unix&gt;,v1=&lt;hex&gt;
                        </code>{' '}
                        using the raw request body. The secret is not shown again.
                     </p>
                     <div className="mt-2 flex flex-wrap items-center gap-2">
                        <code className="max-w-full overflow-x-auto rounded bg-background/70 px-2 py-1 font-mono text-xs">
                           {created.secret}
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

            <Separator />

            <form
               className="grid max-w-xl gap-3"
               onSubmit={(event) => void submit(event)}
               noValidate
            >
               <h3 className="text-sm font-medium">Add an endpoint</h3>
               <Field
                  label="Endpoint URL"
                  htmlFor="webhook-url"
                  hint="HTTPS only. Postwren signs every request."
                  error={createError ?? undefined}
                  required
               >
                  <Input
                     id="webhook-url"
                     type="url"
                     value={url}
                     placeholder="https://example.com/hooks/postwren"
                     onInput={(event) => setUrl(event.currentTarget.value)}
                  />
               </Field>
               <Field
                  label="Description"
                  htmlFor="webhook-description"
                  hint="Optional, for example: Sync signups to the CRM."
               >
                  <Input
                     id="webhook-description"
                     value={description}
                     maxLength={200}
                     placeholder="What consumes this endpoint?"
                     onInput={(event) => setDescription(event.currentTarget.value)}
                  />
               </Field>
               <fieldset className="grid gap-2">
                  <legend className="text-sm font-medium">Events</legend>
                  <div className="grid gap-2 sm:grid-cols-2">
                     {SELECTABLE_EVENTS.map((event) => (
                        <Checkbox
                           key={event}
                           checked={events.includes(event)}
                           label={eventLabel(event)}
                           className="rounded-md border border-border px-2.5 py-2 text-xs"
                           onChange={(input) => toggleEvent(event, input.currentTarget.checked)}
                        />
                     ))}
                  </div>
               </fieldset>
               <div>
                  <Button
                     type="submit"
                     disabled={creating || events.length === 0}
                  >
                     <Plus aria-hidden="true" />
                     {creating ? 'Creating…' : 'Create endpoint'}
                  </Button>
               </div>
            </form>
         </CardContent>

         <ConfirmDialog
            open={deleting !== null}
            onOpenChange={(open) => {
               if (!open) setDeleting(null);
            }}
            title="Delete webhook endpoint"
            description={
               deleting === null
                  ? ''
                  : `Delete "${deleting.url}"? Its delivery history is removed with it.`
            }
            confirmLabel="Delete endpoint"
            destructive
            loading={deleteBusy}
            error={deleteError}
            onConfirm={confirmDelete}
         />
      </Card>
   );
}
