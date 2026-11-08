import { ValidationError } from '@postwren/worker-kit/errors';
import {
   firstAutomationIssue,
   parseAutomationSteps as parseSteps,
} from '@postwren/shared/automation';
import type { AutomationStep, WaitUnit } from '@postwren/shared/automation';

export {
   AUTOMATION_STATUSES,
   AUTOMATION_TRIGGERS,
   WAIT_UNITS,
   MAX_STEPS,
   MAX_WAIT_DAYS,
   MAX_STEP_TAG_LENGTH,
   MAX_TRIGGER_FILTER_LENGTH,
   API_EVENT_NAME_PATTERN,
   automationIssueMessage,
   firstAutomationIssue,
   parseTriggerConfig,
   readTriggerConfig,
   triggerLabel,
   triggerMatches,
   triggerSummary,
} from '@postwren/shared/automation';

export type {
   AutomationEvent,
   AutomationIssueCode,
   AutomationStatus,
   AutomationStep,
   AutomationStepIssue,
   AutomationStepsParseResult,
   AutomationTrigger,
   AutomationTriggerConfig,
   AutomationTriggerIssue,
   AutomationTriggerParseResult,
   ExitStep,
   MetadataStep,
   SendStep,
   TagStep,
   TriggerIssueCode,
   WaitStep,
   WaitUnit,
} from '@postwren/shared/automation';

export function parseAutomationSteps(value: unknown): AutomationStep[] {
   const result = parseSteps(value);
   const issue = firstAutomationIssue(result);
   if (issue !== null) throw new ValidationError(issue.message);
   return result.steps;
}

export function stepLabel(step: AutomationStep | undefined): string {
   if (step === undefined) return 'Finished';
   switch (step.type) {
      case 'wait':
         return `Wait ${step.amount} ${step.amount === 1 ? step.unit.slice(0, -1) : step.unit}`;
      case 'send':
         return 'Send email';
      case 'add_tag':
         return `Add tag ${step.tag}`;
      case 'remove_tag':
         return `Remove tag ${step.tag}`;
      case 'set_metadata':
         return `Set ${step.key}`;
      case 'exit':
         return 'Exit';
   }
}

export function waitSeconds(amount: number, unit: WaitUnit): number {
   switch (unit) {
      case 'minutes':
         return amount * 60;
      case 'hours':
         return amount * 60 * 60;
      case 'days':
         return amount * 24 * 60 * 60;
   }
}
