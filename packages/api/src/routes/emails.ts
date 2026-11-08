import { Hono } from 'hono';
import { z } from 'zod';
import { createId } from '@postwren/worker-kit/ids';
import { ok } from '@postwren/worker-kit/envelope';
import { AppError, ValidationError } from '@postwren/worker-kit/errors';
import type { AppEnv } from '../env';
import { createCloudflareAdapter, errorCodeOf } from '../adapters/email';
import { consumeRateLimit } from '../lib/rate-limit';
import { assertSenderAllowed, senderEmailFrom } from '../lib/senders';
import { readJson } from '../lib/validation';

const MAX_BODY_CHARS = 200_000;

const emailInput = z
   .object({
      to: z.string().trim().email(),
      from: z.string().trim().email().optional(),
      subject: z.string().trim().min(1).max(200),
      html: z.string().max(MAX_BODY_CHARS).optional(),
      text: z.string().max(MAX_BODY_CHARS).optional(),
      replyTo: z.string().trim().email().optional(),
   })
   .strict()
   .refine(
      (value) => (value.html ?? '').trim().length > 0 || (value.text ?? '').trim().length > 0,
      {
         message: 'Provide html or text content',
      },
   );

function escapeHtml(value: string): string {
   return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
}

function htmlToText(html: string): string {
   return html
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|tr|h[1-6]|li)>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
}

function textToHtml(text: string): string {
   return `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.6;color:#14293a;white-space:pre-wrap">${escapeHtml(text)}</div>`;
}

/**
 * Transactional sending for API clients. Campaigns are still scheduled from the
 * admin app; this endpoint sends a single message to one recipient without
 * creating campaign or recipient rows.
 */
export const emailRoutes = new Hono<AppEnv>();

emailRoutes.post('/', async (c) => {
   const body = emailInput.parse(await readJson(c));

   const credential = c.get('credentialId') ?? c.get('userId') ?? 'session';
   await consumeRateLimit(c.env.DB, `emails:${credential}`, {
      windowSeconds: 60,
      max: 60,
   });

   const fromEmail = (body.from ?? senderEmailFrom(c.env.EMAIL_FROM)).toLowerCase();
   if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fromEmail)) {
      throw new ValidationError('Set EMAIL_FROM or pass a valid from address');
   }
   await assertSenderAllowed(c.env.DB, fromEmail, c.env.EMAIL_FROM);

   const recipient = body.to.toLowerCase();
   const subscriber = await c.env.DB.prepare(
      'SELECT status, deleted_at FROM subscribers WHERE email = ?',
   )
      .bind(recipient)
      .first<{ status: string; deleted_at: number | null }>();

   if (
      subscriber !== null &&
      (subscriber.deleted_at !== null ||
         subscriber.status === 'bounced' ||
         subscriber.status === 'complained' ||
         subscriber.status === 'deleted')
   ) {
      throw new ValidationError('That recipient is suppressed and cannot be emailed');
   }

   const senderName =
      (
         await c.env.DB.prepare('SELECT name FROM sender_addresses WHERE email = ? LIMIT 1')
            .bind(fromEmail)
            .first<{ name: string }>()
      )?.name ?? '';

   const html = body.html ?? textToHtml(body.text ?? '');
   const text = body.text ?? htmlToText(html);

   const adapter = createCloudflareAdapter(c.env);
   try {
      const result = await adapter.send({
         from: { name: senderName, email: fromEmail },
         ...(body.replyTo === undefined ? {} : { replyTo: body.replyTo }),
         to: recipient,
         subject: body.subject,
         html,
         text,
      });

      return ok(
         {
            id: createId('eml'),
            to: recipient,
            from: fromEmail,
            subject: body.subject,
            status: 'sent',
            providerMessageId: result.providerMessageId,
         },
         { status: 201, requestId: c.get('requestId') },
      );
   } catch (error) {
      const code = errorCodeOf(error);
      throw new AppError(
         502,
         'email_send_failed',
         `Could not send the email${code === null ? '' : ` (${code})`}`,
      );
   }
});
