import { beforeEach, describe, expect, it } from 'vitest';
import {
   baseEnv,
   createAppForTest,
   json,
   now,
   resetDb,
   seedCampaign,
   seedOwner,
   seedRecipient,
   seedSubscribers,
   seedTemplate,
} from './helpers';

const app = createAppForTest();
const target = baseEnv();

async function owner() {
   return seedOwner(target);
}

beforeEach(async () => {
   await resetDb();
});

describe('dashboard', () => {
   it('reports list health, growth and setup from real rows', async () => {
      const auth = await owner();
      const createdAt = now() - 60;
      const subscriberIds = await seedSubscribers(target, [
         { email: 'a@example.com', createdAt },
         { email: 'b@example.com', status: 'unsubscribed', createdAt },
      ]);
      const template = await seedTemplate(target, { name: 'Welcome' });
      const campaignId = await seedCampaign(target, {
         templateId: template.id,
         status: 'sent',
         name: 'Welcome send',
      });
      const first = subscriberIds[0];
      if (first === undefined) throw new Error('missing seeded subscriber');
      const messageId = await seedRecipient(target, {
         campaignId,
         subscriberId: first,
         status: 'sent',
      });

      await target.DB.prepare('UPDATE campaigns SET completed_at = ?, started_at = ? WHERE id = ?')
         .bind(createdAt, createdAt, campaignId)
         .run();
      await target.DB.prepare(
         'UPDATE campaign_recipients SET sent_at = ?, opened_at = ? WHERE message_id = ?',
      )
         .bind(createdAt, createdAt, messageId)
         .run();

      await target.DB.prepare(
         `INSERT INTO sender_addresses
            (id, email, name, domain, verified_at, is_default, created_at)
          VALUES ('snd_1', 'a@example.com', '', 'example.com', ?, 1, ?)`,
      )
         .bind(createdAt, createdAt)
         .run();

      const response = await app.request('/api/v1/dashboard', {
         headers: { cookie: auth.cookie },
      });

      expect(response.status).toBe(200);
      const body = await json(response);
      expect(body.data.counts).toMatchObject({
         activeSubscribers: 1,
         totalSubscribers: 2,
         unsubscribed: 1,
         templates: 1,
         campaignsSent: 1,
      });
      expect(body.data.engagement).toMatchObject({
         sent: 1,
         opened: 1,
         openRate: 1,
      });
      const growthTotal: number = body.data.growth.reduce(
         (sum: number, week: { count: number }) => sum + week.count,
         0,
      );
      expect(growthTotal).toBe(2);
      expect(body.data.recent[0]).toMatchObject({ id: campaignId, name: 'Welcome send' });
      expect(body.data.setup).toEqual({
         verifiedSender: true,
         template: true,
         sentCampaign: true,
      });
   });
});

describe('subscriber activity', () => {
   it('returns totals, sends and clicks for one subscriber', async () => {
      const auth = await owner();
      const [subscriberId] = await seedSubscribers(target, [{ email: 'reader@example.com' }]);
      if (subscriberId === undefined) throw new Error('missing seeded subscriber');
      const template = await seedTemplate(target);
      const campaignId = await seedCampaign(target, {
         templateId: template.id,
         status: 'sent',
         name: 'October send',
      });
      const messageId = await seedRecipient(target, {
         campaignId,
         subscriberId,
         status: 'sent',
      });
      const at = now() - 30;

      await target.DB.prepare(
         'UPDATE campaign_recipients SET sent_at = ?, opened_at = ?, clicked_at = ? WHERE message_id = ?',
      )
         .bind(at, at, at, messageId)
         .run();
      await target.DB.prepare(
         `INSERT INTO link_clicks (campaign_id, message_id, subscriber_id, url, link_id, clicked_at)
          VALUES (?, ?, ?, ?, 'button-1', ?)`,
      )
         .bind(campaignId, messageId, subscriberId, 'https://example.com/read', at)
         .run();

      const response = await app.request(`/api/v1/subscribers/${subscriberId}/activity`, {
         headers: { cookie: auth.cookie },
      });

      expect(response.status).toBe(200);
      const body = await json(response);
      expect(body.data.totals).toMatchObject({ received: 1, opened: 1, clicked: 1 });
      expect(body.data.timeline[0]).toMatchObject({
         campaignId,
         campaignName: 'October send',
         clickedAt: at,
      });
      expect(body.data.clicks[0]).toMatchObject({
         url: 'https://example.com/read',
         campaignName: 'October send',
      });
   });
});
