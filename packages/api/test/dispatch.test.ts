import { beforeEach, describe, expect, it } from 'vitest';
import {
   FakeQueue,
   baseEnv,
   now,
   resetDb,
   runScheduledWith,
   seedCampaign,
   seedSubscribers,
   seedTemplate,
   withQueue,
} from './helpers';

beforeEach(async () => {
   await resetDb();
});

describe('dispatch', () => {
   it('creates one recipient row per matching subscriber and enqueues one batch', async () => {
      const target = baseEnv();
      const template = await seedTemplate(target);
      await seedSubscribers(target, [
         { email: 'one@example.com', tags: ['news'] },
         { email: 'two@example.com', tags: ['news'] },
         { email: 'three@example.com', tags: ['other'] },
      ]);
      const campaignId = await seedCampaign(target, {
         templateId: template.id,
         audienceQuery: 'tag:news',
         status: 'scheduled',
         scheduledAt: now() - 60,
      });

      const queue = new FakeQueue();
      const env = withQueue(target, queue);
      await runScheduledWith(env);

      const recipients = await target.DB.prepare(
         'SELECT subscriber_id, status FROM campaign_recipients WHERE campaign_id = ?',
      )
         .bind(campaignId)
         .all<{ subscriber_id: string; status: string }>();

      expect(recipients.results).toHaveLength(2);
      expect(recipients.results.every((row) => row.status === 'queued')).toBe(true);
      expect(queue.batches).toHaveLength(1);
      expect(queue.batches[0]).toHaveLength(1);
      expect(queue.batches[0]?.[0]?.recipientIds).toHaveLength(2);

      const campaign = await target.DB.prepare(
         'SELECT status, dispatch_cursor FROM campaigns WHERE id = ?',
      )
         .bind(campaignId)
         .first<{ status: string; dispatch_cursor: string }>();
      expect(campaign?.status).toBe('sending');
      expect(campaign?.dispatch_cursor).not.toBeNull();
   });

   it('does not duplicate recipient rows when dispatch runs twice', async () => {
      const target = baseEnv();
      const template = await seedTemplate(target);
      await seedSubscribers(target, [
         { email: 'one@example.com', tags: ['news'] },
         { email: 'two@example.com', tags: ['news'] },
      ]);
      const campaignId = await seedCampaign(target, {
         templateId: template.id,
         audienceQuery: 'tag:news',
         status: 'scheduled',
         scheduledAt: now() - 60,
      });

      const queue = new FakeQueue();
      const env = withQueue(target, queue);
      await runScheduledWith(env);
      await runScheduledWith(env);

      const count = await target.DB.prepare(
         'SELECT COUNT(*) AS count FROM campaign_recipients WHERE campaign_id = ?',
      )
         .bind(campaignId)
         .first<{ count: number }>();

      expect(count?.count).toBe(2);
      expect(queue.batches).toHaveLength(1);
   });
});
