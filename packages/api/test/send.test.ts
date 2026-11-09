import { beforeEach, describe, expect, it } from 'vitest';
import { createDocument, createRepeatBlock, createTextBlock } from '@postwren/email/ir';
import workerHandler from '../src/index';
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

beforeEach(async () => {
   await resetDb();
});

async function fixture(options: { status?: string } = {}) {
   const target = baseEnv();
   const template = await seedTemplate(target);
   const [subscriberId] = await seedSubscribers(target, [
      { email: 'reader@example.com', tags: ['news'], status: options.status ?? 'subscribed' },
   ]);
   const campaignId = await seedCampaign(target, {
      templateId: template.id,
      audienceQuery: 'tag:news',
      status: 'sending',
   });
   const messageId = await seedRecipient(target, {
      campaignId,
      subscriberId: subscriberId!,
   });

   return { target, campaignId, subscriberId: subscriberId!, messageId };
}

describe('queue consumer', () => {
   it('sends once and marks the campaign sent', async () => {
      const { target, campaignId, subscriberId } = await fixture();
      const email = new FakeEmail();
      const queue = new FakeQueue();
      const env = withQueue(withEmail(target, email), queue);

      const { batch } = makeBatch([{ campaignId, recipientIds: [subscriberId] }]);
      await workerHandler.queue(batch, env);

      expect(email.sent).toHaveLength(1);
      expect(email.sent[0]?.to).toBe('reader@example.com');
      expect(email.sent[0]?.headers?.['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
      expect(email.sent[0]?.headers?.['List-Unsubscribe']).toContain('/u/');
      expect(email.sent[0]?.headers?.['List-Unsubscribe']).toContain(
         '<mailto:unsubscribe@example.com>',
      );
      expect(email.sent[0]?.html).toContain('/t/o/');
      expect(email.sent[0]?.text).toContain('Write something');

      const recipient = await target.DB.prepare(
         'SELECT status, sent_at, provider_message_id FROM campaign_recipients WHERE campaign_id = ? AND subscriber_id = ?',
      )
         .bind(campaignId, subscriberId)
         .first<{ status: string; sent_at: number | null; provider_message_id: string | null }>();

      expect(recipient?.status).toBe('sent');
      expect(recipient?.sent_at).not.toBeNull();
      expect(recipient?.provider_message_id).toBe('provider-1');

      const campaign = await target.DB.prepare(
         'SELECT status, completed_at FROM campaigns WHERE id = ?',
      )
         .bind(campaignId)
         .first<{ status: string; completed_at: number | null }>();

      expect(campaign?.status).toBe('sent');
      expect(campaign?.completed_at).not.toBeNull();
   });

   it('sends zero messages when the same batch is replayed', async () => {
      const { target, campaignId, subscriberId } = await fixture();
      const email = new FakeEmail();
      const env = withQueue(withEmail(target, email), new FakeQueue());

      const { batch } = makeBatch([{ campaignId, recipientIds: [subscriberId] }]);
      await workerHandler.queue(batch, env);
      expect(email.sent).toHaveLength(1);

      await workerHandler.queue(batch, env);
      expect(email.sent).toHaveLength(1);
   });

   it('merges subscriber and campaign metadata from the frozen campaign row', async () => {
      const target = baseEnv();
      const document = createDocument();
      const text = document.children[0];
      if (text?.type === 'text') {
         text.text = '{{ subscriber.meta.plan }} / {{ campaign.meta.edition | default("none") }}';
      }
      const template = await seedTemplate(target, { document });
      const [subscriberId] = await seedSubscribers(target, [
         {
            email: 'meta-reader@example.com',
            tags: ['news'],
            metadata: { plan: 'pro' },
         },
      ]);
      const campaignId = await seedCampaign(target, {
         templateId: template.id,
         audienceQuery: 'tag:news',
         status: 'sending',
         metadata: { edition: 'october' },
      });
      await seedRecipient(target, { campaignId, subscriberId: subscriberId! });

      const email = new FakeEmail();
      const env = withQueue(withEmail(target, email), new FakeQueue());
      const { batch } = makeBatch([{ campaignId, recipientIds: [subscriberId!] }]);

      await workerHandler.queue(batch, env);

      expect(email.sent).toHaveLength(1);
      expect(email.sent[0]?.text).toContain('pro / october');
   });

   it('renders one repeat block per item in the campaign data', async () => {
      const target = baseEnv();
      const document = createDocument();
      const repeat = createRepeatBlock();
      repeat.data = 'posts';
      repeat.itemKey = 'slug';
      repeat.children = [createTextBlock('{{ item.title }} ({{ itemIndex1 }})')];
      document.children = [repeat];

      const template = await seedTemplate(target, { document });
      const [subscriberId] = await seedSubscribers(target, [
         { email: 'digest@example.com', tags: ['news'] },
      ]);
      const campaignId = await seedCampaign(target, {
         templateId: template.id,
         audienceQuery: 'tag:news',
         status: 'sending',
         data: {
            posts: [
               { slug: 'one', title: 'First post', url: 'https://example.com/one' },
               { slug: 'two', title: 'Second post', url: 'https://example.com/two' },
            ],
         },
      });
      await seedRecipient(target, { campaignId, subscriberId: subscriberId! });

      const email = new FakeEmail();
      const env = withQueue(withEmail(target, email), new FakeQueue());
      const { batch } = makeBatch([{ campaignId, recipientIds: [subscriberId!] }]);

      await workerHandler.queue(batch, env);

      expect(email.sent).toHaveLength(1);
      expect(email.sent[0]?.text).toContain('First post (1)');
      expect(email.sent[0]?.text).toContain('Second post (2)');
      expect(email.sent[0]?.html).toContain('First post (1)');
      expect(email.sent[0]?.html).toContain('Second post (2)');
   });

   it('marks a suppressed subscriber without sending', async () => {
      const { target, campaignId, subscriberId } = await fixture({ status: 'unsubscribed' });
      const email = new FakeEmail();
      const env = withQueue(withEmail(target, email), new FakeQueue());

      const { batch } = makeBatch([{ campaignId, recipientIds: [subscriberId] }]);
      await workerHandler.queue(batch, env);

      expect(email.sent).toHaveLength(0);

      const recipient = await target.DB.prepare(
         'SELECT status FROM campaign_recipients WHERE campaign_id = ? AND subscriber_id = ?',
      )
         .bind(campaignId, subscriberId)
         .first<{ status: string }>();
      expect(recipient?.status).toBe('suppressed');
   });

   it('pauses the campaign on a daily quota error without failing the recipient', async () => {
      const { target, campaignId, subscriberId } = await fixture();
      const email = new FakeEmail();
      email.failWith = { code: 'E_DAILY_LIMIT_EXCEEDED' };
      const env = withQueue(withEmail(target, email), new FakeQueue());

      const { batch } = makeBatch([{ campaignId, recipientIds: [subscriberId] }]);
      await workerHandler.queue(batch, env);

      const campaign = await target.DB.prepare('SELECT status FROM campaigns WHERE id = ?')
         .bind(campaignId)
         .first<{ status: string }>();
      expect(campaign?.status).toBe('paused');

      const recipient = await target.DB.prepare(
         'SELECT status, error_code FROM campaign_recipients WHERE campaign_id = ? AND subscriber_id = ?',
      )
         .bind(campaignId, subscriberId)
         .first<{ status: string; error_code: string | null }>();
      expect(recipient?.status).not.toBe('failed');
      expect(recipient?.error_code).toBe('E_DAILY_LIMIT_EXCEEDED');
   });

   it('marks the campaign sent when the last recipient settles', async () => {
      const { target, campaignId, subscriberId } = await fixture();
      const [otherId] = await seedSubscribers(target, [{ email: 'done@example.com' }]);
      await seedRecipient(target, {
         campaignId,
         subscriberId: otherId!,
         status: 'sent',
      });

      const email = new FakeEmail();
      const env = withQueue(withEmail(target, email), new FakeQueue());

      const { batch } = makeBatch([{ campaignId, recipientIds: [subscriberId] }]);
      await workerHandler.queue(batch, env);

      const campaign = await target.DB.prepare(
         'SELECT status, completed_at FROM campaigns WHERE id = ?',
      )
         .bind(campaignId)
         .first<{ status: string; completed_at: number | null }>();

      expect(campaign?.status).toBe('sent');
      expect(campaign?.completed_at).toBeLessThanOrEqual(now());
   });

   it('pauses instead of sending when APP_URL is unset', async () => {
      const { target, campaignId, subscriberId } = await fixture();
      const email = new FakeEmail();
      const env = withQueue(withEmail({ ...target, APP_URL: '' }, email), new FakeQueue());

      const { batch } = makeBatch([{ campaignId, recipientIds: [subscriberId] }]);
      await workerHandler.queue(batch, env);

      expect(email.sent).toHaveLength(0);

      const campaign = await target.DB.prepare('SELECT status FROM campaigns WHERE id = ?')
         .bind(campaignId)
         .first<{ status: string }>();
      expect(campaign?.status).toBe('paused');

      const recipient = await target.DB.prepare(
         'SELECT status FROM campaign_recipients WHERE campaign_id = ? AND subscriber_id = ?',
      )
         .bind(campaignId, subscriberId)
         .first<{ status: string }>();
      expect(recipient?.status).toBe('queued');
   });
});
