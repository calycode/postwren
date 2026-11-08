import { describe, expect, it } from 'vitest';
import {
   MAX_STEPS,
   MAX_WAIT_DAYS,
   automationIssueMessage,
   firstAutomationIssue,
   parseAutomationSteps,
   parseTriggerConfig,
   readTriggerConfig,
   triggerMatches,
   triggerSummary,
} from './index';

function waitSteps(count: number) {
   return Array.from({ length: count }, (_, index) => ({
      id: `wait_${index}`,
      type: 'wait' as const,
      amount: 1,
      unit: 'minutes' as const,
   }));
}

describe('parseAutomationSteps', () => {
   it('accepts every step type and normalises user input', () => {
      const result = parseAutomationSteps([
         { id: 'wait', type: 'wait', amount: 2, unit: 'hours' },
         { id: 'send', type: 'send', templateId: ' tpl_1 ', subject: ' Welcome ' },
         { id: 'add', type: 'add_tag', tag: ' VIP ' },
         { id: 'remove', type: 'remove_tag', tag: 'Trial' },
         { id: 'field', type: 'set_metadata', key: ' LifeCycle ', value: 'welcomed' },
         { id: 'exit', type: 'exit' },
      ]);

      expect(result.issues).toEqual([]);
      expect(result.steps).toEqual([
         { id: 'wait', type: 'wait', amount: 2, unit: 'hours' },
         { id: 'send', type: 'send', templateId: 'tpl_1', subject: 'Welcome' },
         { id: 'add', type: 'add_tag', tag: 'vip' },
         { id: 'remove', type: 'remove_tag', tag: 'trial' },
         { id: 'field', type: 'set_metadata', key: 'lifecycle', value: 'welcomed' },
         { id: 'exit', type: 'exit' },
      ]);
   });

   it('keeps a template revision and IR snapshot on a send step', () => {
      const irSnapshot = '{"version":1,"children":[]}';
      const result = parseAutomationSteps([
         {
            id: 'send',
            type: 'send',
            templateId: 'tpl_1',
            templateRevision: 7,
            irSnapshot,
         },
      ]);

      expect(result.issues).toEqual([]);
      expect(result.steps[0]).toEqual({
         id: 'send',
         type: 'send',
         templateId: 'tpl_1',
         templateRevision: 7,
         irSnapshot,
      });
   });

   it('allows at most MAX_STEPS steps', () => {
      const allowed = parseAutomationSteps(waitSteps(MAX_STEPS));
      expect(allowed.issues).toEqual([]);
      expect(allowed.steps).toHaveLength(MAX_STEPS);

      const denied = parseAutomationSteps([...waitSteps(MAX_STEPS), { id: 'exit', type: 'exit' }]);
      expect(firstAutomationIssue(denied)).toMatchObject({ code: 'too_many_steps' });
      expect(automationIssueMessage(denied)).toContain(String(MAX_STEPS));
   });

   it('requires wait amounts to be whole numbers within one year', () => {
      for (const amount of [0, 1.5, MAX_WAIT_DAYS + 1]) {
         const result = parseAutomationSteps([{ id: 'wait', type: 'wait', amount, unit: 'days' }]);
         expect(firstAutomationIssue(result)?.code).toBe('wait_invalid_amount');
      }

      const maxWait = parseAutomationSteps([
         { id: 'wait', type: 'wait', amount: MAX_WAIT_DAYS, unit: 'days' },
      ]);
      expect(maxWait.issues).toEqual([]);
   });

   it('rejects a wait unit outside minutes, hours and days', () => {
      const result = parseAutomationSteps([{ id: 'wait', type: 'wait', amount: 1, unit: 'weeks' }]);

      expect(firstAutomationIssue(result)?.code).toBe('wait_invalid_unit');
      expect(automationIssueMessage(result)).toBe('Step 1: choose minutes, hours or days');
   });

   it('requires an exit step to come last', () => {
      const result = parseAutomationSteps([
         { id: 'exit', type: 'exit' },
         { id: 'wait', type: 'wait', amount: 1, unit: 'hours' },
      ]);

      expect(firstAutomationIssue(result)).toMatchObject({
         code: 'exit_not_last',
         message: 'Exit must be the last step',
      });
   });

   it('rejects duplicate step ids', () => {
      const result = parseAutomationSteps([
         { id: 'same', type: 'exit' },
         { id: 'same', type: 'exit' },
      ]);

      expect(firstAutomationIssue(result)).toMatchObject({
         code: 'duplicate_id',
         message: 'Duplicate step id: same',
      });
   });

   it('validates custom field keys and values', () => {
      const badKey = parseAutomationSteps([
         { id: 'field', type: 'set_metadata', key: 'Plan!', value: 'pro' },
      ]);
      expect(firstAutomationIssue(badKey)?.code).toBe('metadata_key_invalid');

      const longValue = parseAutomationSteps([
         { id: 'field', type: 'set_metadata', key: 'plan', value: 'a'.repeat(1025) },
      ]);
      expect(firstAutomationIssue(longValue)?.code).toBe('metadata_value_too_long');
      expect(automationIssueMessage(longValue)).toContain('1024');
   });

   it('normalises tag names and enforces the length limit', () => {
      const boundary = parseAutomationSteps([
         { id: 'tag', type: 'add_tag', tag: ` ${'a'.repeat(64)} ` },
      ]);
      expect(boundary.issues).toEqual([]);
      expect(boundary.steps[0]).toEqual({ id: 'tag', type: 'add_tag', tag: 'a'.repeat(64) });

      for (const tag of ['', 'a'.repeat(65)]) {
         const result = parseAutomationSteps([{ id: 'tag', type: 'add_tag', tag }]);
         expect(firstAutomationIssue(result)?.code).toBe('tag_invalid');
      }
   });

   it('reports structural problems without throwing', () => {
      expect(firstAutomationIssue(parseAutomationSteps('nope'))?.code).toBe('steps_not_array');
      expect(firstAutomationIssue(parseAutomationSteps([]))?.code).toBe('steps_empty');
      expect(firstAutomationIssue(parseAutomationSteps([null]))?.code).toBe('step_not_object');
      expect(
         firstAutomationIssue(parseAutomationSteps([{ id: 'mystery', type: 'publish_everywhere' }]))
            ?.code,
      ).toBe('unsupported_type');
   });

   it('returns no message when every step is valid', () => {
      expect(
         automationIssueMessage(parseAutomationSteps([{ id: 'exit', type: 'exit' }])),
      ).toBeNull();
   });
});

describe('parseTriggerConfig', () => {
   it('keeps subscriber.created config empty', () => {
      expect(parseTriggerConfig('subscriber.created', { ignored: true })).toEqual({
         config: {},
         issues: [],
      });
   });

   it('normalises a tag trigger and requires a tag', () => {
      expect(parseTriggerConfig('tag.added', { tag: ' Trial ' })).toEqual({
         config: { tag: 'trial' },
         issues: [],
      });
      expect(parseTriggerConfig('tag.added', {}).issues[0]?.code).toBe('tag_required');
      expect(parseTriggerConfig('tag.added', { tag: 'x'.repeat(65) }).issues[0]?.code).toBe(
         'tag_invalid',
      );
   });

   it('accepts optional campaign click filters', () => {
      expect(parseTriggerConfig('campaign.clicked', {})).toEqual({ config: {}, issues: [] });
      expect(
         parseTriggerConfig('campaign.clicked', { campaignId: 'cmp_1', linkId: 'cta' }),
      ).toEqual({ config: { campaignId: 'cmp_1', linkId: 'cta' }, issues: [] });
      expect(
         parseTriggerConfig('campaign.clicked', { campaignId: 'x'.repeat(101) }).issues[0]?.code,
      ).toBe('filter_invalid');
   });

   it('requires a well-formed API event name', () => {
      expect(parseTriggerConfig('api.event', { name: ' Purchase.Completed ' })).toEqual({
         config: { name: 'purchase.completed' },
         issues: [],
      });
      expect(parseTriggerConfig('api.event', { name: 'Purchase Completed' }).issues[0]?.code).toBe(
         'event_name_invalid',
      );
      expect(parseTriggerConfig('api.event', {}).issues[0]?.code).toBe('event_name_invalid');
   });

   it('rejects an unknown trigger and non-object config', () => {
      expect(parseTriggerConfig('mystery', {}).issues[0]?.code).toBe('unknown_trigger');
      expect(parseTriggerConfig('tag.added', []).issues[0]?.code).toBe('config_not_object');
   });

   it('reads stored config and tolerates malformed JSON', () => {
      expect(readTriggerConfig('tag.added', '{"tag":"trial"}')).toEqual({ tag: 'trial' });
      expect(readTriggerConfig('tag.added', 'not json')).toEqual({});
   });
});

describe('triggerMatches', () => {
   it('matches only the event kind and configured filters', () => {
      const created = { kind: 'subscriber.created' as const, subscriberId: 'sub_1' };
      const tag = { kind: 'tag.added' as const, subscriberId: 'sub_1', tag: 'trial' };
      const click = {
         kind: 'campaign.clicked' as const,
         subscriberId: 'sub_1',
         campaignId: 'cmp_1',
         messageId: 'msg_1',
         linkId: 'cta',
      };
      const event = {
         kind: 'api.event' as const,
         subscriberId: 'sub_1',
         name: 'purchase.completed',
         eventId: 'evt_1',
      };

      expect(triggerMatches('subscriber.created', {}, created)).toBe(true);
      expect(triggerMatches('tag.added', { tag: 'trial' }, tag)).toBe(true);
      expect(triggerMatches('tag.added', { tag: 'vip' }, tag)).toBe(false);
      expect(triggerMatches('campaign.clicked', {}, click)).toBe(true);
      expect(triggerMatches('campaign.clicked', { campaignId: 'cmp_1' }, click)).toBe(true);
      expect(triggerMatches('campaign.clicked', { campaignId: 'cmp_2' }, click)).toBe(false);
      expect(triggerMatches('campaign.clicked', { linkId: 'cta' }, click)).toBe(true);
      expect(triggerMatches('api.event', { name: 'purchase.completed' }, event)).toBe(true);
      expect(triggerMatches('api.event', { name: 'refunded' }, event)).toBe(false);
      expect(triggerMatches('tag.added', { tag: 'trial' }, created)).toBe(false);
   });

   it('summarises each trigger in plain language', () => {
      expect(triggerSummary('subscriber.created', {})).toBe('When a subscriber is created');
      expect(triggerSummary('tag.added', { tag: 'trial' })).toBe('When the tag "trial" is added');
      expect(triggerSummary('campaign.clicked', {})).toBe('When any campaign link is clicked');
      expect(triggerSummary('api.event', { name: 'purchase.completed' })).toBe(
         'When the "purchase.completed" event arrives',
      );
   });
});
