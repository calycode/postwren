import { describe, expect, it } from 'vitest';
import { WEBHOOK_EVENTS, isWebhookEvent, webhookSignature } from './index';

describe('webhook signatures', () => {
   it('signs the timestamp and raw body together', async () => {
      const body = '{"event":"subscriber.created"}';
      const first = await webhookSignature('whsec_test', 1_700_000_000, body);
      const second = await webhookSignature('whsec_test', 1_700_000_000, body);
      const differentBody = await webhookSignature('whsec_test', 1_700_000_000, `${body} `);

      expect(first).toMatch(/^t=1700000000,v1=[0-9a-f]{64}$/);
      expect(first).toBe(second);
      expect(first).not.toBe(differentBody);
   });

   it('recognises only declared events', () => {
      expect(isWebhookEvent('campaign.sent')).toBe(true);
      expect(isWebhookEvent('campaign.deleted')).toBe(false);
      expect(WEBHOOK_EVENTS).toContain('subscriber.confirmed');
   });
});
