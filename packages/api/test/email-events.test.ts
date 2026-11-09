import { beforeEach, describe, expect, it } from 'vitest';
import type { EmailSendingEvent } from '../src/env';
import { processEmailEvent } from '../src/jobs/email-events';
import {
   baseEnv,
   now,
   resetDb,
   seedCampaign,
   seedRecipient,
   seedSubscribers,
   seedTemplate,
} from './helpers';

beforeEach(async () => {
   await resetDb();
});

async function fixture(email: string, providerMessageId: string) {
   const target = baseEnv();
   const template = await seedTemplate(target);
   const [subscriberId] = await seedSubscribers(target, [{ email, status: 'subscribed' }]);
   const campaignId = await seedCampaign(target, {
      templateId: template.id,
      status: 'sent',
   });
   await seedRecipient(target, {
      campaignId,
      subscriberId: subscriberId!,
      status: 'sent',
      providerMessageId,
   });

   return { target, subscriberId: subscriberId!, campaignId };
}

function event(
   type: string,
   email: string,
   messageId: string,
   eventId: string,
   extra: Record<string, unknown> = {},
): EmailSendingEvent {
   return {
      type,
      payload: {
         eventId,
         messageId,
         recipient: email,
         delivery: { status: 'delivered' },
         ...extra,
      },
   };
}

describe('Email Sending event ingestion', () => {
   it('suppresses a complaint everywhere and records it once', async () => {
      const { target, campaignId } = await fixture('reader@example.com', 'provider-1');
      const complaint = event(
         'cf.email.sending.message.complained',
         'reader@example.com',
         'provider-1',
         'evt_complaint',
         { complaint: { type: 'abuse' } },
      );

      await processEmailEvent(target, complaint);
      await processEmailEvent(target, complaint);

      const subscriber = await target.DB.prepare(
         'SELECT status, unsubscribed_at FROM subscribers WHERE email = ?',
      )
         .bind('reader@example.com')
         .first<{ status: string; unsubscribed_at: number | null }>();
      expect(subscriber?.status).toBe('complained');
      expect(subscriber?.unsubscribed_at).toEqual(expect.any(Number));

      const recipient = await target.DB.prepare(
         'SELECT status FROM campaign_recipients WHERE campaign_id = ?',
      )
         .bind(campaignId)
         .first<{ status: string }>();
      expect(recipient?.status).toBe('complained');

      const count = await target.DB.prepare('SELECT COUNT(*) AS count FROM email_events').first<{
         count: number;
      }>();
      expect(count?.count).toBe(1);
   });

   it('suppresses a hard bounce and ignores a soft one', async () => {
      const hard = await fixture('hard@example.com', 'provider-hard');
      await processEmailEvent(
         hard.target,
         event(
            'cf.email.sending.message.bounced',
            'hard@example.com',
            'provider-hard',
            'evt_hard',
            {
               bounce: { type: 'hard', reason: '550 5.1.1 User unknown' },
            },
         ),
      );

      const soft = await fixture('soft@example.com', 'provider-soft');
      await processEmailEvent(
         soft.target,
         event(
            'cf.email.sending.message.bounced',
            'soft@example.com',
            'provider-soft',
            'evt_soft',
            {
               bounce: { type: 'soft', reason: 'mailbox full' },
            },
         ),
      );

      const hardStatus = await hard.target.DB.prepare(
         'SELECT status FROM subscribers WHERE email = ?',
      )
         .bind('hard@example.com')
         .first<{ status: string }>();
      expect(hardStatus?.status).toBe('bounced');

      const softStatus = await soft.target.DB.prepare(
         'SELECT status FROM subscribers WHERE email = ?',
      )
         .bind('soft@example.com')
         .first<{ status: string }>();
      expect(softStatus?.status).toBe('subscribed');
   });

   it('marks a recipient delivered without changing the subscriber', async () => {
      const { target, campaignId } = await fixture('delivered@example.com', 'provider-delivered');

      await processEmailEvent(
         target,
         event(
            'cf.email.sending.message.delivered',
            'delivered@example.com',
            'provider-delivered',
            'evt_delivered',
         ),
      );

      const recipient = await target.DB.prepare(
         'SELECT status FROM campaign_recipients WHERE campaign_id = ?',
      )
         .bind(campaignId)
         .first<{ status: string }>();
      expect(recipient?.status).toBe('delivered');

      const subscriber = await target.DB.prepare('SELECT status FROM subscribers WHERE email = ?')
         .bind('delivered@example.com')
         .first<{ status: string }>();
      expect(subscriber?.status).toBe('subscribed');
   });

   it('leaves an unknown recipient as a recorded event', async () => {
      const target = baseEnv();
      await processEmailEvent(
         target,
         event(
            'cf.email.sending.message.complained',
            'nobody@example.com',
            'provider-unknown',
            'evt_unknown',
            { complaint: { type: 'abuse' } },
         ),
      );

      const row = await target.DB.prepare(
         'SELECT type, email, created_at FROM email_events WHERE event_id = ?',
      )
         .bind('evt_unknown')
         .first<{ type: string; email: string; created_at: number }>();
      expect(row).toMatchObject({
         type: 'cf.email.sending.message.complained',
         email: 'nobody@example.com',
      });
      expect(row?.created_at).toBeLessThanOrEqual(now());
   });
});
