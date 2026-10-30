import type { ComponentChildren } from 'preact';
import {
   Button,
   Field,
   Input,
   Select,
   SelectContent,
   SelectItem,
   SelectTrigger,
   SelectValue,
} from '@postwren/ui';
import type { SenderAddress, Template } from '@/lib/api/types';
import type { FieldErrors } from '@/lib/form-errors';
import { MetadataEditor } from '@/components/metadata-editor';
import { AudienceField } from './audience-field';
import { SenderSelect } from './sender-select';
import type { CampaignFormState } from './form';
import type { AudiencePreviewState } from './use-audience-preview';

export type CampaignFieldsProps = {
   idPrefix: string;
   form: CampaignFormState;
   onChange: (patch: Partial<CampaignFormState>) => void;
   errors: FieldErrors;
   templates: Template[];
   templatesLoading: boolean;
   templatesError: string | null;
   onRetryTemplates: () => void;
   disabled?: boolean;
   templateRevision?: number | null;
   audiencePreview?: AudiencePreviewState;
   audienceHint?: ComponentChildren;
   senders?: SenderAddress[];
   sendersLoading?: boolean;
   sendersError?: string | null;
   onRetrySenders?: () => void;
};

export function CampaignFields({
   idPrefix,
   form,
   onChange,
   errors,
   templates,
   templatesLoading,
   templatesError,
   onRetryTemplates,
   disabled = false,
   templateRevision,
   audiencePreview,
   audienceHint,
   senders,
   sendersLoading = false,
   sendersError = null,
   onRetrySenders,
}: CampaignFieldsProps) {
   const selectedTemplate = templates.find((template) => template.id === form.templateId);
   const revision = selectedTemplate?.revision ?? templateRevision ?? null;

   function selectTemplate(value: string | null): void {
      const templateId = value ?? '';
      const template = templates.find((item) => item.id === templateId);
      const fillSubject = form.subject.trim().length === 0 && template !== undefined;
      onChange({
         templateId,
         ...(fillSubject ? { subject: template.subject } : {}),
      });
   }

   return (
      <div className="grid gap-5">
         <Field
            label="Campaign name"
            htmlFor={`${idPrefix}-name`}
            error={errors.name}
            required
         >
            <Input
               id={`${idPrefix}-name`}
               value={form.name}
               disabled={disabled}
               autoComplete="off"
               aria-invalid={errors.name ? 'true' : undefined}
               aria-describedby={errors.name ? `${idPrefix}-name-error` : undefined}
               onInput={(event) => onChange({ name: event.currentTarget.value })}
            />
         </Field>

         <div className="grid gap-2">
            <Field
               label="Template"
               htmlFor={`${idPrefix}-template`}
               error={errors.templateId}
               hint={
                  selectedTemplate !== undefined
                     ? `${selectedTemplate.name} · last revision v${selectedTemplate.revision}`
                     : revision !== null
                       ? `Pinned revision v${revision}`
                       : undefined
               }
               required
            >
               <Select
                  value={form.templateId.length > 0 ? form.templateId : null}
                  onValueChange={selectTemplate}
                  disabled={disabled || templatesLoading || templates.length === 0}
               >
                  <SelectTrigger
                     id={`${idPrefix}-template`}
                     aria-invalid={errors.templateId ? 'true' : undefined}
                     aria-describedby={errors.templateId ? `${idPrefix}-template-error` : undefined}
                  >
                     <SelectValue
                        placeholder={templatesLoading ? 'Loading templates…' : 'Choose a template'}
                     />
                  </SelectTrigger>
                  <SelectContent>
                     {templates.map((template) => (
                        <SelectItem
                           key={template.id}
                           value={template.id}
                        >
                           {template.name} · v{template.revision}
                        </SelectItem>
                     ))}
                  </SelectContent>
               </Select>
            </Field>

            {templatesError !== null && (
               <div
                  role="alert"
                  className="grid gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive"
               >
                  <p>{templatesError}</p>
                  <div>
                     <Button
                        variant="outline"
                        size="sm"
                        onClick={onRetryTemplates}
                     >
                        Try again
                     </Button>
                  </div>
               </div>
            )}

            {!templatesLoading && templatesError === null && templates.length === 0 && (
               <p className="text-xs text-muted-foreground">
                  No templates yet.{' '}
                  <a
                     href="/templates"
                     className="underline underline-offset-4"
                  >
                     Create a template first.
                  </a>
               </p>
            )}
         </div>

         <Field
            label="Subject"
            htmlFor={`${idPrefix}-subject`}
            error={errors.subject}
            required
         >
            <Input
               id={`${idPrefix}-subject`}
               value={form.subject}
               disabled={disabled}
               aria-invalid={errors.subject ? 'true' : undefined}
               aria-describedby={errors.subject ? `${idPrefix}-subject-error` : undefined}
               onInput={(event) => onChange({ subject: event.currentTarget.value })}
            />
         </Field>

         <div className="grid gap-4 sm:grid-cols-2">
            <Field
               label="From name"
               htmlFor={`${idPrefix}-from-name`}
               error={errors.fromName}
               required
            >
               <Input
                  id={`${idPrefix}-from-name`}
                  value={form.fromName}
                  disabled={disabled}
                  autoComplete="name"
                  aria-invalid={errors.fromName ? 'true' : undefined}
                  aria-describedby={errors.fromName ? `${idPrefix}-from-name-error` : undefined}
                  onInput={(event) => onChange({ fromName: event.currentTarget.value })}
               />
            </Field>

            {senders !== undefined ? (
               <SenderSelect
                  id={`${idPrefix}-from-email`}
                  value={form.fromEmail}
                  senders={senders}
                  loading={sendersLoading}
                  error={sendersError}
                  disabled={disabled}
                  validationError={errors.fromEmail}
                  onRetry={() => onRetrySenders?.()}
                  onChange={(fromEmail) => onChange({ fromEmail })}
               />
            ) : (
               <Field
                  label="From email"
                  htmlFor={`${idPrefix}-from-email`}
                  error={errors.fromEmail}
                  required
               >
                  <Input
                     id={`${idPrefix}-from-email`}
                     type="email"
                     value={form.fromEmail}
                     disabled={disabled}
                     autoComplete="email"
                     aria-invalid={errors.fromEmail ? 'true' : undefined}
                     aria-describedby={
                        errors.fromEmail ? `${idPrefix}-from-email-error` : undefined
                     }
                     onInput={(event) => onChange({ fromEmail: event.currentTarget.value })}
                  />
               </Field>
            )}
         </div>

         <Field
            label="Reply-to"
            htmlFor={`${idPrefix}-reply-to`}
            error={errors.replyTo}
            hint="Optional. Replies go here instead of the from address."
         >
            <Input
               id={`${idPrefix}-reply-to`}
               type="email"
               value={form.replyTo}
               disabled={disabled}
               autoComplete="email"
               aria-invalid={errors.replyTo ? 'true' : undefined}
               aria-describedby={errors.replyTo ? `${idPrefix}-reply-to-error` : undefined}
               onInput={(event) => onChange({ replyTo: event.currentTarget.value })}
            />
         </Field>

         <AudienceField
            id={`${idPrefix}-audience`}
            value={form.audienceQuery}
            onChange={(audienceQuery) => onChange({ audienceQuery })}
            error={errors.audienceQuery}
            disabled={disabled}
            hint={audienceHint}
            preview={audiencePreview}
         />

         <div className="grid gap-2">
            <h3 className="text-sm font-medium">Custom fields</h3>
            <p className="text-xs text-muted-foreground">
               Campaign-wide values available to this campaign&apos;s content as{' '}
               <code className="rounded bg-muted px-1 py-0.5">{'{{ campaign.meta.key }}'}</code>.
               They are stored on the campaign, not the template.
            </p>
            <MetadataEditor
               idPrefix={`${idPrefix}-metadata`}
               scope="campaign"
               rows={form.metadata}
               onChange={(metadata) => onChange({ metadata })}
               disabled={disabled}
            />
            {errors.metadata !== undefined && (
               <p
                  role="alert"
                  className="text-xs font-medium text-destructive"
               >
                  {errors.metadata}
               </p>
            )}
         </div>

         <details className="rounded-lg border border-border p-4">
            <summary className="cursor-pointer text-sm font-medium text-foreground">
               Advanced
            </summary>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
               <Field
                  label="UTM source"
                  htmlFor={`${idPrefix}-utm-source`}
                  error={errors.utmSource}
               >
                  <Input
                     id={`${idPrefix}-utm-source`}
                     value={form.utmSource}
                     disabled={disabled}
                     placeholder="newsletter"
                     aria-invalid={errors.utmSource ? 'true' : undefined}
                     aria-describedby={
                        errors.utmSource ? `${idPrefix}-utm-source-error` : undefined
                     }
                     onInput={(event) => onChange({ utmSource: event.currentTarget.value })}
                  />
               </Field>

               <Field
                  label="UTM medium"
                  htmlFor={`${idPrefix}-utm-medium`}
                  error={errors.utmMedium}
               >
                  <Input
                     id={`${idPrefix}-utm-medium`}
                     value={form.utmMedium}
                     disabled={disabled}
                     placeholder="email"
                     aria-invalid={errors.utmMedium ? 'true' : undefined}
                     aria-describedby={
                        errors.utmMedium ? `${idPrefix}-utm-medium-error` : undefined
                     }
                     onInput={(event) => onChange({ utmMedium: event.currentTarget.value })}
                  />
               </Field>

               <Field
                  label="UTM campaign"
                  htmlFor={`${idPrefix}-utm-campaign`}
                  error={errors.utmCampaign}
               >
                  <Input
                     id={`${idPrefix}-utm-campaign`}
                     value={form.utmCampaign}
                     disabled={disabled}
                     placeholder="spring-launch"
                     aria-invalid={errors.utmCampaign ? 'true' : undefined}
                     aria-describedby={
                        errors.utmCampaign ? `${idPrefix}-utm-campaign-error` : undefined
                     }
                     onInput={(event) => onChange({ utmCampaign: event.currentTarget.value })}
                  />
               </Field>
            </div>
         </details>
      </div>
   );
}
