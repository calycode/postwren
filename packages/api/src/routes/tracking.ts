import { Hono } from 'hono';
import { verifyToken } from '@postwren/shared/tokens';
import { ok } from '@postwren/worker-kit/envelope';
import { NotFoundError } from '@postwren/worker-kit/errors';
import { RATE_LIMITS } from '@postwren/shared/contracts';
import type { AppEnv } from '../env';
import { consumeRateLimit } from '../lib/rate-limit';
import { nowSeconds } from '../lib/time';
import { requestClientIp } from '../middleware/context';
import { enrollAutomations } from '../jobs/automation';
import { emitWebhookEventSafe } from '../lib/webhooks';

const TRANSPARENT_PNG_BASE64 =
   'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const TRANSPARENT_PNG = Uint8Array.from(atob(TRANSPARENT_PNG_BASE64), (char) => char.charCodeAt(0));

const TRACKING_LIMIT = { windowSeconds: 60, max: 60 } as const;

type ClickPayload = { m: string; u: string; l?: string };
type OpenPayload = { m: string };
type UnsubscribePayload = { s: string; c: string };

export const trackingRoutes = new Hono<AppEnv>();

function pngResponse(): Response {
   return new Response(TRANSPARENT_PNG, {
      status: 200,
      headers: {
         'content-type': 'image/png',
         'cache-control': 'no-store',
         'content-length': String(TRANSPARENT_PNG.byteLength),
      },
   });
}

trackingRoutes.get('/t/o/:token', async (c) => {
   const token = c.req.param('token').replace(/\.png$/i, '');
   const payload = await verifyToken<OpenPayload>(token, {
      secret: c.env.TOKEN_SECRET,
      purpose: 'open',
   });

   if (payload !== null && typeof payload.m === 'string') {
      try {
         await consumeRateLimit(c.env.DB, `tracking:${requestClientIp(c)}`, TRACKING_LIMIT);
         const now = nowSeconds();
         const updated = await c.env.DB.prepare(
            'UPDATE campaign_recipients SET opened_at = ? WHERE message_id = ? AND opened_at IS NULL',
         )
            .bind(now, payload.m)
            .run();

         if ((updated.meta.changes ?? 0) === 0) {
            await c.env.DB.prepare(
               'UPDATE automation_deliveries SET opened_at = ? WHERE id = ? AND opened_at IS NULL',
            )
               .bind(now, payload.m)
               .run();
         }
      } catch {
         // A pixel must always render, even when the write is rate limited.
      }
   }

   return pngResponse();
});

function appendUtm(
   target: URL,
   campaign: {
      utm_source: string;
      utm_medium: string;
      utm_campaign: string;
   },
   linkId: string | undefined,
): void {
   const setOnce = (key: string, value: string): void => {
      if (value.length > 0 && !target.searchParams.has(key)) {
         target.searchParams.set(key, value);
      }
   };

   setOnce('utm_source', campaign.utm_source.length > 0 ? campaign.utm_source : 'email');
   setOnce('utm_medium', campaign.utm_medium.length > 0 ? campaign.utm_medium : 'campaign');
   setOnce('utm_campaign', campaign.utm_campaign);
   if (linkId !== undefined) setOnce('utm_content', linkId);
}

trackingRoutes.get('/t/c/:token', async (c) => {
   const payload = await verifyToken<ClickPayload>(c.req.param('token'), {
      secret: c.env.TOKEN_SECRET,
      purpose: 'click',
   });

   if (payload === null || typeof payload.m !== 'string' || typeof payload.u !== 'string') {
      throw new NotFoundError();
   }

   let destination: URL;
   try {
      destination = new URL(payload.u);
   } catch {
      throw new NotFoundError();
   }
   if (destination.protocol !== 'https:') {
      throw new NotFoundError();
   }

   const recipient = await c.env.DB.prepare(
      'SELECT campaign_id, subscriber_id FROM campaign_recipients WHERE message_id = ?',
   )
      .bind(payload.m)
      .first<{ campaign_id: string; subscriber_id: string }>();

   const now = nowSeconds();
   await consumeRateLimit(c.env.DB, `tracking:${requestClientIp(c)}`, TRACKING_LIMIT);

   if (recipient === null) {
      const delivery = await c.env.DB.prepare(
         'SELECT automation_id, subscriber_id FROM automation_deliveries WHERE id = ?',
      )
         .bind(payload.m)
         .first<{ automation_id: string; subscriber_id: string }>();

      if (delivery === null) throw new NotFoundError();

      await c.env.DB.prepare(
         `INSERT INTO automation_link_clicks
            (delivery_id, automation_id, subscriber_id, url, link_id, clicked_at)
          VALUES (?, ?, ?, ?, ?, ?)`,
      )
         .bind(
            payload.m,
            delivery.automation_id,
            delivery.subscriber_id,
            destination.toString(),
            payload.l ?? null,
            now,
         )
         .run();

      await c.env.DB.prepare(
         'UPDATE automation_deliveries SET clicked_at = ? WHERE id = ? AND clicked_at IS NULL',
      )
         .bind(now, payload.m)
         .run();

      return new Response(null, {
         status: 302,
         headers: {
            location: destination.toString(),
            'cache-control': 'no-store',
         },
      });
   }

   const campaign = await c.env.DB.prepare(
      'SELECT utm_source, utm_medium, utm_campaign FROM campaigns WHERE id = ?',
   )
      .bind(recipient.campaign_id)
      .first<{ utm_source: string; utm_medium: string; utm_campaign: string }>();

   if (campaign !== null) {
      appendUtm(destination, campaign, payload.l);
   }

   await c.env.DB.prepare(
      `INSERT INTO link_clicks (campaign_id, message_id, subscriber_id, url, link_id, clicked_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
   )
      .bind(
         recipient.campaign_id,
         payload.m,
         recipient.subscriber_id,
         destination.toString(),
         payload.l ?? null,
         now,
      )
      .run();

   await c.env.DB.prepare(
      'UPDATE campaign_recipients SET clicked_at = ? WHERE message_id = ? AND clicked_at IS NULL',
   )
      .bind(now, payload.m)
      .run();

   try {
      await enrollAutomations(
         c.env,
         {
            kind: 'campaign.clicked',
            subscriberId: recipient.subscriber_id,
            campaignId: recipient.campaign_id,
            messageId: payload.m,
            ...(payload.l === undefined ? {} : { linkId: payload.l }),
         },
         now,
      );
   } catch {
      // Tracking redirects must keep working even when enrolment fails.
   }

   return new Response(null, {
      status: 302,
      headers: {
         location: destination.toString(),
         'cache-control': 'no-store',
      },
   });
});

async function verifyUnsubscribe(
   token: string,
   secret: string,
): Promise<UnsubscribePayload | null> {
   const payload = await verifyToken<UnsubscribePayload>(token, {
      secret,
      purpose: 'unsubscribe',
   });

   if (payload === null || typeof payload.s !== 'string' || typeof payload.c !== 'string') {
      return null;
   }

   return payload;
}

trackingRoutes.get('/u/:token', async (c) => {
   const payload = await verifyUnsubscribe(c.req.param('token'), c.env.TOKEN_SECRET);
   if (payload === null) {
      throw new NotFoundError();
   }

   const action = c.req.path;
   const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Unsubscribe</title>
</head>
<body style="font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem;">
<h1 style="font-size:1.25rem;">Unsubscribe</h1>
<p>Confirm that you no longer want to receive these emails.</p>
<form method="post" action="${action}">
<button type="submit" style="padding:0.75rem 1.25rem;">Unsubscribe</button>
</form>
</body>
</html>`;

   return new Response(html, {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
   });
});

trackingRoutes.post('/u/:token', async (c) => {
   const payload = await verifyUnsubscribe(c.req.param('token'), c.env.TOKEN_SECRET);
   if (payload === null) {
      throw new NotFoundError();
   }

   await consumeRateLimit(c.env.DB, `tracking:${requestClientIp(c)}`, {
      windowSeconds: RATE_LIMITS.publicUnsubscribe.windowSeconds,
      max: 60,
   });

   const now = nowSeconds();
   await c.env.DB.prepare(
      `UPDATE subscribers
       SET status = 'unsubscribed', unsubscribed_at = COALESCE(unsubscribed_at, ?)
       WHERE id = ?`,
   )
      .bind(now, payload.s)
      .run();

   const subscriber = await c.env.DB.prepare('SELECT email FROM subscribers WHERE id = ?')
      .bind(payload.s)
      .first<{ email: string }>();
   await emitWebhookEventSafe(c.env, 'subscriber.unsubscribed', {
      id: payload.s,
      email: subscriber?.email ?? null,
      campaign_id: payload.c,
   });

   return ok({ unsubscribed: true, subscriberId: payload.s });
});
