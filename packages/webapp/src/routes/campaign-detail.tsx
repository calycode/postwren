import { useEffect, useState } from 'react';
import { useLocation, useRoute } from 'preact-iso';
import { ArrowLeft, CalendarClock, MailCheck, Pause, Send, XCircle } from 'lucide-react';
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
   Dialog,
   DialogClose,
   DialogContent,
   DialogDescription,
   DialogFooter,
   DialogHeader,
   DialogTitle,
   Field,
   Input,
   Skeleton,
} from '@mailer/ui';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { PageHeader } from '@/components/page-header';
import { CampaignFields } from '@/components/campaigns/campaign-fields';
import { defaultSender, useSenders } from '@/components/campaigns/use-senders';
import { CampaignRecipients } from '@/components/campaigns/campaign-recipients';
import { CampaignStats } from '@/components/campaigns/campaign-stats';
import {
   formatUtcDateTime,
   parseLocalDateTime,
   toLocalDateTimeInput,
} from '@/components/campaigns/datetime';
import {
   EMPTY_CAMPAIGN_FORM,
   campaignFormToPatch,
   formFromCampaign,
   isCampaignFormDirty,
   validateCampaignForm,
} from '@/components/campaigns/form';
import type { CampaignFormState } from '@/components/campaigns/form';
import { toCampaignStatsView, toCampaignView } from '@/components/campaigns/model';
import type { CampaignStatsView, CampaignView } from '@/components/campaigns/model';
import {
   campaignActions,
   campaignStatusVariant,
   isEditableStatus,
} from '@/components/campaigns/status';
import { useAudiencePreview } from '@/components/campaigns/use-audience-preview';
import { useTemplates } from '@/components/campaigns/use-templates';
import {
   cancel as cancelCampaign,
   get as getCampaign,
   pause as pauseCampaign,
   schedule as scheduleCampaign,
   sendNow,
   stats as loadStats,
   test as sendTest,
   update as updateCampaign,
} from '@/lib/api/campaigns';
import { ApiError } from '@/lib/api/client';
import { useAuth } from '@/lib/auth';
import { errorMessage, fieldErrorsFrom, isEmail } from '@/lib/form-errors';
import type { FieldErrors } from '@/lib/form-errors';
import { formatDateTime, formatNumber, titleCase } from '@/lib/format';

function readOnlyNote(status: CampaignView['status']): string {
   switch (status) {
      case 'scheduled':
         return 'This campaign is locked until it sends or is cancelled.';
      case 'sending':
         return 'This campaign is sending. Stats refresh every 5 seconds.';
      case 'sent':
         return 'This campaign has finished sending. Recipients and stats are read-only.';
      case 'cancelled':
         return 'This campaign was cancelled. No further recipients will be sent.';
      case 'failed':
         return 'This campaign stopped after a failure. Review the stats before trying again.';
      default:
         return '';
   }
}

type SummaryItemProps = {
   label: string;
   value: string;
};

function SummaryItem({ label, value }: SummaryItemProps) {
   return (
      <div className="grid gap-1">
         <span className="text-xs font-medium text-muted-foreground">{label}</span>
         <span className="text-sm break-words">{value}</span>
      </div>
   );
}

export function CampaignDetail() {
   const { params } = useRoute();
   const { route } = useLocation();
   const { user } = useAuth();
   const id = params.id ?? '';
   const ownerEmail = user?.email ?? '';

   const [campaign, setCampaign] = useState<CampaignView | null>(null);
   const [loading, setLoading] = useState(true);
   const [loadError, setLoadError] = useState<string | null>(null);
   const [reloadKey, setReloadKey] = useState(0);

   const templates = useTemplates(true);

   const [form, setForm] = useState<CampaignFormState>(EMPTY_CAMPAIGN_FORM);
   const senders = useSenders(true);
   const [savedForm, setSavedForm] = useState<CampaignFormState>(EMPTY_CAMPAIGN_FORM);
   const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
   const [saving, setSaving] = useState(false);
   const [actionError, setActionError] = useState<string | null>(null);
   const [notice, setNotice] = useState<string | null>(null);

   const [stats, setStats] = useState<CampaignStatsView | null>(null);
   const [statsLoading, setStatsLoading] = useState(false);
   const [statsError, setStatsError] = useState<string | null>(null);
   const [statsReloadKey, setStatsReloadKey] = useState(0);

   const [scheduleOpen, setScheduleOpen] = useState(false);
   const [scheduleAt, setScheduleAt] = useState('');
   const [scheduleError, setScheduleError] = useState<string | null>(null);
   const [scheduleBusy, setScheduleBusy] = useState(false);

   const [sendOpen, setSendOpen] = useState(false);
   const [sendError, setSendError] = useState<string | null>(null);
   const [sendBusy, setSendBusy] = useState(false);

   const [pauseOpen, setPauseOpen] = useState(false);
   const [pauseError, setPauseError] = useState<string | null>(null);
   const [pauseBusy, setPauseBusy] = useState(false);

   const [cancelOpen, setCancelOpen] = useState(false);
   const [cancelError, setCancelError] = useState<string | null>(null);
   const [cancelBusy, setCancelBusy] = useState(false);

   const [testOpen, setTestOpen] = useState(false);
   const [testEmail, setTestEmail] = useState('');
   const [testError, setTestError] = useState<string | null>(null);
   const [testBusy, setTestBusy] = useState(false);

   const status = campaign?.status ?? null;
   const editable = campaign !== null && isEditableStatus(campaign.status);
   const actions = campaign === null ? null : campaignActions(campaign.status);
   const dirty = isCampaignFormDirty(form, savedForm);
   const audiencePreview = useAudiencePreview(form.audienceQuery, editable);
   const audienceCount =
      stats?.audienceSize ?? campaign?.audienceCount ?? audiencePreview.count ?? null;

   useEffect(() => {
      if (id.length === 0) {
         setLoading(false);
         setLoadError('The campaign id is missing from the address.');
         return;
      }

      let cancelled = false;
      setLoading(true);
      setLoadError(null);

      getCampaign(id)
         .then((result) => {
            if (cancelled) return;
            const next = toCampaignView(result);
            setCampaign(next);
            const nextForm = formFromCampaign(next);
            setForm(nextForm);
            setSavedForm(nextForm);
         })
         .catch((cause: unknown) => {
            if (!cancelled) setLoadError(errorMessage(cause, 'Could not load the campaign'));
         })
         .finally(() => {
            if (!cancelled) setLoading(false);
         });

      return () => {
         cancelled = true;
      };
   }, [id, reloadKey]);

   useEffect(() => {
      if (id.length === 0 || status === null || status === 'draft') {
         setStats(null);
         setStatsLoading(false);
         setStatsError(null);
         return;
      }

      let cancelled = false;
      setStatsLoading(true);
      setStatsError(null);

      loadStats(id)
         .then((result) => {
            if (!cancelled) setStats(toCampaignStatsView(result));
         })
         .catch((cause: unknown) => {
            if (!cancelled) setStatsError(errorMessage(cause, 'Could not load campaign stats'));
         })
         .finally(() => {
            if (!cancelled) setStatsLoading(false);
         });

      return () => {
         cancelled = true;
      };
   }, [id, status, statsReloadKey]);

   useEffect(() => {
      if (id.length === 0 || status !== 'sending') return;

      let cancelled = false;

      const tick = async (): Promise<void> => {
         const campaignResult = await getCampaign(id).catch(() => null);
         if (!cancelled && campaignResult !== null) {
            setCampaign(toCampaignView(campaignResult));
         }

         try {
            const result = await loadStats(id);
            if (!cancelled) {
               setStats(toCampaignStatsView(result));
               setStatsError(null);
            }
         } catch (cause) {
            if (!cancelled) setStatsError(errorMessage(cause, 'Could not refresh campaign stats'));
         }
      };

      const timer = window.setInterval(() => {
         void tick();
      }, 5000);

      return () => {
         cancelled = true;
         window.clearInterval(timer);
      };
   }, [id, status]);

   function updateForm(patch: Partial<CampaignFormState>): void {
      setForm((current) => ({ ...current, ...patch }));
      setFieldErrors((current) => {
         const next = { ...current };
         for (const key of Object.keys(patch)) delete next[key];
         return next;
      });
   }

   function applyCampaign(result: unknown): void {
      const next = toCampaignView(result);
      setCampaign(next);
      const nextForm = formFromCampaign(next);
      setForm(nextForm);
      setSavedForm(nextForm);
   }

   async function save(): Promise<void> {
      if (campaign === null || !editable || saving) return;

      const nextErrors = validateCampaignForm(form);
      if (Object.keys(nextErrors).length > 0) {
         setFieldErrors(nextErrors);
         setActionError('Fix the highlighted fields before saving.');
         return;
      }

      setSaving(true);
      setActionError(null);
      setNotice(null);
      setFieldErrors({});

      try {
         const updated = await updateCampaign(campaign.id, campaignFormToPatch(form));
         applyCampaign(updated);
         setNotice('Changes saved.');
      } catch (cause) {
         setActionError(errorMessage(cause, 'Could not save the campaign'));
         setFieldErrors(cause instanceof ApiError ? fieldErrorsFrom(cause.details) : {});
      } finally {
         setSaving(false);
      }
   }

   function openSchedule(): void {
      if (campaign === null) return;
      if (dirty) {
         setActionError('Save your changes before scheduling this campaign.');
         return;
      }

      setActionError(null);
      setNotice(null);
      setScheduleAt(toLocalDateTimeInput(Math.floor(Date.now() / 1000) + 3600));
      setScheduleError(null);
      setScheduleOpen(true);
   }

   async function confirmSchedule(): Promise<void> {
      if (campaign === null) return;

      const seconds = parseLocalDateTime(scheduleAt);
      if (seconds === null) {
         setScheduleError('Choose a date and time.');
         return;
      }
      if (seconds <= Math.floor(Date.now() / 1000)) {
         setScheduleError('Choose a time in the future.');
         return;
      }

      setScheduleBusy(true);
      setScheduleError(null);
      try {
         const updated = await scheduleCampaign(campaign.id, seconds);
         applyCampaign(updated);
         setScheduleOpen(false);
         setNotice(`Campaign scheduled for ${formatDateTime(seconds)}.`);
      } catch (cause) {
         setScheduleError(errorMessage(cause, 'Could not schedule the campaign'));
      } finally {
         setScheduleBusy(false);
      }
   }

   function openSendNow(): void {
      if (campaign === null) return;
      if (dirty) {
         setActionError('Save your changes before sending this campaign.');
         return;
      }

      setActionError(null);
      setNotice(null);
      setSendError(null);
      setSendOpen(true);
   }

   async function confirmSendNow(): Promise<void> {
      if (campaign === null) return;

      setSendBusy(true);
      setSendError(null);
      try {
         const updated = await sendNow(campaign.id);
         const next = toCampaignView(updated);
         applyCampaign(updated);
         setSendOpen(false);
         setNotice(`Campaign status is now ${next.status}.`);
      } catch (cause) {
         setSendError(errorMessage(cause, 'Could not start the campaign'));
      } finally {
         setSendBusy(false);
      }
   }

   function openPause(): void {
      setActionError(null);
      setNotice(null);
      setPauseError(null);
      setPauseOpen(true);
   }

   async function confirmPause(): Promise<void> {
      if (campaign === null) return;

      setPauseBusy(true);
      setPauseError(null);
      try {
         const updated = await pauseCampaign(campaign.id);
         applyCampaign(updated);
         setPauseOpen(false);
         setNotice('Campaign paused.');
      } catch (cause) {
         setPauseError(errorMessage(cause, 'Could not pause the campaign'));
      } finally {
         setPauseBusy(false);
      }
   }

   function openCancel(): void {
      setActionError(null);
      setNotice(null);
      setCancelError(null);
      setCancelOpen(true);
   }

   async function confirmCancel(): Promise<void> {
      if (campaign === null) return;

      setCancelBusy(true);
      setCancelError(null);
      try {
         const updated = await cancelCampaign(campaign.id);
         applyCampaign(updated);
         setCancelOpen(false);
         setNotice('Campaign cancelled.');
      } catch (cause) {
         setCancelError(errorMessage(cause, 'Could not cancel the campaign'));
      } finally {
         setCancelBusy(false);
      }
   }

   function openTest(): void {
      setActionError(null);
      setNotice(null);
      setTestEmail(ownerEmail);
      setTestError(null);
      setTestOpen(true);
   }

   async function submitTest(event: Event): Promise<void> {
      event.preventDefault();
      if (campaign === null) return;

      const recipient = testEmail.trim().length > 0 ? testEmail.trim() : ownerEmail.trim();
      if (!isEmail(recipient)) {
         setTestError('Enter a valid email address.');
         return;
      }

      setTestBusy(true);
      setTestError(null);
      try {
         await sendTest(campaign.id, recipient);
         setTestOpen(false);
         setNotice(`Test message sent to ${recipient}.`);
      } catch (cause) {
         setTestError(errorMessage(cause, 'Could not send the test message'));
      } finally {
         setTestBusy(false);
      }
   }

   const selectedTemplate =
      campaign === null
         ? undefined
         : templates.templates.find((template) => template.id === campaign.templateId);
   const templateRevision = selectedTemplate?.revision ?? campaign?.templateRevision ?? null;
   const templateName = selectedTemplate?.name ?? campaign?.templateId ?? '—';
   const scheduleSeconds = parseLocalDateTime(scheduleAt);

   return (
      <div className="grid gap-6">
         <PageHeader
            title={campaign?.name ?? 'Campaign'}
            description={
               campaign === null ? 'Campaign detail' : `${titleCase(campaign.status)} campaign`
            }
            actions={
               campaign === null ? undefined : (
                  <>
                     <Badge variant={campaignStatusVariant(campaign.status)}>
                        {titleCase(campaign.status)}
                     </Badge>
                     {actions?.save === true && (
                        <Button
                           disabled={!dirty || saving}
                           onClick={() => void save()}
                        >
                           {saving ? 'Saving…' : 'Save'}
                        </Button>
                     )}
                     {actions?.schedule === true && (
                        <Button
                           variant="outline"
                           disabled={saving}
                           onClick={openSchedule}
                        >
                           <CalendarClock aria-hidden="true" />
                           Schedule
                        </Button>
                     )}
                     {actions?.sendNow === true && (
                        <Button
                           disabled={saving}
                           onClick={openSendNow}
                        >
                           <Send aria-hidden="true" />
                           Send now
                        </Button>
                     )}
                     {actions?.pause === true && (
                        <Button
                           variant="outline"
                           onClick={openPause}
                        >
                           <Pause aria-hidden="true" />
                           Pause
                        </Button>
                     )}
                     {actions?.cancel === true && (
                        <Button
                           variant="destructive"
                           onClick={openCancel}
                        >
                           <XCircle aria-hidden="true" />
                           Cancel
                        </Button>
                     )}
                     {actions?.sendTest === true && (
                        <Button
                           variant="outline"
                           onClick={openTest}
                        >
                           <MailCheck aria-hidden="true" />
                           Send test
                        </Button>
                     )}
                  </>
               )
            }
         />

         {loading ? (
            <div className="grid gap-4">
               <Skeleton className="h-8 w-64" />
               <Skeleton className="h-48 w-full" />
            </div>
         ) : loadError !== null ? (
            <Alert variant="destructive">
               <AlertTitle>Could not load this campaign</AlertTitle>
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
         ) : campaign === null ? (
            <Alert>
               <AlertDescription>The campaign could not be found.</AlertDescription>
            </Alert>
         ) : (
            <>
               {notice !== null && (
                  <Alert variant="success">
                     <AlertDescription>{notice}</AlertDescription>
                  </Alert>
               )}

               {actionError !== null && (
                  <Alert variant="destructive">
                     <AlertDescription>{actionError}</AlertDescription>
                  </Alert>
               )}

               {editable ? (
                  <>
                     {campaign.status === 'paused' && (
                        <Alert variant="warning">
                           <AlertDescription>
                              This campaign is paused. Save your edits, then use Send now to resume
                              it.
                           </AlertDescription>
                        </Alert>
                     )}

                     <Card>
                        <CardHeader>
                           <CardTitle>Campaign settings</CardTitle>
                           <CardDescription>
                              Changes only affect this campaign. The pinned template revision is
                              updated when you save.
                           </CardDescription>
                        </CardHeader>
                        <CardContent>
                           <CampaignFields
                              idPrefix="campaign"
                              form={form}
                              onChange={updateForm}
                              errors={fieldErrors}
                              templates={templates.templates}
                              templatesLoading={templates.loading}
                              templatesError={templates.error}
                              onRetryTemplates={templates.reload}
                              disabled={saving}
                              templateRevision={campaign.templateRevision}
                              audiencePreview={audiencePreview}
                              senders={senders.settings?.addresses}
                              sendersLoading={senders.loading}
                              sendersError={senders.error}
                              onRetrySenders={senders.reload}
                           />
                        </CardContent>
                     </Card>

                     {campaign.status === 'paused' && (
                        <CampaignStats
                           stats={stats}
                           loading={statsLoading}
                           error={statsError}
                           onRetry={() => setStatsReloadKey((key) => key + 1)}
                        />
                     )}
                  </>
               ) : (
                  <>
                     <p className="text-sm text-muted-foreground">
                        {readOnlyNote(campaign.status)}
                     </p>

                     <Card>
                        <CardHeader>
                           <CardTitle>Summary</CardTitle>
                           <CardDescription>What was pinned for this campaign.</CardDescription>
                        </CardHeader>
                        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                           <SummaryItem
                              label="Template"
                              value={`${templateName}${templateRevision !== null ? ` · v${templateRevision}` : ''}`}
                           />
                           <SummaryItem
                              label="Subject"
                              value={campaign.subject}
                           />
                           <SummaryItem
                              label="From"
                              value={`${campaign.fromName} <${campaign.fromEmail}>`}
                           />
                           <SummaryItem
                              label="Reply-to"
                              value={campaign.replyTo ?? '—'}
                           />
                           <SummaryItem
                              label="Audience"
                              value={
                                 campaign.audienceQuery.trim().length > 0
                                    ? campaign.audienceQuery
                                    : 'All active subscribers'
                              }
                           />
                           <SummaryItem
                              label="Scheduled for"
                              value={formatDateTime(campaign.scheduledAt)}
                           />
                           <SummaryItem
                              label="UTM"
                              value={
                                 [campaign.utmSource, campaign.utmMedium, campaign.utmCampaign]
                                    .filter((part) => part.length > 0)
                                    .join(' / ') || '—'
                              }
                           />
                           <SummaryItem
                              label="Updated"
                              value={formatDateTime(campaign.updated_at)}
                           />
                        </CardContent>
                     </Card>

                     <CampaignStats
                        stats={stats}
                        loading={statsLoading}
                        error={statsError}
                        onRetry={() => setStatsReloadKey((key) => key + 1)}
                     />

                     {(campaign.status === 'sending' || campaign.status === 'sent') && (
                        <CampaignRecipients
                           campaignId={campaign.id}
                           refreshKey={campaign.status}
                        />
                     )}
                  </>
               )}
            </>
         )}

         <Dialog
            open={scheduleOpen}
            onOpenChange={(open) => {
               setScheduleOpen(open);
               if (!open) setScheduleError(null);
            }}
         >
            <DialogContent>
               <DialogHeader>
                  <DialogTitle>Schedule campaign</DialogTitle>
                  <DialogDescription>
                     Choose a local time. The audience is pinned when the campaign is scheduled.
                  </DialogDescription>
               </DialogHeader>

               <Field
                  label="Send at"
                  htmlFor="campaign-schedule-at"
                  error={scheduleError}
                  required
               >
                  <Input
                     id="campaign-schedule-at"
                     type="datetime-local"
                     value={scheduleAt}
                     aria-invalid={scheduleError ? 'true' : undefined}
                     aria-describedby={scheduleError ? 'campaign-schedule-at-error' : undefined}
                     onInput={(event) => {
                        setScheduleAt(event.currentTarget.value);
                        setScheduleError(null);
                     }}
                  />
               </Field>

               <p className="text-xs text-muted-foreground">
                  {scheduleSeconds !== null
                     ? `Resolves to ${formatUtcDateTime(scheduleSeconds)}`
                     : 'Choose a date and time to see the resolved UTC time.'}
               </p>

               <DialogFooter>
                  <DialogClose disabled={scheduleBusy}>Cancel</DialogClose>
                  <Button
                     disabled={scheduleBusy}
                     onClick={() => void confirmSchedule()}
                  >
                     {scheduleBusy ? 'Scheduling…' : 'Schedule campaign'}
                  </Button>
               </DialogFooter>
            </DialogContent>
         </Dialog>

         <Dialog
            open={testOpen}
            onOpenChange={(open) => {
               setTestOpen(open);
               if (!open) setTestError(null);
            }}
         >
            <DialogContent>
               <DialogHeader>
                  <DialogTitle>Send test</DialogTitle>
                  <DialogDescription>
                     Send a rendered copy without creating recipient rows or affecting stats.
                  </DialogDescription>
               </DialogHeader>

               <form
                  className="grid gap-4"
                  onSubmit={(event) => void submitTest(event)}
                  noValidate
               >
                  <Field
                     label="Recipient"
                     htmlFor="campaign-test-email"
                     hint={
                        ownerEmail.length > 0
                           ? `Leave empty to use ${ownerEmail}.`
                           : 'Enter an address to send the test.'
                     }
                  >
                     <Input
                        id="campaign-test-email"
                        type="email"
                        value={testEmail}
                        placeholder={ownerEmail}
                        autoComplete="email"
                        onInput={(event) => {
                           setTestEmail(event.currentTarget.value);
                           setTestError(null);
                        }}
                     />
                  </Field>

                  {testError !== null && (
                     <p
                        role="alert"
                        className="text-sm text-destructive"
                     >
                        {testError}
                     </p>
                  )}

                  <DialogFooter>
                     <DialogClose disabled={testBusy}>Cancel</DialogClose>
                     <Button
                        type="submit"
                        disabled={testBusy}
                     >
                        {testBusy ? 'Sending…' : 'Send test'}
                     </Button>
                  </DialogFooter>
               </form>
            </DialogContent>
         </Dialog>

         <ConfirmDialog
            open={sendOpen}
            onOpenChange={(open) => {
               setSendOpen(open);
               if (!open) setSendError(null);
            }}
            title="Send campaign now"
            description={
               campaign === null
                  ? ''
                  : `Send "${campaign.name}" now to ${
                       audienceCount !== null
                          ? `${formatNumber(audienceCount)} subscribers`
                          : 'the current audience'
                    }? Sending starts immediately.`
            }
            confirmLabel="Send now"
            loading={sendBusy}
            error={sendError}
            onConfirm={confirmSendNow}
         />

         <ConfirmDialog
            open={pauseOpen}
            onOpenChange={(open) => {
               setPauseOpen(open);
               if (!open) setPauseError(null);
            }}
            title="Pause campaign"
            description="Pause sending? Queued recipients stay queued until you resume with Send now."
            confirmLabel="Pause campaign"
            loading={pauseBusy}
            error={pauseError}
            onConfirm={confirmPause}
         />

         <ConfirmDialog
            open={cancelOpen}
            onOpenChange={(open) => {
               setCancelOpen(open);
               if (!open) setCancelError(null);
            }}
            title="Cancel campaign"
            description="Cancel this campaign? No further recipients will be sent. This cannot be undone."
            confirmLabel="Cancel campaign"
            destructive
            loading={cancelBusy}
            error={cancelError}
            onConfirm={confirmCancel}
         />

         <div className="flex flex-wrap gap-2">
            <Button
               variant="outline"
               onClick={() => route('/campaigns')}
            >
               <ArrowLeft aria-hidden="true" />
               Back to campaigns
            </Button>
         </div>
      </div>
   );
}
