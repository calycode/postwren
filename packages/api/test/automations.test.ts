import { beforeEach, describe, expect, it } from 'vitest';
import { createDocument } from '@postwren/email/ir';
import { enrollSubscriberCreated, runAutomationSweep } from '../src/jobs/automation';
import {
   authHeaders,
   baseEnv,
   createAppForTest,
   FakeEmail,
   json,
   now,
   resetDb,
   seedOwner,
   seedSubscribers,
   seedTemplate,
   withEmail,
} from './helpers';

const app = createAppForTest();

beforeEach(async () => {
   await resetDb();
});

describe('automations', () => {
   it('validates, activates, enrolls and sends a linear sequence', async () => {
      const auth = await seedOwner(baseEnv());
      const [subscriberId] = await seedSubscribers(baseEnv(), [{ email: 'new@example.com' }]);
      expect(subscriberId).toBeDefined();
      const template = await seedTemplate(baseEnv(), {
         name: 'Welcome',
         subject: 'Welcome aboard',
      });

      const created = await app.request('/api/v1/automations', {
         method: 'POST',
         headers: authHeaders(auth),
         body: JSON.stringify({
            name: 'Welcome series',
            triggerType: 'subscriber.created',
            entryQuery: '',
            fromName: 'Postwren',
            fromEmail: 'noreply@example.com',
            steps: [
               { id: 'wait', type: 'wait', amount: 1, unit: 'minutes' },
               { id: 'send', type: 'send', templateId: template.id },
               { id: 'exit', type: 'exit' },
            ],
         }),
      });
      expect(created.status).toBe(201);
      const automationId = (await json(created)).data.id as string;

      const activated = await app.request(`/api/v1/automations/${automationId}/activate`, {
         method: 'POST',
         headers: authHeaders(auth),
      });
      expect(activated.status).toBe(200);
      expect((await json(activated)).data).toMatchObject({ status: 'active' });

      const enrolled = await app.request(`/api/v1/automations/${automationId}/enroll`, {
         method: 'POST',
         headers: authHeaders(auth),
         body: JSON.stringify({ email: 'new@example.com' }),
      });
      expect(enrolled.status).toBe(201);

      const fake = new FakeEmail();
      const env = withEmail(baseEnv(), fake);
      const start = now();

      await runAutomationSweep(env, start);
      const firstRun = await env.DB.prepare(
         'SELECT status, current_step_index FROM automation_runs WHERE automation_id = ?',
      )
         .bind(automationId)
         .first<{ status: string; current_step_index: number }>();
      expect(firstRun).toEqual({ status: 'waiting', current_step_index: 1 });

      await runAutomationSweep(env, start + 61);
      expect(fake.sent).toHaveLength(1);
      expect(fake.sent[0]).toMatchObject({
         to: 'new@example.com',
         subject: 'Welcome aboard',
      });

      const delivery = await env.DB.prepare(
         'SELECT status, opened_at FROM automation_deliveries WHERE automation_id = ?',
      )
         .bind(automationId)
         .first<{ status: string; opened_at: number | null }>();
      expect(delivery).toEqual({ status: 'sent', opened_at: null });

      await runAutomationSweep(env, start + 62);
      const completed = await env.DB.prepare(
         'SELECT status, exit_reason FROM automation_runs WHERE automation_id = ?',
      )
         .bind(automationId)
         .first<{ status: string; exit_reason: string }>();
      expect(completed).toEqual({ status: 'exited', exit_reason: 'exit_step' });

      const log = await env.DB.prepare(
         `SELECT started_at, last_step_at, steps_executed, sent_count
          FROM automation_runs WHERE automation_id = ?`,
      )
         .bind(automationId)
         .first<{
            started_at: number | null;
            last_step_at: number | null;
            steps_executed: number;
            sent_count: number;
         }>();
      expect(log?.started_at).toBe(start);
      expect(log?.last_step_at).not.toBeNull();
      expect(log?.steps_executed).toBe(3);
      expect(log?.sent_count).toBe(1);

      const deliveryLog = await env.DB.prepare(
         'SELECT step_index, queued_at, duration_ms FROM automation_deliveries WHERE automation_id = ?',
      )
         .bind(automationId)
         .first<{
            step_index: number | null;
            queued_at: number | null;
            duration_ms: number | null;
         }>();
      expect(deliveryLog?.step_index).toBe(1);
      expect(deliveryLog?.queued_at).not.toBeNull();
      expect(deliveryLog?.duration_ms).not.toBeNull();
   });

   it('enrolls one run per subscriber event, even when the trigger replays', async () => {
      const auth = await seedOwner(baseEnv());
      await seedTemplate(baseEnv(), { name: 'Replay', subject: 'Replay' });

      const created = await app.request('/api/v1/automations', {
         method: 'POST',
         headers: authHeaders(auth),
         body: JSON.stringify({
            name: 'Replay safe',
            triggerType: 'subscriber.created',
            entryQuery: '',
            fromName: 'Postwren',
            fromEmail: 'noreply@example.com',
            steps: [{ id: 'exit', type: 'exit' }],
         }),
      });
      const automationId = (await json(created)).data.id as string;
      await app.request(`/api/v1/automations/${automationId}/activate`, {
         method: 'POST',
         headers: authHeaders(auth),
      });

      const [subscriberId] = await seedSubscribers(baseEnv(), [{ email: 'once@example.com' }]);
      expect(subscriberId).toBeDefined();

      const env = baseEnv();
      const start = now();
      const first = await enrollSubscriberCreated(env, subscriberId ?? '', start);
      const second = await enrollSubscriberCreated(env, subscriberId ?? '', start);

      expect(first).toBe(1);
      expect(second).toBe(0);
      const runs = await env.DB.prepare(
         'SELECT id, idempotency_key FROM automation_runs WHERE automation_id = ?',
      )
         .bind(automationId)
         .all<{ id: string; idempotency_key: string | null }>();
      expect(runs.results).toHaveLength(1);
      expect(runs.results[0]?.id.startsWith('run_')).toBe(true);
      expect(runs.results[0]?.idempotency_key).toContain(automationId);
   });

   it('renders automation custom fields in send steps', async () => {
      const auth = await seedOwner(baseEnv());
      await seedSubscribers(baseEnv(), [{ email: 'vars@example.com' }]);
      const document = createDocument();
      const block = document.children[0];
      if (block?.type === 'text') {
         block.text = 'Stage {{ automation.meta.stage }} / {{ campaign.meta.stage }}';
      }
      const template = await seedTemplate(baseEnv(), { document, subject: 'Variables' });

      const created = await app.request('/api/v1/automations', {
         method: 'POST',
         headers: authHeaders(auth),
         body: JSON.stringify({
            name: 'Variables',
            triggerType: 'subscriber.created',
            entryQuery: '',
            fromName: 'Postwren',
            fromEmail: 'noreply@example.com',
            metadata: { stage: 'welcome' },
            steps: [{ id: 'send', type: 'send', templateId: template.id }],
         }),
      });
      expect(created.status).toBe(201);
      const automationId = (await json(created)).data.id as string;
      await app.request(`/api/v1/automations/${automationId}/activate`, {
         method: 'POST',
         headers: authHeaders(auth),
      });
      await app.request(`/api/v1/automations/${automationId}/enroll`, {
         method: 'POST',
         headers: authHeaders(auth),
         body: JSON.stringify({ email: 'vars@example.com' }),
      });

      const fake = new FakeEmail();
      await runAutomationSweep(withEmail(baseEnv(), fake), now());
      expect(fake.sent[0]?.html).toContain('Stage welcome / welcome');
   });

   it('sets a custom field and exits', async () => {
      const auth = await seedOwner(baseEnv());
      await seedSubscribers(baseEnv(), [{ email: 'field@example.com' }]);

      const created = await app.request('/api/v1/automations', {
         method: 'POST',
         headers: authHeaders(auth),
         body: JSON.stringify({
            name: 'Field update',
            triggerType: 'subscriber.created',
            entryQuery: '',
            fromName: 'Postwren',
            fromEmail: 'noreply@example.com',
            steps: [
               { id: 'field', type: 'set_metadata', key: 'lifecycle', value: 'welcomed' },
               { id: 'exit', type: 'exit' },
            ],
         }),
      });
      const automationId = (await json(created)).data.id as string;
      await app.request(`/api/v1/automations/${automationId}/activate`, {
         method: 'POST',
         headers: authHeaders(auth),
      });
      await app.request(`/api/v1/automations/${automationId}/enroll`, {
         method: 'POST',
         headers: authHeaders(auth),
         body: JSON.stringify({ email: 'field@example.com' }),
      });

      const env = withEmail(baseEnv(), new FakeEmail());
      await runAutomationSweep(env, now());

      const metadata = await env.DB.prepare(
         `SELECT value FROM subscriber_metadata sm
          JOIN subscribers s ON s.id = sm.subscriber_id
          WHERE s.email = 'field@example.com' AND sm.key = 'lifecycle'`,
      ).first<{ value: string }>();
      expect(metadata?.value).toBe('welcomed');
   });

   it('allows editing steps on an active automation', async () => {
      const auth = await seedOwner(baseEnv());
      const template = await seedTemplate(baseEnv());

      const created = await app.request('/api/v1/automations', {
         method: 'POST',
         headers: authHeaders(auth),
         body: JSON.stringify({
            name: 'Editable',
            triggerType: 'subscriber.created',
            entryQuery: '',
            fromName: 'Postwren',
            fromEmail: 'noreply@example.com',
            steps: [{ id: 'send', type: 'send', templateId: template.id }],
         }),
      });
      const automationId = (await json(created)).data.id as string;
      const activated = await app.request(`/api/v1/automations/${automationId}/activate`, {
         method: 'POST',
         headers: authHeaders(auth),
      });
      const activeVersion = (await json(activated)).data.version as number;

      const updated = await app.request(`/api/v1/automations/${automationId}`, {
         method: 'PATCH',
         headers: authHeaders(auth),
         body: JSON.stringify({
            steps: [
               { id: 'send', type: 'send', templateId: template.id },
               { id: 'tag', type: 'add_tag', tag: 'welcomed' },
               { id: 'exit', type: 'exit' },
            ],
         }),
      });

      expect(updated.status).toBe(200);
      const body = (await json(updated)).data;
      expect(body.status).toBe('active');
      expect(body.version).toBe(activeVersion + 1);
      expect(body.steps).toHaveLength(3);
   });

   it('enrolls a new subscriber when the automation is active', async () => {
      const auth = await seedOwner(baseEnv());
      const template = await seedTemplate(baseEnv());

      const created = await app.request('/api/v1/automations', {
         method: 'POST',
         headers: authHeaders(auth),
         body: JSON.stringify({
            name: 'Welcome',
            triggerType: 'subscriber.created',
            entryQuery: '',
            fromName: 'Postwren',
            fromEmail: 'noreply@example.com',
            steps: [{ id: 'send', type: 'send', templateId: template.id }],
         }),
      });
      const automationId = (await json(created)).data.id as string;
      await app.request(`/api/v1/automations/${automationId}/activate`, {
         method: 'POST',
         headers: authHeaders(auth),
      });

      const subscriber = await app.request('/api/v1/subscribers', {
         method: 'POST',
         headers: authHeaders(auth),
         body: JSON.stringify({ email: 'auto@example.com' }),
      });
      expect(subscriber.status).toBe(201);

      const run = await baseEnv()
         .DB.prepare(
            'SELECT status, current_step_index FROM automation_runs WHERE automation_id = ?',
         )
         .bind(automationId)
         .first<{ status: string; current_step_index: number }>();
      expect(run).toEqual({ status: 'waiting', current_step_index: 0 });
   });

   it('exits a run when the subscriber unsubscribes before the send', async () => {
      const auth = await seedOwner(baseEnv());
      await seedSubscribers(baseEnv(), [{ email: 'gone@example.com' }]);
      const template = await seedTemplate(baseEnv());

      const created = await app.request('/api/v1/automations', {
         method: 'POST',
         headers: authHeaders(auth),
         body: JSON.stringify({
            name: 'Welcome',
            triggerType: 'subscriber.created',
            entryQuery: '',
            fromName: 'Postwren',
            fromEmail: 'noreply@example.com',
            steps: [
               { id: 'wait', type: 'wait', amount: 1, unit: 'minutes' },
               { id: 'send', type: 'send', templateId: template.id },
            ],
         }),
      });
      const automationId = (await json(created)).data.id as string;
      await app.request(`/api/v1/automations/${automationId}/activate`, {
         method: 'POST',
         headers: authHeaders(auth),
      });
      await app.request(`/api/v1/automations/${automationId}/enroll`, {
         method: 'POST',
         headers: authHeaders(auth),
         body: JSON.stringify({ email: 'gone@example.com' }),
      });

      const env = withEmail(baseEnv(), new FakeEmail());
      await env.DB.prepare("UPDATE subscribers SET status = 'unsubscribed' WHERE email = ?")
         .bind('gone@example.com')
         .run();

      await runAutomationSweep(env, now());
      const run = await env.DB.prepare(
         'SELECT status, exit_reason FROM automation_runs WHERE automation_id = ?',
      )
         .bind(automationId)
         .first<{ status: string; exit_reason: string }>();
      expect(run).toEqual({ status: 'exited', exit_reason: 'suppressed' });
   });
});

describe('saved blocks', () => {
   it('stores and lists a reusable block', async () => {
      const auth = await seedOwner(baseEnv());
      const block = createDocument().children[0];

      const created = await app.request('/api/v1/saved-blocks', {
         method: 'POST',
         headers: authHeaders(auth),
         body: JSON.stringify({ name: 'Intro paragraph', block }),
      });
      expect(created.status).toBe(201);
      const body = await json(created);
      expect(body.data.name).toBe('Intro paragraph');
      expect(body.data.block.type).toBe(block?.type);

      const listed = await app.request('/api/v1/saved-blocks', {
         headers: { cookie: auth.cookie },
      });
      expect(listed.status).toBe(200);
      expect((await json(listed)).data).toHaveLength(1);

      const removed = await app.request(`/api/v1/saved-blocks/${body.data.id}`, {
         method: 'DELETE',
         headers: authHeaders(auth),
      });
      expect(removed.status).toBe(200);
   });
});
