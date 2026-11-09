import { Hono } from 'hono';
import type { Context } from 'hono';
import { ZodError } from 'zod';
import { sha256Hex } from '@postwren/worker-kit/ids';
import { fail, ok } from '@postwren/worker-kit/envelope';
import { isAppError } from '@postwren/worker-kit/errors';
import { RATE_LIMITS, publicSubscribeInput } from '@postwren/shared/contracts';
import { signToken, verifyToken } from '@postwren/shared/tokens';
import {
   createButtonBlock,
   createDocument,
   createHeadingBlock,
   createTextBlock,
   parseDocument,
} from '@postwren/email/ir';
import { applyMergeTags } from '@postwren/email/template';
import { renderEmail } from '@postwren/email/render';
import type { AppEnv } from '../env';
import type { CampaignRow } from '../lib/rows';
import { consumeRateLimit } from '../lib/rate-limit';
import { readJson } from '../lib/validation';
import { appOrigin } from '../lib/app-url';
import { nowSeconds } from '../lib/time';
import { enrollAddedTags, enrollSubscriberCreated } from '../jobs/automation';
import { loadSubscriberMetadata, loadSubscriberTags, upsertSubscriber } from '../lib/subscribers';
import { requestClientIp } from '../middleware/context';
import { createCloudflareAdapter } from '../adapters/email';
import { checkEmailHygiene, domainAcceptsMail, domainOfEmail } from '../lib/email-hygiene';
import { verifyTurnstile } from '../lib/turnstile';
import { parseMetadataJson } from '@postwren/shared/metadata';
import { parsePayloadJson } from '@postwren/shared/payload';
import { emitWebhookEventSafe } from '../lib/webhooks';

type SubscribeKeyRow = {
   id: string;
   name: string;
   allowed_origins: string;
   default_tags: string;
   require_confirmation: number;
   turnstile_site_key: string | null;
   revoked_at: number | null;
};

const CONFIRM_TTL_SECONDS = 60 * 60 * 24 * 7;

export const publicRoutes = new Hono<AppEnv>();

function stringArray(value: string): string[] {
   try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed)
         ? parsed.filter((item): item is string => typeof item === 'string')
         : [];
   } catch {
      return [];
   }
}

function subscribeSecret(c: Context<AppEnv>): string {
   const authorization = c.req.header('authorization') ?? '';
   if (/^bearer\s+/i.test(authorization)) {
      return authorization.replace(/^bearer\s+/i, '').trim();
   }

   return (c.req.header('x-subscribe-key') ?? '').trim();
}

async function findKey(db: D1Database, secret: string): Promise<SubscribeKeyRow | null> {
   if (!secret.startsWith('pk_live_')) return null;

   return db
      .prepare(
         `SELECT id, name, allowed_origins, default_tags, require_confirmation,
                 turnstile_site_key, revoked_at
          FROM subscribe_keys WHERE key_hash = ? AND revoked_at IS NULL`,
      )
      .bind(await sha256Hex(secret))
      .first<SubscribeKeyRow>();
}

function withCors(response: Response, origin: string | null): Response {
   if (origin !== null) {
      response.headers.set('access-control-allow-origin', origin);
      response.headers.set('vary', 'Origin');
   }
   return response;
}

function htmlResponse(html: string, status = 200): Response {
   return new Response(html, {
      status,
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
   });
}

function confirmationDocument(
   firstName: string | null,
   confirmUrl: string,
): ReturnType<typeof createDocument> {
   const document = createDocument();
   const heading = createHeadingBlock();
   heading.text = 'Confirm your subscription';

   const text = createTextBlock(
      `Hi ${firstName ?? 'there'},\n\nOne click confirms that you want to receive these emails. If you did not ask for them, ignore this message and nothing will be sent.`,
   );

   const button = createButtonBlock();
   button.text = 'Confirm subscription';
   button.href = confirmUrl;

   document.children = [heading, text, button];
   return document;
}

async function sendConfirmationEmail(
   c: Context<AppEnv>,
   subscriberId: string,
   email: string,
   firstName: string | null,
): Promise<string> {
   const token = await signToken(
      { s: subscriberId },
      { secret: c.env.TOKEN_SECRET, purpose: 'confirm', ttlSeconds: CONFIRM_TTL_SECONDS },
   );
   const confirmUrl = `${appOrigin(c)}/confirm/${token}`;
   const rendered = renderEmail(confirmationDocument(firstName, confirmUrl));

   try {
      await createCloudflareAdapter(c.env).send({
         from: { name: 'Postwren', email: c.env.EMAIL_FROM },
         to: email,
         subject: 'Confirm your subscription',
         html: rendered.html,
         text: rendered.text,
      });
   } catch (error) {
      // A signup must not fail because the confirmation mail bounced at the provider.
      console.error('confirmation_email_failed', {
         email,
         reason: error instanceof Error ? error.message : String(error),
      });
   }

   return confirmUrl;
}

publicRoutes.options('/api/public/subscribe', (c) => {
   const headers: Record<string, string> = {
      'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-allow-headers': 'authorization, content-type, x-subscribe-key',
      'access-control-max-age': '600',
      vary: 'Origin',
   };

   const origin = c.req.header('origin');
   if (origin !== undefined) headers['access-control-allow-origin'] = origin;

   return new Response(null, { status: 204, headers });
});

publicRoutes.post('/api/public/subscribe', async (c) => {
   const origin = c.req.header('origin') ?? null;
   const requestId = c.get('requestId');
   const reply = (response: Response): Response => withCors(response, origin);

   const secret = subscribeSecret(c);
   if (secret.length === 0) {
      return reply(fail(401, 'unauthorized', 'A subscribe key is required', undefined, requestId));
   }

   const key = await findKey(c.env.DB, secret);
   if (key === null) {
      return reply(
         fail(401, 'unauthorized', 'The subscribe key is invalid or revoked', undefined, requestId),
      );
   }

   const allowedOrigins = stringArray(key.allowed_origins);
   if (origin !== null && !allowedOrigins.includes(origin)) {
      return reply(
         fail(
            403,
            'forbidden',
            'Origin is not allowed for this subscribe key',
            undefined,
            requestId,
         ),
      );
   }

   try {
      await consumeRateLimit(
         c.env.DB,
         `public-subscribe:${requestClientIp(c)}`,
         RATE_LIMITS.publicSubscribe,
      );

      const raw = await readJson(c);
      const record =
         typeof raw === 'object' && raw !== null && !Array.isArray(raw)
            ? (raw as Record<string, unknown>)
            : {};

      if (typeof record.website === 'string' && record.website.trim().length > 0) {
         return reply(ok({ subscribed: true }, { status: 202, requestId }));
      }

      const body = publicSubscribeInput.parse(raw);

      if (key.turnstile_site_key !== null && key.turnstile_site_key.length > 0) {
         await verifyTurnstile(c.env, body.turnstileToken, requestClientIp(c));
      }

      const hygiene = checkEmailHygiene(body.email);
      if (!hygiene.ok) {
         return reply(
            fail(
               422,
               'undeliverable_email',
               hygiene.reason === 'disposable'
                  ? 'Disposable email addresses are not accepted'
                  : 'The email domain looks misspelled',
               hygiene.suggestion === undefined ? undefined : { suggestion: hygiene.suggestion },
               requestId,
            ),
         );
      }

      if (c.env.ENVIRONMENT === 'production') {
         const acceptsMail = await domainAcceptsMail(domainOfEmail(body.email));
         if (acceptsMail === false) {
            return reply(
               fail(
                  422,
                  'undeliverable_email',
                  'That email domain cannot receive mail',
                  undefined,
                  requestId,
               ),
            );
         }
      }

      const requireConfirmation = key.require_confirmation === 1;
      const tags = [...stringArray(key.default_tags), ...(body.tags ?? [])];
      const result = await upsertSubscriber(
         c.env.DB,
         {
            email: body.email,
            firstName: body.firstName ?? null,
            lastName: body.lastName ?? null,
            status: requireConfirmation ? 'pending' : 'subscribed',
            source: body.source ?? 'public_subscribe',
            sourceUrl: body.sourceUrl ?? null,
            updateSource: true,
            tags,
            metadata: body.metadata ?? {},
         },
         nowSeconds(),
      );

      const row = await c.env.DB.prepare(
         'SELECT id, email, first_name, status, deleted_at FROM subscribers WHERE id = ?',
      )
         .bind(result.id)
         .first<{
            id: string;
            email: string;
            first_name: string | null;
            status: string;
            deleted_at: number | null;
         }>();

      const pending =
         requireConfirmation && row !== null && row.deleted_at === null && row.status === 'pending';

      if (pending && row !== null) {
         const devConfirmUrl = await sendConfirmationEmail(c, row.id, row.email, row.first_name);

         return reply(
            ok(
               {
                  subscribed: true,
                  pending: true,
                  ...(c.env.ENVIRONMENT === 'production' ? {} : { devConfirmUrl }),
               },
               { status: 202, requestId },
            ),
         );
      }

      if (!requireConfirmation && result.created) {
         try {
            await enrollSubscriberCreated(c.env, result.id);
         } catch {
            // A failed enrollment must not turn a valid signup into an error.
         }
         await emitWebhookEventSafe(c.env, 'subscriber.created', {
            id: result.id,
            email: body.email,
            first_name: body.firstName ?? null,
            last_name: body.lastName ?? null,
            source: body.source ?? 'public_subscribe',
            tags,
         });
      }
      await enrollAddedTags(c.env, result.id, result.addedTags);

      // Same answer for new and existing addresses: the endpoint is public and
      // must not become a list-membership oracle.
      return reply(ok({ subscribed: true }, { status: 202, requestId }));
   } catch (error) {
      if (isAppError(error)) {
         return reply(fail(error.status, error.code, error.message, error.details, requestId));
      }

      if (error instanceof ZodError) {
         return reply(
            fail(
               422,
               'validation_error',
               'Request validation failed',
               { issues: error.issues },
               requestId,
            ),
         );
      }

      throw error;
   }
});

function confirmationPage(state: 'confirm' | 'done' | 'invalid', action = ''): Response {
   const body =
      state === 'confirm'
         ? `<p>Confirm that you want to receive these emails.</p>
<form id="confirm-form" method="post" action="${action}">
<button type="submit" style="padding:0.75rem 1.25rem;">Confirm subscription</button>
</form>
<script>
   // The reader already clicked the link in the email, so do not ask for a
   // second tap. Link prefetchers fetch this page without running scripts.
   document.getElementById('confirm-form').submit();
</script>`
         : state === 'done'
           ? '<p>You are confirmed. You can close this page.</p>'
           : '<p>This confirmation link is invalid or has expired.</p>';

   return htmlResponse(
      `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${state === 'done' ? 'Confirmed' : 'Confirm subscription'}</title>
</head>
<body style="font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem;">
<h1 style="font-size:1.25rem;">${state === 'done' ? 'Subscription confirmed' : state === 'confirm' ? 'Confirm subscription' : 'Link not valid'}</h1>
${body}
</body>
</html>`,
      state === 'invalid' ? 404 : 200,
   );
}

async function confirmPayload(c: Context<AppEnv>, token: string): Promise<{ s: string } | null> {
   const payload = await verifyToken<{ s: string }>(token, {
      secret: c.env.TOKEN_SECRET,
      purpose: 'confirm',
   });
   return payload !== null && typeof payload.s === 'string' ? { s: payload.s } : null;
}

publicRoutes.get('/confirm/:token', async (c) => {
   const payload = await confirmPayload(c, c.req.param('token'));
   if (payload === null) return confirmationPage('invalid');

   const row = await c.env.DB.prepare('SELECT status, deleted_at FROM subscribers WHERE id = ?')
      .bind(payload.s)
      .first<{ status: string; deleted_at: number | null }>();

   if (
      row === null ||
      row.deleted_at !== null ||
      row.status === 'unsubscribed' ||
      row.status === 'bounced' ||
      row.status === 'complained'
   ) {
      return confirmationPage('invalid');
   }
   if (row.status === 'subscribed') return confirmationPage('done');

   return confirmationPage('confirm', `/confirm/${c.req.param('token')}`);
});

publicRoutes.post('/confirm/:token', async (c) => {
   const payload = await confirmPayload(c, c.req.param('token'));
   if (payload === null) return confirmationPage('invalid');

   await consumeRateLimit(c.env.DB, `confirm:${requestClientIp(c)}`, RATE_LIMITS.publicUnsubscribe);

   const existing = await c.env.DB.prepare(
      'SELECT status, deleted_at FROM subscribers WHERE id = ?',
   )
      .bind(payload.s)
      .first<{ status: string; deleted_at: number | null }>();

   if (
      existing === null ||
      existing.deleted_at !== null ||
      existing.status === 'unsubscribed' ||
      existing.status === 'bounced' ||
      existing.status === 'complained'
   ) {
      return confirmationPage('invalid');
   }

   const now = nowSeconds();
   const updated = await c.env.DB.prepare(
      `UPDATE subscribers
       SET status = 'subscribed', confirmed_at = COALESCE(confirmed_at, ?)
       WHERE id = ? AND status = 'pending' AND deleted_at IS NULL`,
   )
      .bind(now, payload.s)
      .run();

   if ((updated.meta.changes ?? 0) > 0) {
      try {
         await enrollSubscriberCreated(c.env, payload.s, now);
      } catch {
         // Confirmation succeeded; a later tag write can enrol the automation.
      }
      const tags = await loadSubscriberTags(c.env.DB, payload.s);
      await enrollAddedTags(c.env, payload.s, tags, now);

      const subscriber = await c.env.DB.prepare(
         'SELECT email, first_name, last_name FROM subscribers WHERE id = ?',
      )
         .bind(payload.s)
         .first<{ email: string; first_name: string | null; last_name: string | null }>();
      if (subscriber !== null) {
         await emitWebhookEventSafe(c.env, 'subscriber.confirmed', {
            id: payload.s,
            email: subscriber.email,
            first_name: subscriber.first_name,
            last_name: subscriber.last_name,
         });
      }
   }

   return confirmationPage('done');
});

const WEB_UNSUBSCRIBE_TTL_SECONDS = 60 * 60 * 24 * 365;

/**
 * The web version of a sent campaign. `/p/:id` is the anonymous, shareable
 * version. A `?t=` token from the email binds it to one recipient, so the page
 * shows that reader's merge tags and a working unsubscribe link. The token is
 * signed and tied to one campaign; an invalid token falls back to anonymous
 * rather than leaking or erroring.
 */
publicRoutes.get('/p/:id', async (c) => {
   const campaign = await c.env.DB.prepare('SELECT * FROM campaigns WHERE id = ?')
      .bind(c.req.param('id'))
      .first<CampaignRow>();

   if (campaign === null || campaign.status !== 'sent') {
      return htmlResponse(
         '<!DOCTYPE html><title>Not found</title><p>This email is not available.',
         404,
      );
   }

   const snapshot =
      campaign.ir_snapshot ??
      (
         await c.env.DB.prepare('SELECT ir_json FROM templates WHERE id = ?')
            .bind(campaign.template_id)
            .first<{ ir_json: string }>()
      )?.ir_json ??
      null;

   if (snapshot === null) {
      return htmlResponse(
         '<!DOCTYPE html><title>Not found</title><p>This email is not available.',
         404,
      );
   }

   const origin = appOrigin(c);
   const token = c.req.query('t');
   const payload =
      token === undefined
         ? null
         : await verifyToken<{ m?: string; s?: string; c?: string }>(token, {
              secret: c.env.TOKEN_SECRET,
              purpose: 'web',
           });

   const subscriber =
      payload?.c === campaign.id && typeof payload.s === 'string'
         ? await c.env.DB.prepare(
              `SELECT id, email, first_name, last_name, status, deleted_at
               FROM subscribers WHERE id = ?`,
           )
              .bind(payload.s)
              .first<{
                 id: string;
                 email: string;
                 first_name: string | null;
                 last_name: string | null;
                 status: string;
                 deleted_at: number | null;
              }>()
         : null;

   const personalised = subscriber !== null && subscriber.deleted_at === null;
   const unsubscribeUrl = personalised
      ? `${origin}/u/${await signToken(
           { s: subscriber.id, c: campaign.id },
           {
              secret: c.env.TOKEN_SECRET,
              purpose: 'unsubscribe',
              ttlSeconds: WEB_UNSUBSCRIBE_TTL_SECONDS,
           },
        )}`
      : '';

   const document = parseDocument(JSON.parse(snapshot));
   const merged = applyMergeTags(document, {
      subscriber:
         personalised && subscriber !== null
            ? {
                 id: subscriber.id,
                 email: subscriber.email,
                 first_name: subscriber.first_name,
                 last_name: subscriber.last_name,
                 tags: await loadSubscriberTags(c.env.DB, subscriber.id),
                 meta: await loadSubscriberMetadata(c.env.DB, subscriber.id),
              }
            : {
                 id: '',
                 email: '',
                 first_name: null,
                 last_name: null,
                 tags: [],
                 meta: {},
              },
      campaign: {
         id: campaign.id,
         subject: campaign.subject,
         utm_campaign: campaign.utm_campaign,
         meta: parseMetadataJson(campaign.metadata_snapshot ?? campaign.metadata_json),
      },
      data: parsePayloadJson(campaign.data_snapshot ?? campaign.data_json),
      links: {
         unsubscribe: unsubscribeUrl,
         web:
            personalised && token !== undefined
               ? `${origin}/p/${campaign.id}?t=${token}`
               : `${origin}/p/${campaign.id}`,
      },
   });
   const rendered = renderEmail(merged, unsubscribeUrl.length === 0 ? {} : { unsubscribeUrl });

   return new Response(rendered.html, {
      status: 200,
      headers: {
         'content-type': 'text/html; charset=utf-8',
         // The framing policy sets no-store on every HTML response, so a
         // workspace allowlist change is never stranded in a cache.
         'cache-control': 'no-store',
         'x-content-type-options': 'nosniff',
      },
   });
});
