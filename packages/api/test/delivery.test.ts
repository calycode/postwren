import { beforeEach, describe, expect, it } from 'vitest';
import { createDocument } from '@postwren/email/ir';
import workerHandler from '../src/index';
import { createCloudflareAdapter } from '../src/adapters/email';
import { deliverEmail } from '../src/lib/delivery';
import { runAutomationSweep } from '../src/jobs/automation';
import {
   FakeEmail,
   FakeQueue,
   baseEnv,
   makeBatch,
   now,
   resetDb,
   seedCampaign,
   seedRecipient,
   seedSubscribers,
   seedTemplate,
   withEmail,
   withQueue,
} from './helpers';
import type { SentMessage } from './helpers';

beforeEach(async () => {
   await resetDb();
});

const origin = 'http://localhost:8787';

function scrubTokens(value: string): string {
   return value.replace(/[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, '<token>');
}

function scrubbed(message: SentMessage | undefined): Omit<SentMessage, 'headers'> & {
   headers: Record<string, string>;
} {
   if (message === undefined) throw new Error('Expected a sent message');

   return {
      ...message,
      html: scrubTokens(message.html),
      text: scrubTokens(message.text),
      headers: Object.fromEntries(
         Object.entries(message.headers ?? {}).map(([key, value]) => [key, scrubTokens(value)]),
      ),
   };
}

describe('delivery', () => {
   it('renders a campaign and an automation delivery identically for equivalent input', async () => {
      const email = new FakeEmail();
      const env = withEmail(baseEnv(), email);
      const adapter = createCloudflareAdapter(env);
      const document = createDocument();

      const shared = {
         env,
         adapter,
         origin,
         messageId: 'msg_parity',
         document,
         subscriber: {
            id: 'sub_parity',
            email: 'reader@example.com',
            first_name: 'Ada',
            last_name: 'Lovelace',
            status: 'subscribed',
            deleted_at: null,
         },
         tags: ['news'],
         metadata: { plan: 'pro' },
         from: { name: 'Sender', email: 'sender@example.com' },
         replyTo: null,
         subject: 'Hello',
      };

      const campaignOutcome = await deliverEmail({
         ...shared,
         campaign: {
            id: 'cmp_parity',
            utmCampaign: 'launch',
            metadata: { edition: 'october' },
            data: {},
         },
      });
      const automationOutcome = await deliverEmail({
         ...shared,
         campaign: { id: 'aut_parity', utmCampaign: '', metadata: {}, data: {} },
         automation: { id: 'aut_parity', metadata: {} },
      });

      expect(campaignOutcome).toMatchObject({ ok: true, providerMessageId: 'provider-1' });
      expect(automationOutcome).toMatchObject({ ok: true, providerMessageId: 'provider-2' });

      const campaignMessage = scrubbed(email.sent[0]);
      const automationMessage = scrubbed(email.sent[1]);

      expect(campaignMessage).toEqual(automationMessage);
      expect(campaignMessage.html).toContain('/t/o/');
      expect(campaignMessage.html).toContain('/u/');
      expect(campaignMessage.headers['List-Unsubscribe']).toContain(
         '<mailto:unsubscribe@example.com>',
      );
      expect(campaignMessage.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
   });

   it('classifies a provider failure for the caller', async () => {
      const email = new FakeEmail();
      email.failWith = { code: 'E_DAILY_LIMIT_EXCEEDED' };
      const env = withEmail(baseEnv(), email);

      const outcome = await deliverEmail({
         env,
         adapter: createCloudflareAdapter(env),
         origin,
         messageId: 'msg_failure',
         document: createDocument(),
         subscriber: {
            id: 'sub_failure',
            email: 'reader@example.com',
            first_name: null,
            last_name: null,
            status: 'subscribed',
            deleted_at: null,
         },
         tags: [],
         metadata: {},
         from: { name: 'Sender', email: 'sender@example.com' },
         replyTo: null,
         subject: 'Hello',
         campaign: { id: 'cmp_failure', utmCampaign: '', metadata: {}, data: {} },
      });

      expect(outcome).toMatchObject({
         ok: false,
         stage: 'send',
         code: 'E_DAILY_LIMIT_EXCEEDED',
         failure: 'daily_quota',
      });
   });

   it('sends the same unsubscribe header from the campaign queue and the automation sweep', async () => {
      const target = baseEnv();
      const template = await seedTemplate(target, { subject: 'Hello' });
      const [subscriberId] = await seedSubscribers(target, [
         { email: 'parity@example.com', tags: ['news'], metadata: { plan: 'pro' } },
      ]);

      const campaignId = await seedCampaign(target, {
         templateId: template.id,
         audienceQuery: 'tag:news',
         status: 'sending',
      });
      await seedRecipient(target, { campaignId, subscriberId: subscriberId! });

      const automationId = 'aut_parity';
      const runId = 'run_parity';
      const steps = JSON.stringify([
         { id: 'send', type: 'send', templateId: template.id, subject: 'Hello' },
      ]);
      const createdAt = now();
      await target.DB.prepare(
         `INSERT INTO automations
           (id, name, status, trigger_type, entry_query, from_name, from_email, reply_to,
            steps_json, metadata_json, version, created_at, updated_at)
          VALUES (?, 'Parity', 'active', 'subscriber.created', '', 'Sender',
                  'sender@example.com', NULL, ?, '{}', 1, ?, ?)`,
      )
         .bind(automationId, steps, createdAt, createdAt)
         .run();
      await target.DB.prepare(
         `INSERT INTO automation_runs
           (id, automation_id, automation_version, subscriber_id, status, graph_json,
            current_step_index, next_run_at, entered_at)
          VALUES (?, ?, 1, ?, 'waiting', ?, 0, ?, ?)`,
      )
         .bind(runId, automationId, subscriberId!, steps, createdAt, createdAt)
         .run();

      const email = new FakeEmail();
      const env = withQueue(withEmail(target, email), new FakeQueue());

      const { batch } = makeBatch([{ campaignId, recipientIds: [subscriberId!] }]);
      await workerHandler.queue(batch, env);
      await runAutomationSweep(env, createdAt);

      expect(email.sent).toHaveLength(2);

      const campaignMessage = scrubbed(email.sent[0]);
      const automationMessage = scrubbed(email.sent[1]);

      expect(campaignMessage.html).toBe(automationMessage.html);
      expect(campaignMessage.text).toBe(automationMessage.text);
      expect(campaignMessage.headers).toEqual(automationMessage.headers);
      expect(campaignMessage.headers['List-Unsubscribe']).toContain(
         '<mailto:unsubscribe@example.com>',
      );
      expect(automationMessage.headers['List-Unsubscribe']).toContain(
         '<mailto:unsubscribe@example.com>',
      );
   });
});
