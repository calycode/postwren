import { MAX_METADATA_VALUE_LENGTH, METADATA_KEY_PATTERN } from '../metadata';

export const AUTOMATION_STATUSES = ['draft', 'active', 'paused', 'archived'] as const;
export type AutomationStatus = (typeof AUTOMATION_STATUSES)[number];

export const AUTOMATION_TRIGGERS = [
   'subscriber.created',
   'tag.added',
   'campaign.clicked',
   'api.event',
] as const;
export type AutomationTrigger = (typeof AUTOMATION_TRIGGERS)[number];

export const WAIT_UNITS = ['minutes', 'hours', 'days'] as const;
export type WaitUnit = (typeof WAIT_UNITS)[number];

export type WaitStep = {
   id: string;
   type: 'wait';
   amount: number;
   unit: WaitUnit;
};

export type SendStep = {
   id: string;
   type: 'send';
   templateId: string;
   subject?: string;
   templateRevision?: number;
   irSnapshot?: string;
};

export type TagStep = {
   id: string;
   type: 'add_tag' | 'remove_tag';
   tag: string;
};

export type MetadataStep = {
   id: string;
   type: 'set_metadata';
   key: string;
   value: string;
};

export type ExitStep = {
   id: string;
   type: 'exit';
};

export type AutomationStep = WaitStep | SendStep | TagStep | MetadataStep | ExitStep;

export const MAX_STEPS = 30;
export const MAX_WAIT_DAYS = 365;
export const MAX_STEP_TAG_LENGTH = 64;
export const MAX_TRIGGER_FILTER_LENGTH = 100;
export const API_EVENT_NAME_PATTERN = /^[a-z][a-z0-9_.-]{0,63}$/;

/** Extra fields stored in `automations.trigger_config_json`. */
export type AutomationTriggerConfig = {
   tag?: string;
   campaignId?: string;
   linkId?: string;
   name?: string;
};

export type TriggerIssueCode =
   | 'config_not_object'
   | 'unknown_trigger'
   | 'tag_required'
   | 'tag_invalid'
   | 'filter_invalid'
   | 'event_name_invalid';

export type AutomationTriggerIssue = {
   code: TriggerIssueCode;
   message: string;
};

export type AutomationTriggerParseResult = {
   config: AutomationTriggerConfig;
   issues: AutomationTriggerIssue[];
};

/** Events that can enroll a subscriber. `api.event` carries its stored event id. */
export type AutomationEvent =
   | { kind: 'subscriber.created'; subscriberId: string }
   | { kind: 'tag.added'; subscriberId: string; tag: string }
   | {
        kind: 'campaign.clicked';
        subscriberId: string;
        campaignId: string;
        messageId: string;
        linkId?: string;
     }
   | {
        kind: 'api.event';
        subscriberId: string;
        name: string;
        eventId: string;
        properties?: Record<string, unknown>;
     };

function triggerIssue(code: TriggerIssueCode, message: string): AutomationTriggerIssue {
   return { code, message };
}

function optionalFilter(
   value: unknown,
   label: string,
): { value: string | undefined; issue: AutomationTriggerIssue | null } {
   if (value === undefined || value === null) return { value: undefined, issue: null };
   if (typeof value !== 'string') {
      return {
         value: undefined,
         issue: triggerIssue('filter_invalid', `${label} must be a string`),
      };
   }
   const trimmed = value.trim();
   if (trimmed.length === 0) return { value: undefined, issue: null };
   if (trimmed.length > MAX_TRIGGER_FILTER_LENGTH) {
      return {
         value: undefined,
         issue: triggerIssue(
            'filter_invalid',
            `${label} must be ${MAX_TRIGGER_FILTER_LENGTH} characters or fewer`,
         ),
      };
   }
   return { value: trimmed, issue: null };
}

/**
 * Validates the trigger-specific config. The trigger type is stored next to it,
 * so the config itself stays a small flat map.
 */
export function parseTriggerConfig(
   triggerType: string,
   value: unknown,
): AutomationTriggerParseResult {
   if (!AUTOMATION_TRIGGERS.includes(triggerType as AutomationTrigger)) {
      return {
         config: {},
         issues: [triggerIssue('unknown_trigger', `"${triggerType}" is not a supported trigger`)],
      };
   }

   if (value !== undefined && value !== null) {
      if (typeof value !== 'object' || Array.isArray(value)) {
         return {
            config: {},
            issues: [triggerIssue('config_not_object', 'Trigger settings must be an object')],
         };
      }
   }

   const source =
      typeof value === 'object' && value !== null && !Array.isArray(value)
         ? (value as Record<string, unknown>)
         : {};

   switch (triggerType as AutomationTrigger) {
      case 'subscriber.created':
         return { config: {}, issues: [] };
      case 'tag.added': {
         const raw = typeof source.tag === 'string' ? source.tag.trim().toLowerCase() : '';
         if (raw.length === 0) {
            return {
               config: {},
               issues: [triggerIssue('tag_required', 'Choose the tag that starts this automation')],
            };
         }
         if (raw.length > MAX_STEP_TAG_LENGTH) {
            return {
               config: {},
               issues: [
                  triggerIssue(
                     'tag_invalid',
                     `Tags are limited to ${MAX_STEP_TAG_LENGTH} characters`,
                  ),
               ],
            };
         }
         return { config: { tag: raw }, issues: [] };
      }
      case 'campaign.clicked': {
         const campaign = optionalFilter(source.campaignId, 'Campaign');
         const link = optionalFilter(source.linkId, 'Link');
         const issues = [campaign.issue, link.issue].filter(
            (issue): issue is AutomationTriggerIssue => issue !== null,
         );
         if (issues.length > 0) return { config: {}, issues };
         return {
            config: {
               ...(campaign.value === undefined ? {} : { campaignId: campaign.value }),
               ...(link.value === undefined ? {} : { linkId: link.value }),
            },
            issues: [],
         };
      }
      case 'api.event': {
         const name = typeof source.name === 'string' ? source.name.trim().toLowerCase() : '';
         if (!API_EVENT_NAME_PATTERN.test(name)) {
            return {
               config: {},
               issues: [
                  triggerIssue(
                     'event_name_invalid',
                     'Event names use lowercase letters, digits, dots, dashes or underscores',
                  ),
               ],
            };
         }
         return { config: { name }, issues: [] };
      }
   }
}

export function readTriggerConfig(triggerType: string, json: string): AutomationTriggerConfig {
   try {
      return parseTriggerConfig(triggerType, JSON.parse(json)).config;
   } catch {
      return {};
   }
}

/** True when a stored trigger accepts this event. */
export function triggerMatches(
   triggerType: string,
   config: AutomationTriggerConfig,
   event: AutomationEvent,
): boolean {
   if (triggerType !== event.kind) return false;

   switch (triggerType as AutomationTrigger) {
      case 'subscriber.created':
         return event.kind === 'subscriber.created';
      case 'tag.added':
         return event.kind === 'tag.added' && config.tag === event.tag;
      case 'campaign.clicked':
         return (
            event.kind === 'campaign.clicked' &&
            (config.campaignId === undefined || config.campaignId === event.campaignId) &&
            (config.linkId === undefined || config.linkId === event.linkId)
         );
      case 'api.event':
         return event.kind === 'api.event' && config.name === event.name;
   }
}

export function triggerLabel(triggerType: string): string {
   switch (triggerType as AutomationTrigger) {
      case 'subscriber.created':
         return 'Subscriber created';
      case 'tag.added':
         return 'Tag added';
      case 'campaign.clicked':
         return 'Campaign link clicked';
      case 'api.event':
         return 'API event';
      default:
         return 'Unknown trigger';
   }
}

/** Plain-language trigger summary for lists and the builder. */
export function triggerSummary(triggerType: string, config: AutomationTriggerConfig): string {
   switch (triggerType as AutomationTrigger) {
      case 'subscriber.created':
         return 'When a subscriber is created';
      case 'tag.added':
         return config.tag === undefined || config.tag.length === 0
            ? 'When a tag is added'
            : `When the tag "${config.tag}" is added`;
      case 'campaign.clicked': {
         if (config.linkId !== undefined) return `When the "${config.linkId}" link is clicked`;
         if (config.campaignId !== undefined) {
            return 'When a link in the selected campaign is clicked';
         }
         return 'When any campaign link is clicked';
      }
      case 'api.event':
         return config.name === undefined || config.name.length === 0
            ? 'When an API event arrives'
            : `When the "${config.name}" event arrives`;
      default:
         return 'Unknown trigger';
   }
}

export type AutomationIssueCode =
   | 'steps_not_array'
   | 'steps_empty'
   | 'too_many_steps'
   | 'step_not_object'
   | 'duplicate_id'
   | 'wait_invalid_amount'
   | 'wait_invalid_unit'
   | 'send_missing_template'
   | 'tag_invalid'
   | 'metadata_key_invalid'
   | 'metadata_value_too_long'
   | 'unsupported_type'
   | 'exit_not_last';

export type AutomationStepIssue = {
   code: AutomationIssueCode;
   message: string;
   index?: number;
};

export type AutomationStepsParseResult = {
   steps: AutomationStep[];
   issues: AutomationStepIssue[];
};

function recordOf(value: unknown): Record<string, unknown> | null {
   if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
   return value as Record<string, unknown>;
}

function stringOf(value: unknown): string | null {
   return typeof value === 'string' ? value : null;
}

function stepId(value: unknown): string {
   const id = stringOf(value);
   return id !== null && id.length > 0 ? id : `stp_${crypto.randomUUID()}`;
}

function issue(code: AutomationIssueCode, message: string, index?: number): AutomationStepIssue {
   return index === undefined ? { code, message } : { code, message, index };
}

export function parseAutomationSteps(value: unknown): AutomationStepsParseResult {
   if (!Array.isArray(value)) {
      return {
         steps: [],
         issues: [issue('steps_not_array', 'Steps must be an array')],
      };
   }
   if (value.length === 0) {
      return {
         steps: [],
         issues: [issue('steps_empty', 'Add at least one step')],
      };
   }
   if (value.length > MAX_STEPS) {
      return {
         steps: [],
         issues: [issue('too_many_steps', `An automation can have at most ${MAX_STEPS} steps`)],
      };
   }

   const issues: AutomationStepIssue[] = [];
   const ids = new Set<string>();
   const steps: AutomationStep[] = [];

   value.forEach((entry, index) => {
      const label = `Step ${index + 1}`;
      const source = recordOf(entry);
      if (source === null) {
         issues.push(issue('step_not_object', `${label} is not an object`, index));
         return;
      }

      const type = stringOf(source.type);
      const id = stepId(source.id);
      if (ids.has(id)) {
         issues.push(issue('duplicate_id', `Duplicate step id: ${id}`, index));
         return;
      }
      ids.add(id);

      switch (type) {
         case 'wait': {
            const amount = source.amount;
            const unit = source.unit;
            if (
               typeof amount !== 'number' ||
               !Number.isInteger(amount) ||
               amount < 1 ||
               amount > MAX_WAIT_DAYS
            ) {
               issues.push(
                  issue('wait_invalid_amount', `${label}: choose a wait of at least 1`, index),
               );
               return;
            }
            if (unit !== 'minutes' && unit !== 'hours' && unit !== 'days') {
               issues.push(
                  issue('wait_invalid_unit', `${label}: choose minutes, hours or days`, index),
               );
               return;
            }
            steps.push({ id, type: 'wait', amount, unit });
            return;
         }
         case 'send': {
            const templateId = stringOf(source.templateId)?.trim() ?? '';
            if (templateId.length === 0) {
               issues.push(issue('send_missing_template', `${label}: choose a template`, index));
               return;
            }
            const subject = stringOf(source.subject);
            const revision = source.templateRevision;
            const snapshot = stringOf(source.irSnapshot);
            steps.push({
               id,
               type: 'send',
               templateId,
               ...(subject !== null && subject.trim().length > 0
                  ? { subject: subject.trim().slice(0, 998) }
                  : {}),
               ...(typeof revision === 'number' && Number.isFinite(revision)
                  ? { templateRevision: revision }
                  : {}),
               ...(snapshot !== null ? { irSnapshot: snapshot } : {}),
            });
            return;
         }
         case 'add_tag':
         case 'remove_tag': {
            const tag = stringOf(source.tag)?.trim().toLowerCase() ?? '';
            if (tag.length === 0 || tag.length > MAX_STEP_TAG_LENGTH) {
               issues.push(
                  issue(
                     'tag_invalid',
                     'Each tag step needs a tag name of 1 to 64 characters',
                     index,
                  ),
               );
               return;
            }
            steps.push({ id, type, tag });
            return;
         }
         case 'set_metadata': {
            const key = stringOf(source.key)?.trim().toLowerCase() ?? '';
            if (!METADATA_KEY_PATTERN.test(key)) {
               issues.push(
                  issue(
                     'metadata_key_invalid',
                     `${label}: custom field keys use lowercase letters, digits and underscores`,
                     index,
                  ),
               );
               return;
            }
            const value = stringOf(source.value) ?? '';
            if (value.length > MAX_METADATA_VALUE_LENGTH) {
               issues.push(
                  issue(
                     'metadata_value_too_long',
                     `${label}: custom field values are limited to ${MAX_METADATA_VALUE_LENGTH} characters`,
                     index,
                  ),
               );
               return;
            }
            steps.push({ id, type: 'set_metadata', key, value });
            return;
         }
         case 'exit':
            steps.push({ id, type: 'exit' });
            return;
         default:
            issues.push(
               issue(
                  'unsupported_type',
                  `${label}: "${type ?? 'unknown'}" is not supported yet`,
                  index,
               ),
            );
            return;
      }
   });

   if (issues.length === 0) {
      const exitIndex = steps.findIndex((step) => step.type === 'exit');
      if (exitIndex !== -1 && exitIndex !== steps.length - 1) {
         issues.push(issue('exit_not_last', 'Exit must be the last step', exitIndex));
      }
   }

   return issues.length === 0 ? { steps, issues } : { steps: [], issues };
}

export function firstAutomationIssue(
   result: AutomationStepsParseResult,
): AutomationStepIssue | null {
   return result.issues[0] ?? null;
}

export function automationIssueMessage(result: AutomationStepsParseResult): string | null {
   return firstAutomationIssue(result)?.message ?? null;
}
