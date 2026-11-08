import { useEffect, useState } from 'react';
import { Field, Input } from '@postwren/ui';
import {
   AUTOMATION_TRIGGERS,
   parseTriggerConfig,
   triggerLabel,
   triggerSummary,
} from '@postwren/shared/automation';
import type { AutomationTrigger, AutomationTriggerConfig } from '@postwren/shared/automation';
import { list as listCampaigns } from '@/lib/api/campaigns';
import type { Campaign } from '@/lib/api/types';
import { errorMessage } from '@/lib/form-errors';

export type TriggerDraft = {
   type: AutomationTrigger;
   tag: string;
   campaignId: string;
   linkId: string;
   eventName: string;
};

export function triggerDraft(
   type: AutomationTrigger,
   config: AutomationTriggerConfig,
): TriggerDraft {
   return {
      type,
      tag: config.tag ?? '',
      campaignId: config.campaignId ?? '',
      linkId: config.linkId ?? '',
      eventName: config.name ?? '',
   };
}

export function triggerConfigFromDraft(draft: TriggerDraft): AutomationTriggerConfig {
   switch (draft.type) {
      case 'subscriber.created':
         return {};
      case 'tag.added':
         return { tag: draft.tag.trim().toLowerCase() };
      case 'campaign.clicked':
         return {
            ...(draft.campaignId.trim().length === 0
               ? {}
               : { campaignId: draft.campaignId.trim() }),
            ...(draft.linkId.trim().length === 0 ? {} : { linkId: draft.linkId.trim() }),
         };
      case 'api.event':
         return { name: draft.eventName.trim().toLowerCase() };
   }
}

export function triggerDraftError(draft: TriggerDraft): string | null {
   const parsed = parseTriggerConfig(draft.type, triggerConfigFromDraft(draft));
   return parsed.issues[0]?.message ?? null;
}

export function TriggerFields({
   value,
   onChange,
   disabled = false,
   idPrefix = 'trigger',
}: {
   value: TriggerDraft;
   onChange: (next: TriggerDraft) => void;
   disabled?: boolean;
   idPrefix?: string;
}) {
   const [campaigns, setCampaigns] = useState<Campaign[]>([]);
   const [campaignsLoading, setCampaignsLoading] = useState(false);
   const [campaignsError, setCampaignsError] = useState<string | null>(null);

   useEffect(() => {
      if (value.type !== 'campaign.clicked') return;
      let cancelled = false;
      setCampaignsLoading(true);
      setCampaignsError(null);
      listCampaigns({ limit: 50 })
         .then((result) => {
            if (!cancelled) setCampaigns(result.data);
         })
         .catch((cause: unknown) => {
            if (!cancelled) setCampaignsError(errorMessage(cause, 'Could not load campaigns'));
         })
         .finally(() => {
            if (!cancelled) setCampaignsLoading(false);
         });
      return () => {
         cancelled = true;
      };
   }, [value.type]);

   const id = (suffix: string): string => `${idPrefix}-${suffix}`;

   return (
      <div className="grid gap-4">
         <Field
            label="Trigger"
            htmlFor={id('type')}
            hint={triggerSummary(value.type, triggerConfigFromDraft(value))}
         >
            <select
               id={id('type')}
               value={value.type}
               disabled={disabled}
               onChange={(event) =>
                  onChange({ ...value, type: event.currentTarget.value as AutomationTrigger })
               }
               className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
               {AUTOMATION_TRIGGERS.map((trigger) => (
                  <option
                     key={trigger}
                     value={trigger}
                  >
                     {triggerLabel(trigger)}
                  </option>
               ))}
            </select>
         </Field>

         {value.type === 'tag.added' && (
            <Field
               label="Tag"
               htmlFor={id('tag')}
               hint="The automation starts when this tag is attached."
               required
            >
               <Input
                  id={id('tag')}
                  value={value.tag}
                  maxLength={64}
                  disabled={disabled}
                  placeholder="trial"
                  onInput={(event) => onChange({ ...value, tag: event.currentTarget.value })}
               />
            </Field>
         )}

         {value.type === 'campaign.clicked' && (
            <>
               <Field
                  label="Campaign"
                  htmlFor={id('campaign')}
                  hint="Leave as any campaign to start on every tracked link click."
                  error={campaignsError ?? undefined}
               >
                  <select
                     id={id('campaign')}
                     value={value.campaignId}
                     disabled={disabled || campaignsLoading}
                     onChange={(event) =>
                        onChange({ ...value, campaignId: event.currentTarget.value })
                     }
                     className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                     <option value="">Any campaign</option>
                     {campaigns.map((campaign) => (
                        <option
                           key={campaign.id}
                           value={campaign.id}
                        >
                           {campaign.name}
                        </option>
                     ))}
                  </select>
               </Field>
               <Field
                  label="Link ID"
                  htmlFor={id('link')}
                  hint="Optional. Match one block ID instead of the whole campaign."
               >
                  <Input
                     id={id('link')}
                     value={value.linkId}
                     maxLength={100}
                     disabled={disabled}
                     placeholder="cta-primary"
                     onInput={(event) => onChange({ ...value, linkId: event.currentTarget.value })}
                  />
               </Field>
            </>
         )}

         {value.type === 'api.event' && (
            <Field
               label="Event name"
               htmlFor={id('event')}
               hint="Send it to POST /api/v1/events with an events:write key."
               required
            >
               <Input
                  id={id('event')}
                  value={value.eventName}
                  maxLength={64}
                  disabled={disabled}
                  placeholder="purchase.completed"
                  onInput={(event) => onChange({ ...value, eventName: event.currentTarget.value })}
               />
            </Field>
         )}
      </div>
   );
}
