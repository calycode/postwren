import { parsePayload } from '@postwren/shared/payload';
import type { CampaignInput, CampaignPatch } from '@/lib/api/campaigns';
import type { FieldErrors } from '@/lib/form-errors';
import { isEmail } from '@/lib/form-errors';
import {
   metadataPatchFromRows,
   metadataToRows,
   rowsToMetadata,
   validateMetadataRows,
} from '@/lib/metadata';
import type { MetadataRow } from '@/lib/metadata';
import type { CampaignView } from './model';

export type CampaignFormState = {
   name: string;
   templateId: string;
   subject: string;
   fromName: string;
   fromEmail: string;
   replyTo: string;
   audienceQuery: string;
   utmSource: string;
   utmMedium: string;
   utmCampaign: string;
   metadata: MetadataRow[];
   data: string;
};

export const EMPTY_CAMPAIGN_FORM: CampaignFormState = {
   name: '',
   templateId: '',
   subject: '',
   fromName: '',
   fromEmail: '',
   replyTo: '',
   audienceQuery: '',
   utmSource: '',
   utmMedium: '',
   utmCampaign: '',
   metadata: [],
   data: '',
};

export function formFromCampaign(campaign: CampaignView): CampaignFormState {
   return {
      name: campaign.name,
      templateId: campaign.templateId,
      subject: campaign.subject,
      fromName: campaign.fromName,
      fromEmail: campaign.fromEmail,
      replyTo: campaign.replyTo ?? '',
      audienceQuery: campaign.audienceQuery,
      utmSource: campaign.utmSource,
      utmMedium: campaign.utmMedium,
      utmCampaign: campaign.utmCampaign,
      metadata: metadataToRows(campaign.metadata),
      data: Object.keys(campaign.data).length > 0 ? JSON.stringify(campaign.data, null, 2) : '',
   };
}

function dataFromText(text: string): Record<string, unknown> {
   if (text.trim().length === 0) return {};
   try {
      const parsed: unknown = JSON.parse(text);
      const result = parsePayload(parsed);
      return result.ok ? result.data : {};
   } catch {
      return {};
   }
}

function optional(value: string): string | undefined {
   const trimmed = value.trim();
   return trimmed.length > 0 ? trimmed : undefined;
}

export function campaignFormToInput(form: CampaignFormState): CampaignInput {
   return {
      name: form.name.trim(),
      templateId: form.templateId.trim(),
      subject: form.subject.trim(),
      fromName: form.fromName.trim(),
      fromEmail: form.fromEmail.trim().toLowerCase(),
      replyTo: optional(form.replyTo),
      audienceQuery: form.audienceQuery.trim(),
      utmSource: optional(form.utmSource),
      utmMedium: optional(form.utmMedium),
      utmCampaign: optional(form.utmCampaign),
      metadata: rowsToMetadata(form.metadata),
      data: dataFromText(form.data),
   };
}

export function campaignFormToPatch(
   form: CampaignFormState,
   saved: CampaignFormState = EMPTY_CAMPAIGN_FORM,
): CampaignPatch {
   return {
      ...campaignFormToInput(form),
      metadata: metadataPatchFromRows(rowsToMetadata(saved.metadata), form.metadata),
   };
}

function metadataKey(rows: MetadataRow[]): string {
   return JSON.stringify(rows.map((row) => [row.key, row.value]));
}

export function isCampaignFormDirty(form: CampaignFormState, saved: CampaignFormState): boolean {
   return (
      form.name !== saved.name ||
      form.templateId !== saved.templateId ||
      form.subject !== saved.subject ||
      form.fromName !== saved.fromName ||
      form.fromEmail !== saved.fromEmail ||
      form.replyTo !== saved.replyTo ||
      form.audienceQuery !== saved.audienceQuery ||
      form.utmSource !== saved.utmSource ||
      form.utmMedium !== saved.utmMedium ||
      form.utmCampaign !== saved.utmCampaign ||
      form.data !== saved.data ||
      metadataKey(form.metadata) !== metadataKey(saved.metadata)
   );
}

export function validateCampaignForm(form: CampaignFormState): FieldErrors {
   const errors: FieldErrors = {};
   const name = form.name.trim();
   const templateId = form.templateId.trim();
   const subject = form.subject.trim();
   const fromName = form.fromName.trim();
   const fromEmail = form.fromEmail.trim();
   const replyTo = form.replyTo.trim();

   if (name.length === 0) errors.name = 'Enter a campaign name.';
   else if (name.length > 200) errors.name = 'Name must be 200 characters or fewer.';

   if (templateId.length === 0) errors.templateId = 'Choose a template.';

   if (subject.length === 0) errors.subject = 'Enter a subject line.';
   else if (subject.length > 998) errors.subject = 'Subject must be 998 characters or fewer.';

   if (fromName.length === 0) errors.fromName = 'Enter a sender name.';
   else if (fromName.length > 100) errors.fromName = 'Sender name must be 100 characters or fewer.';

   if (!isEmail(fromEmail)) errors.fromEmail = 'Enter a valid sender email address.';

   if (replyTo.length > 0 && !isEmail(replyTo)) {
      errors.replyTo = 'Enter a valid reply-to email address.';
   }

   if (form.audienceQuery.trim().length > 2000) {
      errors.audienceQuery = 'Audience query must be 2,000 characters or fewer.';
   }

   if (form.utmSource.trim().length > 100) {
      errors.utmSource = 'UTM source must be 100 characters or fewer.';
   }
   if (form.utmMedium.trim().length > 100) {
      errors.utmMedium = 'UTM medium must be 100 characters or fewer.';
   }
   if (form.utmCampaign.trim().length > 191) {
      errors.utmCampaign = 'UTM campaign must be 191 characters or fewer.';
   }

   const metadata = validateMetadataRows(form.metadata);
   if (metadata.general !== undefined || metadata.rowErrors.some((error) => error !== undefined)) {
      errors.metadata = 'Fix the highlighted custom fields.';
   }

   if (form.data.trim().length > 0) {
      try {
         const result = parsePayload(JSON.parse(form.data));
         if (!result.ok) errors.data = result.errors[0] ?? 'Campaign data is invalid.';
      } catch {
         errors.data = 'Campaign data must be valid JSON.';
      }
   }

   return errors;
}
