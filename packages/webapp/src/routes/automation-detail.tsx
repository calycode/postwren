import { Fragment, useEffect, useState } from 'react';
import { useRoute } from 'preact-iso';
import { ChevronDown, ChevronRight, Pause, Play, Save, UserPlus, Workflow } from 'lucide-react';
import {
   Alert,
   AlertDescription,
   Badge,
   Button,
   Card,
   CardContent,
   CardDescription,
   CardHeader,
   CardTitle,
   Dialog,
   DialogClose,
   DialogContent,
   DialogDescription,
   DialogFooter,
   DialogHeader,
   DialogTitle,
   Field,
   Input,
   Select,
   SelectContent,
   SelectItem,
   SelectTrigger,
   Skeleton,
   Table,
   TableBody,
   TableCell,
   TableHead,
   TableHeader,
   TableRow,
   cn,
   useToast,
} from '@postwren/ui';
import {
   automationIssueMessage,
   parseAutomationSteps,
   triggerSummary,
} from '@postwren/shared/automation';
import { PageHeader } from '@/components/page-header';
import { SenderSelect } from '@/components/campaigns/sender-select';
import { AudienceField } from '@/components/campaigns/audience-field';
import { useAudiencePreview } from '@/components/campaigns/use-audience-preview';
import { useSenders } from '@/components/campaigns/use-senders';
import { useTemplates } from '@/components/campaigns/use-templates';
import { MetadataEditor } from '@/components/metadata-editor';
import { AddStepMenu, StepEditor, newStep } from '@/components/automations/step-editor';
import {
   TriggerFields,
   triggerConfigFromDraft,
   triggerDraft,
   triggerDraftError,
} from '@/components/automations/trigger-fields';
import type { TriggerDraft } from '@/components/automations/trigger-fields';
import {
   activate as activateAutomation,
   enroll as enrollAutomation,
   get as getAutomation,
   pause as pauseAutomation,
   update as updateAutomation,
} from '@/lib/api/automations';
import type { Automation, AutomationRun, AutomationStep } from '@/lib/api/types';
import { errorMessage, isEmail } from '@/lib/form-errors';
import { formatDateTime, formatDuration, relativeTime, titleCase } from '@/lib/format';
import { metadataPatchFromRows, metadataToRows } from '@/lib/metadata';
import type { MetadataRow } from '@/lib/metadata';

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

function runVariant(
   status: string,
): 'success' | 'secondary' | 'warning' | 'destructive' | 'outline' {
   if (status === 'completed') return 'success';
   if (status === 'waiting' || status === 'running') return 'secondary';
   if (status === 'exited' || status === 'cancelled') return 'warning';
   if (status === 'failed') return 'destructive';
   return 'outline';
}

function exitReasonLabel(reason: string | null): string {
   if (reason === null) return '-';
   switch (reason) {
      case 'exit_step':
         return 'Reached exit step';
      case 'completed':
         return 'Completed';
      case 'suppressed':
         return 'Suppressed';
      case 'automation_paused':
         return 'Automation paused';
      case 'app_url_missing':
         return 'APP_URL not set';
      case 'send_failed':
         return 'Send failed';
      case 'template_missing':
         return 'Template missing';
      case 'invalid_template':
         return 'Template invalid';
      case 'render_error':
         return 'Render failed';
      case 'engine_error':
         return 'Engine error';
      default:
         return titleCase(reason);
   }
}

function deliveryVariant(
   status: string,
): 'success' | 'secondary' | 'warning' | 'destructive' | 'outline' {
   if (status === 'sent') return 'success';
   if (status === 'failed') return 'destructive';
   if (status === 'sending') return 'warning';
   return 'secondary';
}

function LogItem({ label, value }: { label: string; value: string }) {
   return (
      <div className="grid gap-0.5">
         <dt className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
            {label}
         </dt>
         <dd className="text-xs tabular-nums">{value}</dd>
      </div>
   );
}

function RunDetails({ run }: { run: AutomationRun }) {
   return (
      <div className="grid gap-4 py-2 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
         <dl className="grid grid-cols-2 content-start gap-x-4 gap-y-3">
            <LogItem
               label="Queued"
               value={formatDateTime(run.enteredAt)}
            />
            <LogItem
               label="Started"
               value={formatDateTime(run.startedAt)}
            />
            <LogItem
               label="Last step"
               value={formatDateTime(run.lastStepAt)}
            />
            <LogItem
               label="Finished"
               value={formatDateTime(run.completedAt)}
            />
            <LogItem
               label="Steps run"
               value={String(run.stepsExecuted)}
            />
            <LogItem
               label="Attempts"
               value={String(run.attempts)}
            />
            <LogItem
               label="Automation v"
               value={String(run.automationVersion)}
            />
            <LogItem
               label="Next step"
               value={run.nextRunAt === null ? '—' : formatDateTime(run.nextRunAt)}
            />
         </dl>

         <div className="grid gap-2">
            {run.lastError !== null && (
               <p className="rounded-md border border-destructive/30 bg-destructive/5 px-2.5 py-1.5 text-xs text-destructive">
                  {run.lastError}
               </p>
            )}

            {run.deliveries.length === 0 ? (
               <p className="text-xs text-muted-foreground">
                  This run has not produced any emails yet.
               </p>
            ) : (
               <ul className="grid gap-1.5">
                  {run.deliveries.map((delivery) => (
                     <li
                        key={delivery.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-background px-2.5 py-1.5"
                     >
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                           <Badge variant={deliveryVariant(delivery.status)}>
                              {titleCase(delivery.status)}
                           </Badge>
                           <span className="truncate text-xs font-medium">{delivery.subject}</span>
                           {delivery.stepIndex !== null && (
                              <span className="text-[11px] text-muted-foreground">
                                 step {delivery.stepIndex + 1}
                              </span>
                           )}
                        </div>
                        <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                           <span title="Time from queue to provider">
                              {formatDuration(delivery.durationMs)}
                           </span>
                           <span>
                              {delivery.openedAt !== null ? 'opened' : 'not opened'} ·{' '}
                              {delivery.clickedAt !== null ? 'clicked' : 'no clicks'}
                           </span>
                           <span>{formatDateTime(delivery.sentAt)}</span>
                        </div>
                     </li>
                  ))}
               </ul>
            )}
         </div>
      </div>
   );
}

export function AutomationDetail() {
   const { params } = useRoute();
   const { toast } = useToast();
   const id = params.id ?? '';
   const senders = useSenders(true);
   const templates = useTemplates(true);

   const [automation, setAutomation] = useState<Automation | null>(null);
   const [loading, setLoading] = useState(true);
   const [loadError, setLoadError] = useState<string | null>(null);
   const [reloadKey, setReloadKey] = useState(0);

   const [name, setName] = useState('');
   const [entryQuery, setEntryQuery] = useState('');
   const [trigger, setTrigger] = useState<TriggerDraft>(() =>
      triggerDraft('subscriber.created', {}),
   );
   const [fromName, setFromName] = useState('');
   const [fromEmail, setFromEmail] = useState('');
   const [steps, setSteps] = useState<AutomationStep[]>([]);
   const [metadataRows, setMetadataRows] = useState<MetadataRow[]>([]);
   const [savedMetadata, setSavedMetadata] = useState<Record<string, string>>({});
   const [busy, setBusy] = useState(false);
   const [error, setError] = useState<string | null>(null);
   const [notice, setNotice] = useState<string | null>(null);
   const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
   const [exitSlotActive, setExitSlotActive] = useState(false);

   const [enrollOpen, setEnrollOpen] = useState(false);
   const [enrollEmail, setEnrollEmail] = useState('');
   const [enrollError, setEnrollError] = useState<string | null>(null);
   const [enrollBusy, setEnrollBusy] = useState(false);

   const [variablesOpen, setVariablesOpen] = useState(false);
   const [variablesError, setVariablesError] = useState<string | null>(null);
   const [variablesBusy, setVariablesBusy] = useState(false);

   const [runs, setRuns] = useState<AutomationRun[]>([]);
   const [runsLoading, setRunsLoading] = useState(true);
   const [runsError, setRunsError] = useState<string | null>(null);
   const [runsReloadKey, setRunsReloadKey] = useState(0);
   const [runStatus, setRunStatus] = useState('');
   const [runQuery, setRunQuery] = useState('');
   const [expandedRunId, setExpandedRunId] = useState<string | null>(null);

   const audiencePreview = useAudiencePreview(entryQuery);

   useEffect(() => {
      if (id.length === 0) {
         setRunsLoading(false);
         return;
      }

      let cancelled = false;
      setRunsLoading(true);
      setRunsError(null);
      const timer = window.setTimeout(
         () => {
            getAutomation(id, { status: runStatus, q: runQuery.trim() })
               .then((result) => {
                  if (!cancelled) setRuns(result.runs ?? []);
               })
               .catch((cause: unknown) => {
                  if (!cancelled) setRunsError(errorMessage(cause, 'Could not load runs'));
               })
               .finally(() => {
                  if (!cancelled) setRunsLoading(false);
               });
         },
         runQuery.trim().length > 0 ? 250 : 0,
      );

      return () => {
         cancelled = true;
         window.clearTimeout(timer);
      };
   }, [id, runStatus, runQuery, runsReloadKey]);

   useEffect(() => {
      if (id.length === 0) {
         setLoading(false);
         setLoadError('The automation id is missing from the address.');
         return;
      }

      let cancelled = false;
      setLoading(true);
      setLoadError(null);
      getAutomation(id)
         .then((result) => {
            if (cancelled) return;
            setAutomation(result);
            setName(result.name);
            setEntryQuery(result.entryQuery);
            setTrigger(triggerDraft(result.triggerType, result.triggerConfig));
            setFromName(result.fromName);
            setFromEmail(result.fromEmail);
            setSteps(result.steps);
            setMetadataRows(metadataToRows(result.metadata));
            setSavedMetadata(result.metadata);
         })
         .catch((cause: unknown) => {
            if (!cancelled) setLoadError(errorMessage(cause, 'Could not load the automation'));
         })
         .finally(() => {
            if (!cancelled) setLoading(false);
         });

      return () => {
         cancelled = true;
      };
   }, [id, reloadKey]);

   const editable = automation !== null && automation.status !== 'archived';

   function patchStep(index: number, next: AutomationStep) {
      setSteps((current) => current.map((step, position) => (position === index ? next : step)));
      setNotice(null);
   }

   function moveStep(index: number, direction: -1 | 1) {
      setSteps((current) => {
         const target = index + direction;
         if (target < 0 || target >= current.length) return current;
         const next = current.slice();
         const [step] = next.splice(index, 1);
         if (step === undefined) return current;
         next.splice(target, 0, step);
         return next;
      });
      setNotice(null);
   }

   function removeStep(index: number) {
      setSteps((current) => current.filter((_, position) => position !== index));
      setNotice(null);
   }

   function addStep(type: AutomationStep['type'], afterIndex = steps.length - 1) {
      const step = newStep(type);
      setSteps((current) => {
         const index = Math.max(0, Math.min(afterIndex + 1, current.length));
         const next = current.slice();
         next.splice(index, 0, step);
         return next;
      });
      setNotice(null);
   }

   function addStepAtEnd(type: AutomationStep['type']) {
      const exitIndex = steps.findIndex((step) => step.type === 'exit');
      addStep(type, exitIndex >= 0 ? exitIndex - 1 : steps.length - 1);
   }

   function moveStepTo(from: number, to: number, position: 'before' | 'after' = 'before') {
      setSteps((current) => {
         if (from === to && position === 'before') return current;
         const next = current.slice();
         const [step] = next.splice(from, 1);
         if (step === undefined) return current;

         let insertAt = from < to ? to - 1 : to;
         if (position === 'after') insertAt += 1;
         insertAt = Math.max(0, Math.min(insertAt, next.length));
         next.splice(insertAt, 0, step);

         const exitIndex = next.findIndex((entry) => entry.type === 'exit');
         if (exitIndex !== -1 && exitIndex !== next.length - 1) {
            const [exit] = next.splice(exitIndex, 1);
            if (exit !== undefined) next.push(exit);
         }

         return next;
      });
      setDraggingIndex(null);
      setExitSlotActive(false);
      setNotice(null);
   }

   function moveStepToEnd(from: number) {
      setSteps((current) => {
         const next = current.slice();
         const [step] = next.splice(from, 1);
         if (step === undefined) return current;

         const exitIndex = next.findIndex((entry) => entry.type === 'exit');
         next.splice(exitIndex === -1 ? next.length : exitIndex, 0, step);
         return next;
      });
      setDraggingIndex(null);
      setExitSlotActive(false);
      setNotice(null);
   }

   function stepError(): string | null {
      return automationIssueMessage(parseAutomationSteps(steps));
   }

   async function save(): Promise<Automation | null> {
      if (automation === null) return null;
      const triggerError = triggerDraftError(trigger);
      if (triggerError !== null) {
         setError(triggerError);
         return null;
      }
      const validation = stepError();
      if (validation !== null) {
         setError(validation);
         return null;
      }

      setBusy(true);
      setError(null);
      setNotice(null);
      try {
         const updated = await updateAutomation(automation.id, {
            name: name.trim(),
            triggerType: trigger.type,
            triggerConfig: triggerConfigFromDraft(trigger),
            entryQuery: entryQuery.trim(),
            fromName: fromName.trim(),
            fromEmail: fromEmail.trim(),
            steps,
            metadata: metadataPatchFromRows(savedMetadata, metadataRows),
         });
         setAutomation(updated);
         setSteps(updated.steps);
         setTrigger(triggerDraft(updated.triggerType, updated.triggerConfig));
         setMetadataRows(metadataToRows(updated.metadata));
         setSavedMetadata(updated.metadata);
         setNotice(
            automation.status === 'active'
               ? 'Changes saved. New runs will use the new version.'
               : 'Draft saved.',
         );
         return updated;
      } catch (cause) {
         setError(errorMessage(cause, 'Could not save the automation'));
         return null;
      } finally {
         setBusy(false);
      }
   }

   async function activate() {
      if (automation === null) return;
      const saved = await save();
      if (saved === null) return;

      setBusy(true);
      setError(null);
      try {
         const updated = await activateAutomation(saved.id);
         setAutomation(updated);
         setSteps(updated.steps);
         setNotice('Automation activated. New matching events will enter the sequence.');
      } catch (cause) {
         setError(errorMessage(cause, 'Could not activate the automation'));
      } finally {
         setBusy(false);
      }
   }

   async function pause() {
      if (automation === null) return;
      setBusy(true);
      setError(null);
      try {
         const updated = await pauseAutomation(automation.id);
         setAutomation(updated);
         setNotice('Automation paused. Active runs will exit on their next step.');
      } catch (cause) {
         setError(errorMessage(cause, 'Could not pause the automation'));
      } finally {
         setBusy(false);
      }
   }

   async function submitVariables() {
      if (automation === null) return;
      setVariablesBusy(true);
      setVariablesError(null);
      try {
         const updated = await updateAutomation(automation.id, {
            metadata: metadataPatchFromRows(savedMetadata, metadataRows),
         });
         setAutomation(updated);
         setSavedMetadata(updated.metadata);
         setMetadataRows(metadataToRows(updated.metadata));
         setVariablesOpen(false);
         toast({ title: 'Variables saved', variant: 'success' });
      } catch (cause) {
         setVariablesError(errorMessage(cause, 'Could not save the variables'));
      } finally {
         setVariablesBusy(false);
      }
   }

   async function submitEnroll(event: Event) {
      event.preventDefault();
      if (automation === null) return;
      if (!isEmail(enrollEmail)) {
         setEnrollError('Enter a valid subscriber email.');
         return;
      }

      setEnrollBusy(true);
      setEnrollError(null);
      try {
         await enrollAutomation(automation.id, enrollEmail.trim());
         setEnrollOpen(false);
         toast({ title: 'Subscriber enrolled', variant: 'success' });
         setRunsReloadKey((key) => key + 1);
      } catch (cause) {
         setEnrollError(errorMessage(cause, 'Could not enroll the subscriber'));
      } finally {
         setEnrollBusy(false);
      }
   }

   if (loading) {
      return (
         <div className="grid gap-4">
            <Skeleton className="h-9 w-64" />
            <Skeleton className="h-64 w-full rounded-xl" />
            <Skeleton className="h-48 w-full rounded-xl" />
         </div>
      );
   }

   if (loadError !== null || automation === null) {
      return (
         <div className="grid gap-4">
            <a
               href="/automations"
               className="w-fit text-sm text-muted-foreground underline-offset-4 hover:underline"
            >
               Back to automations
            </a>
            <Alert variant="destructive">
               <AlertDescription>
                  <p>{loadError ?? 'Automation not found'}</p>
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
         </div>
      );
   }

   const exitIndex = steps.findIndex((step) => step.type === 'exit');
   const exitStep = exitIndex >= 0 ? steps[exitIndex] : undefined;

   return (
      <div className="grid gap-6">
         <PageHeader
            title={automation.name}
            description={`${triggerSummary(trigger.type, triggerConfigFromDraft(trigger))}. Runs are processed every minute.`}
            breadcrumbs={[
               { label: 'Automations', href: '/automations' },
               { label: automation.name },
            ]}
            actions={
               <>
                  <Badge variant={statusVariant(automation.status)}>
                     {titleCase(automation.status)}
                  </Badge>
                  {editable ? (
                     <Button
                        variant="outline"
                        disabled={busy}
                        onClick={() => void save()}
                     >
                        <Save aria-hidden="true" />
                        {busy
                           ? 'Saving...'
                           : automation.status === 'active'
                             ? 'Save changes'
                             : 'Save draft'}
                     </Button>
                  ) : null}
                  {automation.status === 'active' ? (
                     <>
                        <Button
                           variant="outline"
                           disabled={busy}
                           onClick={() => setEnrollOpen(true)}
                        >
                           <UserPlus aria-hidden="true" />
                           Enroll
                        </Button>
                        <Button
                           variant="outline"
                           disabled={busy}
                           onClick={() => void pause()}
                        >
                           <Pause aria-hidden="true" />
                           Pause
                        </Button>
                     </>
                  ) : (
                     <Button
                        disabled={busy}
                        onClick={() => void activate()}
                     >
                        <Play aria-hidden="true" />
                        {busy ? 'Working...' : 'Activate'}
                     </Button>
                  )}
               </>
            }
         />

         {notice !== null && (
            <Alert variant="success">
               <AlertDescription>{notice}</AlertDescription>
            </Alert>
         )}

         {error !== null && (
            <Alert variant="destructive">
               <AlertDescription>{error}</AlertDescription>
            </Alert>
         )}

         <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
            <section className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-6">
               <div className="flex flex-wrap items-end justify-between gap-2 border-b border-border pb-4">
                  <div className="grid gap-1">
                     <h2 className="font-display text-2xl font-medium tracking-tight">Sequence</h2>
                     <p className="text-xs text-muted-foreground">
                        Top to bottom, one step at a time.
                        {automation.status === 'active'
                           ? ' Changes apply to new runs; active runs keep their snapshot.'
                           : ''}
                     </p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                     {steps.length} {steps.length === 1 ? 'step' : 'steps'}
                  </p>
               </div>

               <div className="relative mx-auto mt-6 grid max-w-2xl gap-4 md:gap-10">
                  <div
                     aria-hidden="true"
                     className="absolute top-4 bottom-4 left-4 w-px bg-border"
                  />

                  <div className="relative grid grid-cols-[2rem_minmax(0,1fr)] gap-3">
                     <span className="relative z-10 mt-3 flex size-8 items-center justify-center rounded-full border border-ochre/40 bg-accent text-accent-foreground shadow-sm">
                        <Workflow
                           className="size-4"
                           aria-hidden="true"
                        />
                     </span>
                     <div className="rounded-xl border border-ochre/40 bg-accent/35 p-4">
                        <p className="text-[10px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
                           Trigger
                        </p>
                        <p className="text-sm font-medium">
                           {triggerSummary(trigger.type, triggerConfigFromDraft(trigger))}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                           {entryQuery.trim().length > 0
                              ? `Only when they match ${entryQuery.trim()}.`
                              : 'Every matching subscriber enters.'}
                        </p>
                     </div>
                  </div>

                  {steps.map((step, index) =>
                     step.type === 'exit' ? null : (
                        <StepEditor
                           key={step.id}
                           step={step}
                           index={index}
                           total={steps.length}
                           templates={templates.templates}
                           disabled={!editable}
                           dragging={draggingIndex === index}
                           onChange={(next) => patchStep(index, next)}
                           onMove={(direction) => moveStep(index, direction)}
                           onRemove={() => removeStep(index)}
                           onAddAfter={(type) => addStep(type, index)}
                           onDragStart={setDraggingIndex}
                           onDrop={moveStepTo}
                           onDragEnd={() => setDraggingIndex(null)}
                           showAddAfter={
                              index < (exitStep !== undefined ? exitIndex - 1 : steps.length - 1)
                           }
                           dragActive={draggingIndex !== null}
                        />
                     ),
                  )}

                  {editable && (
                     <div
                        className={cn(
                           'relative grid grid-cols-[2rem_minmax(0,1fr)] gap-3 rounded-lg transition-colors',
                           exitSlotActive &&
                              'bg-ochre/10 outline-2 outline-dashed outline-ochre/40',
                        )}
                        onDragOver={(event) => {
                           if (draggingIndex === null) return;
                           event.preventDefault();
                           if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
                           setExitSlotActive(true);
                        }}
                        onDragLeave={(event) => {
                           if (
                              event.relatedTarget instanceof Node &&
                              event.currentTarget.contains(event.relatedTarget)
                           ) {
                              return;
                           }
                           setExitSlotActive(false);
                        }}
                        onDrop={(event) => {
                           if (draggingIndex === null) return;
                           event.preventDefault();
                           setExitSlotActive(false);
                           const raw = event.dataTransfer?.getData('text/plain') ?? '';
                           const from = Number.parseInt(raw, 10);
                           if (Number.isNaN(from)) return;
                           moveStepToEnd(from);
                        }}
                     >
                        <div aria-hidden="true" />
                        <AddStepMenu
                           onAdd={addStepAtEnd}
                           label={
                              steps.length === 0
                                 ? 'Add first step'
                                 : exitStep !== undefined
                                   ? 'Add step before exit'
                                   : 'Add step at end'
                           }
                        />
                     </div>
                  )}

                  {exitStep !== undefined && exitIndex >= 0 && (
                     <StepEditor
                        key={exitStep.id}
                        step={exitStep}
                        index={exitIndex}
                        total={steps.length}
                        templates={templates.templates}
                        disabled={!editable}
                        dragging={false}
                        onChange={(next) => patchStep(exitIndex, next)}
                        onMove={() => undefined}
                        onRemove={() => undefined}
                        onAddAfter={() => undefined}
                        onDragStart={() => undefined}
                        onDrop={() => undefined}
                        onDragEnd={() => undefined}
                     />
                  )}
               </div>
            </section>

            <aside className="grid content-start gap-4">
               <Card>
                  <CardHeader>
                     <CardTitle>Settings</CardTitle>
                     <CardDescription>
                        Name and sender apply to every send step in this automation.
                     </CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-4">
                     <Field
                        label="Name"
                        htmlFor="automation-detail-name"
                     >
                        <Input
                           id="automation-detail-name"
                           value={name}
                           disabled={!editable}
                           onInput={(event) => setName(event.currentTarget.value)}
                        />
                     </Field>
                     <Field
                        label="From name"
                        htmlFor="automation-detail-from-name"
                        required
                     >
                        <Input
                           id="automation-detail-from-name"
                           value={fromName}
                           disabled={!editable}
                           onInput={(event) => setFromName(event.currentTarget.value)}
                        />
                     </Field>
                     <SenderSelect
                        id="automation-detail-from-email"
                        value={fromEmail}
                        senders={senders.settings?.addresses ?? []}
                        loading={senders.loading}
                        error={senders.error}
                        disabled={!editable}
                        onRetry={senders.reload}
                        onChange={setFromEmail}
                     />
                     <TriggerFields
                        value={trigger}
                        onChange={(next) => {
                           setTrigger(next);
                           setNotice(null);
                        }}
                        disabled={!editable}
                        idPrefix="automation-detail"
                     />
                     <AudienceField
                        id="automation-entry-query"
                        value={entryQuery}
                        onChange={setEntryQuery}
                        disabled={!editable}
                        label="Who enters"
                        hint="Only subscribers who match this filter enter. Leave empty to enter everyone."
                        preview={audiencePreview}
                     />
                  </CardContent>
               </Card>

               <Card>
                  <CardHeader>
                     <CardTitle>Template variables</CardTitle>
                     <CardDescription>
                        Values available to send steps as{' '}
                        <code className="rounded bg-muted px-1 py-0.5">automation.meta.key</code>.
                     </CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-3">
                     {Object.keys(savedMetadata).length === 0 ? (
                        <p className="text-xs text-muted-foreground">
                           No variables yet. Add them from Workspace settings or with Manage
                           variables.
                        </p>
                     ) : (
                        <ul className="flex flex-wrap gap-1.5">
                           {Object.keys(savedMetadata).map((key) => (
                              <li key={key}>
                                 <code className="rounded-md border border-border bg-muted/60 px-2 py-0.5 text-[11px]">
                                    {key}
                                 </code>
                              </li>
                           ))}
                        </ul>
                     )}
                     <div>
                        <Button
                           variant="outline"
                           size="sm"
                           disabled={!editable}
                           onClick={() => {
                              setVariablesError(null);
                              setVariablesOpen(true);
                           }}
                        >
                           Manage variables
                        </Button>
                     </div>
                  </CardContent>
               </Card>
            </aside>
         </div>

         <Card>
            <CardHeader>
               <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="grid gap-1">
                     <CardTitle>Runs</CardTitle>
                     <CardDescription>
                        Each subscriber&apos;s journey through this sequence, with the emails it
                        produced.
                     </CardDescription>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                     <Input
                        aria-label="Search runs by subscriber"
                        placeholder="Search subscriber"
                        value={runQuery}
                        onInput={(event) => setRunQuery(event.currentTarget.value)}
                        className="h-8 w-48 text-xs"
                     />
                     <Select
                        value={runStatus.length === 0 ? 'all' : runStatus}
                        onValueChange={(value) =>
                           setRunStatus(value === 'all' ? '' : (value ?? ''))
                        }
                     >
                        <SelectTrigger
                           aria-label="Filter runs by status"
                           className="h-8 w-36 text-xs"
                        >
                           <span className="truncate">
                              {runStatus.length === 0 ? 'All statuses' : titleCase(runStatus)}
                           </span>
                        </SelectTrigger>
                        <SelectContent>
                           <SelectItem value="all">All statuses</SelectItem>
                           <SelectItem value="waiting">Waiting</SelectItem>
                           <SelectItem value="running">Running</SelectItem>
                           <SelectItem value="completed">Completed</SelectItem>
                           <SelectItem value="exited">Exited</SelectItem>
                           <SelectItem value="failed">Failed</SelectItem>
                        </SelectContent>
                     </Select>
                  </div>
               </div>
            </CardHeader>
            <CardContent>
               {runsError !== null ? (
                  <Alert variant="destructive">
                     <AlertDescription>{runsError}</AlertDescription>
                  </Alert>
               ) : runsLoading ? (
                  <p className="text-sm text-muted-foreground">Loading runs…</p>
               ) : runs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                     {runStatus.length > 0 || runQuery.trim().length > 0
                        ? 'No runs match this filter.'
                        : 'No runs yet. Create a subscriber, or use Enroll on an active automation.'}
                  </p>
               ) : (
                  <div className="overflow-x-auto">
                     <Table>
                        <TableHeader>
                           <TableRow>
                              <TableHead>Subscriber</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead>Step</TableHead>
                              <TableHead className="text-right">Sent</TableHead>
                              <TableHead className="text-right">Duration</TableHead>
                              <TableHead>Entered</TableHead>
                              <TableHead>Exit</TableHead>
                           </TableRow>
                        </TableHeader>
                        <TableBody>
                           {runs.map((run) => {
                              const expanded = expandedRunId === run.id;
                              return (
                                 <Fragment key={run.id}>
                                    <TableRow>
                                       <TableCell className="font-medium">
                                          <div className="flex items-center gap-1.5">
                                             <Button
                                                variant="ghost"
                                                size="icon"
                                                className="size-6 shrink-0 text-muted-foreground"
                                                aria-label={
                                                   expanded
                                                      ? `Hide details for ${run.email}`
                                                      : `Show details for ${run.email}`
                                                }
                                                aria-expanded={expanded}
                                                onClick={() =>
                                                   setExpandedRunId(expanded ? null : run.id)
                                                }
                                             >
                                                {expanded ? (
                                                   <ChevronDown aria-hidden="true" />
                                                ) : (
                                                   <ChevronRight aria-hidden="true" />
                                                )}
                                             </Button>
                                             <span className="truncate">{run.email}</span>
                                          </div>
                                       </TableCell>
                                       <TableCell>
                                          <Badge variant={runVariant(run.status)}>
                                             {titleCase(run.status)}
                                          </Badge>
                                       </TableCell>
                                       <TableCell className="text-muted-foreground">
                                          {run.currentStep}
                                       </TableCell>
                                       <TableCell className="text-right tabular-nums">
                                          {run.sentCount}
                                       </TableCell>
                                       <TableCell className="text-right tabular-nums text-muted-foreground">
                                          {formatDuration(run.durationMs)}
                                       </TableCell>
                                       <TableCell className="text-muted-foreground">
                                          {relativeTime(run.enteredAt)}
                                       </TableCell>
                                       <TableCell className="text-muted-foreground">
                                          {exitReasonLabel(run.exitReason)}
                                       </TableCell>
                                    </TableRow>
                                    {expanded && (
                                       <TableRow key={`${run.id}-details`}>
                                          <TableCell
                                             colSpan={7}
                                             className="bg-muted/30"
                                          >
                                             <RunDetails run={run} />
                                          </TableCell>
                                       </TableRow>
                                    )}
                                 </Fragment>
                              );
                           })}
                        </TableBody>
                     </Table>
                  </div>
               )}
            </CardContent>
         </Card>

         <Dialog
            open={variablesOpen}
            onOpenChange={(open) => {
               if (!open && !variablesBusy) {
                  setVariablesOpen(false);
                  setVariablesError(null);
                  if (automation !== null) {
                     setMetadataRows(metadataToRows(automation.metadata));
                     setSavedMetadata(automation.metadata);
                  }
               }
            }}
         >
            <DialogContent>
               <DialogHeader>
                  <DialogTitle>Template variables</DialogTitle>
                  <DialogDescription>
                     Values inserted into send steps as{' '}
                     <code className="rounded bg-muted px-1 py-0.5">automation.meta.key</code>.
                     Existing{' '}
                     <code className="rounded bg-muted px-1 py-0.5">campaign.meta.key</code> tags
                     resolve to the same values.
                  </DialogDescription>
               </DialogHeader>

               <MetadataEditor
                  idPrefix="automation-metadata-dialog"
                  scope="automation"
                  rows={metadataRows}
                  onChange={setMetadataRows}
                  disabled={!editable || variablesBusy}
               />

               {variablesError !== null && (
                  <p
                     role="alert"
                     className="text-sm text-destructive"
                  >
                     {variablesError}
                  </p>
               )}

               <DialogFooter>
                  <DialogClose disabled={variablesBusy}>Cancel</DialogClose>
                  <Button
                     disabled={variablesBusy || !editable}
                     onClick={() => void submitVariables()}
                  >
                     {variablesBusy ? 'Saving…' : 'Save variables'}
                  </Button>
               </DialogFooter>
            </DialogContent>
         </Dialog>

         <Dialog
            open={enrollOpen}
            onOpenChange={(open) => {
               if (!open && !enrollBusy) {
                  setEnrollOpen(false);
                  setEnrollError(null);
               }
            }}
         >
            <DialogContent>
               <DialogHeader>
                  <DialogTitle>Enroll a subscriber</DialogTitle>
                  <DialogDescription>
                     Add an existing subscriber to this run without waiting for a new signup.
                  </DialogDescription>
               </DialogHeader>
               <form
                  className="grid gap-4"
                  onSubmit={(event) => void submitEnroll(event)}
               >
                  <Field
                     label="Subscriber email"
                     htmlFor="automation-enroll-email"
                     error={enrollError ?? undefined}
                     required
                  >
                     <Input
                        id="automation-enroll-email"
                        type="email"
                        autoFocus
                        value={enrollEmail}
                        onInput={(event) => {
                           setEnrollEmail(event.currentTarget.value);
                           setEnrollError(null);
                        }}
                     />
                  </Field>
                  <DialogFooter>
                     <DialogClose disabled={enrollBusy}>Cancel</DialogClose>
                     <Button
                        type="submit"
                        disabled={enrollBusy}
                     >
                        {enrollBusy ? 'Enrolling...' : 'Enroll subscriber'}
                     </Button>
                  </DialogFooter>
               </form>
            </DialogContent>
         </Dialog>
      </div>
   );
}
