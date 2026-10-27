import { beforeEach, describe, expect, it } from 'vitest';
import {
   baseEnv,
   createAppForTest,
   resetDb,
   seedCampaign,
   seedRecipient,
   seedSubscribers,
   seedTemplate,
   signTokenForTest,
} from './helpers';

const app = createAppForTest();

beforeEach(async () => {
   await resetDb();
});

async function fixture() {
   const target = baseEnv();
   const template = await seedTemplate(target);
   const [subscriberId] = await seedSubscribers(target, [{ email: 'reader@example.com' }]);
   const campaignId = await seedCampaign(target, {
      templateId: template.id,
      audienceQuery: '',
      status: 'sending',
      utmCampaign: 'launch',
   });
   const messageId = await seedRecipient(target, {
      campaignId,
      subscriberId: subscriberId!,
   });

   return { target, campaignId, subscriberId: subscriberId!, messageId };
}

describe('tracking', () => {
   it('redirects a valid click to the signed destination with UTMs and records it', async () => {
      const { target, campaignId, subscriberId, messageId } = await fixture();
      const token = await signTokenForTest(target.TOKEN_SECRET, 'click', {
         m: messageId,
         u: 'https://destination.example/path?x=1',
         l: 'link-1',
      });

      const response = await app.request(`/t/c/${token}`);

      expect(response.status).toBe(302);
      const location = new URL(response.headers.get('location') ?? '');
      expect(location.host).toBe('destination.example');
      expect(location.searchParams.get('x')).toBe('1');
      expect(location.searchParams.get('utm_source')).toBe('email');
      expect(location.searchParams.get('utm_medium')).toBe('campaign');
      expect(location.searchParams.get('utm_campaign')).toBe('launch');
      expect(location.searchParams.get('utm_content')).toBe('link-1');

      const clicks = await target.DB.prepare(
         'SELECT COUNT(*) AS count FROM link_clicks WHERE campaign_id = ? AND subscriber_id = ?',
      )
         .bind(campaignId, subscriberId)
         .first<{ count: number }>();
      expect(clicks?.count).toBe(1);

      const recipient = await target.DB.prepare(
         'SELECT clicked_at FROM campaign_recipients WHERE message_id = ?',
      )
         .bind(messageId)
         .first<{ clicked_at: number | null }>();
      expect(recipient?.clicked_at).not.toBeNull();
   });

   it('returns 404 for a forged click token', async () => {
      const response = await app.request('/t/c/forged.token');
      expect(response.status).toBe(404);
   });

   it('serves a transparent pixel and records the first open only', async () => {
      const { target, messageId } = await fixture();
      const token = await signTokenForTest(target.TOKEN_SECRET, 'open', { m: messageId });

      const first = await app.request(`/t/o/${token}.png`);
      expect(first.status).toBe(200);
      expect(first.headers.get('content-type')).toBe('image/png');
      expect(first.headers.get('cache-control')).toBe('no-store');

      await target.DB.prepare(
         'UPDATE campaign_recipients SET opened_at = 1234567890 WHERE message_id = ?',
      )
         .bind(messageId)
         .run();

      const second = await app.request(`/t/o/${token}.png`);
      expect(second.status).toBe(200);

      const recipient = await target.DB.prepare(
         'SELECT opened_at FROM campaign_recipients WHERE message_id = ?',
      )
         .bind(messageId)
         .first<{ opened_at: number | null }>();
      expect(recipient?.opened_at).toBe(1234567890);
   });

   it('unsubscribes idempotently through the POST form', async () => {
      const { target, campaignId, subscriberId } = await fixture();
      const token = await signTokenForTest(target.TOKEN_SECRET, 'unsubscribe', {
         s: subscriberId,
         c: campaignId,
      });

      const page = await app.request(`/u/${token}`);
      expect(page.status).toBe(200);
      expect(page.headers.get('content-type')).toContain('text/html');
      expect(await page.text()).toContain('<form method="post"');

      const first = await app.request(`/u/${token}`, { method: 'POST' });
      expect(first.status).toBe(200);
      const second = await app.request(`/u/${token}`, { method: 'POST' });
      expect(second.status).toBe(200);

      const subscriber = await target.DB.prepare(
         'SELECT status, unsubscribed_at FROM subscribers WHERE id = ?',
      )
         .bind(subscriberId)
         .first<{ status: string; unsubscribed_at: number | null }>();

      expect(subscriber?.status).toBe('unsubscribed');
      expect(subscriber?.unsubscribed_at).not.toBeNull();
   });
});
