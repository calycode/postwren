import { useEffect, useState } from 'react';
import { useLocation } from 'preact-iso';
import {
   Alert,
   AlertDescription,
   Button,
   Dialog,
   DialogClose,
   DialogContent,
   DialogDescription,
   DialogFooter,
   DialogHeader,
   DialogTitle,
} from '@mailer/ui';
import { ApiError } from '@/lib/api/client';
import { create as createCampaign } from '@/lib/api/campaigns';
import { errorMessage, fieldErrorsFrom } from '@/lib/form-errors';
import type { FieldErrors } from '@/lib/form-errors';
import { CampaignFields } from './campaign-fields';
import { EMPTY_CAMPAIGN_FORM, campaignFormToInput, validateCampaignForm } from './form';
import { defaultSender, useSenders } from './use-senders';
import type { CampaignFormState } from './form';
import { toCampaignView } from './model';
import { useTemplates } from './use-templates';

export type NewCampaignDialogProps = {
   open: boolean;
   onOpenChange: (open: boolean) => void;
};

export function NewCampaignDialog({ open, onOpenChange }: NewCampaignDialogProps) {
   const { route } = useLocation();
   const templates = useTemplates(open);
   const senders = useSenders(open);
   const [form, setForm] = useState<CampaignFormState>(EMPTY_CAMPAIGN_FORM);
   const [errors, setErrors] = useState<FieldErrors>({});
   const [formError, setFormError] = useState<string | null>(null);
   const [creating, setCreating] = useState(false);

   useEffect(() => {
      if (!open) return;
      setForm(EMPTY_CAMPAIGN_FORM);
      setErrors({});
      setFormError(null);
   }, [open]);

   useEffect(() => {
      if (!open || !senders.settings) return;

      const sender = defaultSender(senders.settings);
      if (sender === undefined) return;

      setForm((current) => {
         if (current.fromEmail.length > 0) return current;
         return {
            ...current,
            fromEmail: sender.email,
            fromName: current.fromName.length > 0 ? current.fromName : sender.name,
         };
      });
   }, [open, senders.settings]);

   function updateForm(patch: Partial<CampaignFormState>): void {
      setForm((current) => ({ ...current, ...patch }));
   }

   async function submit(event: Event): Promise<void> {
      event.preventDefault();
      setFormError(null);
      setErrors({});

      const nextErrors = validateCampaignForm(form);
      if (Object.keys(nextErrors).length > 0) {
         setErrors(nextErrors);
         return;
      }

      setCreating(true);
      try {
         const created = await createCampaign(campaignFormToInput(form));
         const campaign = toCampaignView(created);
         onOpenChange(false);
         route(`/campaigns/${campaign.id}`);
      } catch (cause) {
         setFormError(errorMessage(cause, 'Could not create the campaign'));
         setErrors(cause instanceof ApiError ? fieldErrorsFrom(cause.details) : {});
      } finally {
         setCreating(false);
      }
   }

   return (
      <Dialog
         open={open}
         onOpenChange={(next) => {
            if (!next) {
               setErrors({});
               setFormError(null);
            }
            onOpenChange(next);
         }}
      >
         <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader>
               <DialogTitle>New campaign</DialogTitle>
               <DialogDescription>
                  Pin a template revision and choose who should receive it. The campaign starts as a
                  draft.
               </DialogDescription>
            </DialogHeader>

            <form
               className="grid gap-5"
               onSubmit={(event) => void submit(event)}
               noValidate
            >
               <CampaignFields
                  idPrefix="new-campaign"
                  form={form}
                  onChange={updateForm}
                  errors={errors}
                  templates={templates.templates}
                  templatesLoading={templates.loading}
                  templatesError={templates.error}
                  onRetryTemplates={templates.reload}
                  disabled={creating}
                  senders={senders.settings?.addresses}
                  sendersLoading={senders.loading}
                  sendersError={senders.error}
                  onRetrySenders={senders.reload}
               />

               {formError !== null && (
                  <Alert variant="destructive">
                     <AlertDescription>{formError}</AlertDescription>
                  </Alert>
               )}

               <DialogFooter>
                  <DialogClose disabled={creating}>Cancel</DialogClose>
                  <Button
                     type="submit"
                     disabled={creating}
                  >
                     {creating ? 'Creating…' : 'Create campaign'}
                  </Button>
               </DialogFooter>
            </form>
         </DialogContent>
      </Dialog>
   );
}
