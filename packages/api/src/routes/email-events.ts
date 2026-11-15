import { Hono } from 'hono';
import { isProviderId } from '@postwren/shared/providers';
import type { AppEnv } from '../env';
import { verifyAndParseWebhook } from '../lib/email-events';
import { resolveProviderByWebhookToken } from '../lib/sending-provider';
import { processEmailEvent } from '../jobs/email-events';

/**
 * Public provider webhooks. The path token selects the configuration; signed
 * providers are verified locally, token-only providers rely on the unguessable
 * token. Nothing is processed before that check succeeds.
 */
export const emailEventRoutes = new Hono<AppEnv>();

emailEventRoutes.post('/api/email-events/:provider/:token', async (c) => {
   const provider = c.req.param('provider');
   if (!isProviderId(provider)) return c.json({ error: 'not_found' }, 404);

   const resolved = await resolveProviderByWebhookToken(c.env, c.req.param('token'));
   if (resolved === null || resolved.provider !== provider) {
      return c.json({ error: 'not_found' }, 404);
   }

   const result = await verifyAndParseWebhook({
      provider,
      raw: await c.req.text(),
      headers: c.req.raw.headers,
      secret: resolved.webhookSecret,
      now: Math.floor(Date.now() / 1000),
   });

   if (!result.ok) {
      console.warn(
         JSON.stringify({
            level: 'warn',
            event: 'provider_webhook_rejected',
            provider,
            reason: result.reason,
         }),
      );
      return c.json({ error: result.reason }, result.status);
   }

   for (const event of result.events) {
      await processEmailEvent(c.env, event);
   }

   if (result.events.length === 0) {
      console.info(JSON.stringify({ level: 'info', event: 'provider_webhook_ignored', provider }));
   }

   return c.json({ received: true, provider, events: result.events.length });
});
