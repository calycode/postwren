import { useEffect, useState } from 'react';
import { useLocation } from 'preact-iso';
import { ArrowRight, Plus, Workflow } from 'lucide-react';
import { triggerSummary } from '@postwren/shared/automation';
import {
   Alert,
   AlertDescription,
   Badge,
   Button,
   Dialog,
   DialogClose,
   DialogContent,
   DialogDescription,
   DialogFooter,
   DialogHeader,
   DialogTitle,
   EmptyState,
   Field,
   Input,
   Skeleton,
} from '@postwren/ui';
import {
   TriggerFields,
   triggerConfigFromDraft,
   triggerDraft,
   triggerDraftError,
} from '@/components/automations/trigger-fields';
import type { TriggerDraft } from '@/components/automations/trigger-fields';
import { PageHeader } from '@/components/page-header';
import { SenderSelect } from '@/components/campaigns/sender-select';
import { defaultSender, useSenders } from '@/components/campaigns/use-senders';
import { useTemplates } from '@/components/campaigns/use-templates';
import { create as createAutomation, list as listAutomations } from '@/lib/api/automations';
import type { Automation } from '@/lib/api/types';
import { errorMessage } from '@/lib/form-errors';
import { formatNumber, relativeTime, titleCase } from '@/lib/format';

function statusVariant(
   status: Automation['status'],
): 'success' | 'secondary' | 'warning' | 'outline' {
   switch (status) {
      case 'active':
         return 'success';
      case 'paused':
         return 'warning';
      case 'draft':
         return 'secondary';
      case 'archived':
         return 'outline';
   }
}

function defaultNameFor(type: TriggerDraft['type']): string {
   switch (type) {
      case 'subscriber.created':
         return 'Welcome series';
      case 'tag.added':
         return 'Tag follow-up';
      case 'campaign.clicked':
         return 'Click follow-up';
      case 'api.event':
         return 'Event follow-up';
   }
}

function NewAutomationDialog({
   open,
   onOpenChange,
   onCreated,
}: {
   open: boolean;
   onOpenChange: (open: boolean) => void;
   onCreated: (automation: Automation) => void;
}) {
   const senders = useSenders(open);
   const templates = useTemplates(open);
   const [name, setName] = useState('Welcome series');
   const [trigger, setTrigger] = useState<TriggerDraft>(() =>
      triggerDraft('subscriber.created', {}),
   );
   const [fromName, setFromName] = useState('');
   const [fromEmail, setFromEmail] = useState('');
   const [templateId, setTemplateId] = useState('');
   const [error, setError] = useState<string | null>(null);
   const [busy, setBusy] = useState(false);

   useEffect(() => {
      if (!open) return;
      setError(null);
      setName('Welcome series');
      setTrigger(triggerDraft('subscriber.created', {}));
   }, [open]);

   useEffect(() => {
      if (!open) return;
      if (templateId.length === 0 && templates.templates[0] !== undefined) {
         setTemplateId(templates.templates[0].id);
      }
   }, [open, templateId, templates.templates]);

   useEffect(() => {
      if (!open || senders.settings === undefined) return;
      const sender = defaultSender(senders.settings);
      if (sender === undefined) return;
      setFromEmail((current) => (current.length > 0 ? current : sender.email));
      setFromName((current) =>
         current.length > 0 ? current : sender.name.length > 0 ? sender.name : 'Postwren',
      );
   }, [open, senders.settings]);

   async function submit(event: Event) {
      event.preventDefault();
      setError(null);
      if (name.trim().length === 0) {
         setError('Give the automation a name.');
         return;
      }
      if (fromEmail.trim().length === 0) {
         setError('Choose a sender.');
         return;
      }
      const triggerError = triggerDraftError(trigger);
      if (triggerError !== null) {
         setError(triggerError);
         return;
      }
      if (templateId.length === 0) {
         setError('Create a template before starting a welcome automation.');
         return;
      }

      setBusy(true);
      try {
         const automation = await createAutomation({
            name: name.trim(),
            triggerType: trigger.type,
            triggerConfig: triggerConfigFromDraft(trigger),
            entryQuery: '',
            fromName: fromName.trim(),
            fromEmail: fromEmail.trim(),
            steps: [
               { id: `stp_${crypto.randomUUID()}`, type: 'wait', amount: 1, unit: 'days' },
               {
                  id: `stp_${crypto.randomUUID()}`,
                  type: 'send',
                  templateId,
               },
               { id: `stp_${crypto.randomUUID()}`, type: 'exit' },
            ],
         });
         onCreated(automation);
      } catch (cause) {
         setError(errorMessage(cause, 'Could not create the automation'));
      } finally {
         setBusy(false);
      }
   }

   return (
      <Dialog
         open={open}
         onOpenChange={onOpenChange}
      >
         <DialogContent>
            <DialogHeader>
               <DialogTitle>New automation</DialogTitle>
               <DialogDescription>
                  Choose what starts the automation, then add steps on the next screen.
               </DialogDescription>
            </DialogHeader>

            <form
               className="grid gap-4"
               onSubmit={(event) => void submit(event)}
            >
               <Field
                  label="Name"
                  htmlFor="automation-name"
                  required
               >
                  <Input
                     id="automation-name"
                     value={name}
                     maxLength={200}
                     autoFocus
                     onInput={(event) => setName(event.currentTarget.value)}
                  />
               </Field>

               <TriggerFields
                  value={trigger}
                  idPrefix="automation-create"
                  onChange={(next) => {
                     if (next.type !== trigger.type && name === defaultNameFor(trigger.type)) {
                        setName(defaultNameFor(next.type));
                     }
                     setTrigger(next);
                  }}
               />

               <div className="grid gap-4 sm:grid-cols-2">
                  <Field
                     label="From name"
                     htmlFor="automation-from-name"
                     required
                  >
                     <Input
                        id="automation-from-name"
                        value={fromName}
                        onInput={(event) => setFromName(event.currentTarget.value)}
                     />
                  </Field>
                  <SenderSelect
                     id="automation-from-email"
                     value={fromEmail}
                     senders={senders.settings?.addresses ?? []}
                     loading={senders.loading}
                     error={senders.error}
                     onRetry={senders.reload}
                     onChange={setFromEmail}
                  />
               </div>

               <Field
                  label="First email template"
                  htmlFor="automation-template"
                  error={templates.error ?? undefined}
                  required
               >
                  <select
                     id="automation-template"
                     value={templateId}
                     onChange={(event) => setTemplateId(event.currentTarget.value)}
                     className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                     {templates.templates.length === 0 && (
                        <option value="">No templates yet</option>
                     )}
                     {templates.templates.map((template) => (
                        <option
                           key={template.id}
                           value={template.id}
                        >
                           {template.name} (v{template.revision})
                        </option>
                     ))}
                  </select>
               </Field>

               {templates.templates.length === 0 && !templates.loading && (
                  <p className="text-xs text-muted-foreground">
                     <a
                        href="/templates"
                        className="underline underline-offset-4"
                     >
                        Create a template first
                     </a>
                     , then come back.
                  </p>
               )}

               {error !== null && (
                  <Alert variant="destructive">
                     <AlertDescription>{error}</AlertDescription>
                  </Alert>
               )}

               <DialogFooter>
                  <DialogClose disabled={busy}>Cancel</DialogClose>
                  <Button
                     type="submit"
                     disabled={busy || templates.templates.length === 0}
                  >
                     {busy ? 'Creating…' : 'Create automation'}
                  </Button>
               </DialogFooter>
            </form>
         </DialogContent>
      </Dialog>
   );
}

export function Automations() {
   const { route } = useLocation();
   const [automations, setAutomations] = useState<Automation[]>([]);
   const [loading, setLoading] = useState(true);
   const [error, setError] = useState<string | null>(null);
   const [reloadKey, setReloadKey] = useState(0);
   const [createOpen, setCreateOpen] = useState(false);

   useEffect(() => {
      let cancelled = false;
      setLoading(true);
      setError(null);
      listAutomations()
         .then((result) => {
            if (!cancelled) setAutomations(result);
         })
         .catch((cause: unknown) => {
            if (!cancelled) setError(errorMessage(cause, 'Could not load automations'));
         })
         .finally(() => {
            if (!cancelled) setLoading(false);
         });
      return () => {
         cancelled = true;
      };
   }, [reloadKey]);

   return (
      <div className="grid gap-6">
         <PageHeader
            title="Automations"
            description="Send a short sequence after a subscriber joins the list. Runs are processed every minute."
            actions={
               <Button onClick={() => setCreateOpen(true)}>
                  <Plus aria-hidden="true" />
                  New automation
               </Button>
            }
         />

         {error !== null && (
            <Alert variant="destructive">
               <AlertDescription>
                  <p>{error}</p>
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
         )}

         {loading && automations.length === 0 ? (
            <div className="grid gap-3">
               {Array.from({ length: 3 }, (_, index) => (
                  <Skeleton
                     key={index}
                     className="h-28 w-full rounded-xl"
                  />
               ))}
            </div>
         ) : automations.length === 0 ? (
            <EmptyState
               icon={<Workflow aria-hidden="true" />}
               title="No automations yet"
               description="A welcome sequence is the usual first one: wait a day, send your best introduction, then stop."
               action={
                  <Button onClick={() => setCreateOpen(true)}>
                     <Plus aria-hidden="true" />
                     New automation
                  </Button>
               }
            />
         ) : (
            <div className="grid gap-3">
               {automations.map((automation) => (
                  <a
                     key={automation.id}
                     href={`/automations/${automation.id}`}
                     className="group flex flex-wrap items-center gap-4 rounded-xl border border-border bg-card p-4 shadow-sm outline-none transition-[transform,box-shadow] duration-150 hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring"
                  >
                     <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                        <Workflow
                           className="size-5"
                           aria-hidden="true"
                        />
                     </span>
                     <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                           <span className="text-sm font-medium">{automation.name}</span>
                           <Badge variant={statusVariant(automation.status)}>
                              {titleCase(automation.status)}
                           </Badge>
                        </span>
                        <span className="mt-1 block text-xs text-muted-foreground">
                           {triggerSummary(automation.triggerType, automation.triggerConfig)} ·{' '}
                           {automation.steps.length} steps · v{automation.version}
                        </span>
                     </span>
                     <span className="hidden items-center gap-6 text-xs text-muted-foreground sm:flex">
                        <span>
                           <span className="block text-[10px] uppercase">Active</span>
                           <span className="font-medium text-foreground">
                              {formatNumber(automation.activeRuns ?? 0)}
                           </span>
                        </span>
                        <span>
                           <span className="block text-[10px] uppercase">Sent</span>
                           <span className="font-medium text-foreground">
                              {formatNumber(automation.sentCount ?? 0)}
                           </span>
                        </span>
                        <span>
                           <span className="block text-[10px] uppercase">Updated</span>
                           <span className="font-medium text-foreground">
                              {relativeTime(automation.updated_at)}
                           </span>
                        </span>
                     </span>
                     <ArrowRight
                        className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                        aria-hidden="true"
                     />
                  </a>
               ))}
            </div>
         )}

         <div className="rounded-xl border border-dashed border-border px-4 py-3 text-xs text-muted-foreground">
            Automations currently run one step per cron minute. Waits are durations, not calendar
            times. A subscriber who unsubscribes exits the run before the next send.
         </div>

         <NewAutomationDialog
            open={createOpen}
            onOpenChange={setCreateOpen}
            onCreated={(automation) => {
               setCreateOpen(false);
               route(`/automations/${automation.id}`);
            }}
         />
      </div>
   );
}
