import { signToken } from '@postwren/shared/tokens';
import type { Document } from '@postwren/email/ir';
import { renderEmail } from '@postwren/email/render';
import { applyMergeTags } from '@postwren/email/template';
import type { MergeContext } from '@postwren/email/template';
import type { MetadataRecord } from '@postwren/shared/metadata';
import type { Env } from '../env';
import { errorCodeOf } from '../adapters/email';
import type { EmailSendAdapter, SendFailureClass } from '../adapters/email';
import { linkKey, signClickLinks } from './email-links';
import type { MailSubscriberRow } from './rows';

const OPEN_TTL_SECONDS = 60 * 60 * 24;
const UNSUBSCRIBE_TTL_SECONDS = 60 * 60 * 24 * 30;
const WEB_TTL_SECONDS = 60 * 60 * 24 * 365;

export type DeliveryRequest = {
   env: Env;
   adapter: EmailSendAdapter;
   origin: string;
   messageId: string;
   document: Document;
   subscriber: MailSubscriberRow;
   tags: string[];
   metadata: MetadataRecord;
   from: { name: string; email: string };
   replyTo: string | null;
   subject: string;
   campaign: {
      id: string;
      utmCampaign: string;
      metadata: MetadataRecord;
   };
   automation?: {
      id: string;
      metadata: MetadataRecord;
   };
   /**
    * Runs after a successful render and before the provider call, so a caller
    * can persist its pending delivery without the module knowing its schema.
    */
   beforeSend?: () => Promise<void>;
};

export type DeliveryOutcome =
   | { ok: true; providerMessageId: string | null; unsubscribeUrl: string }
   | {
        ok: false;
        stage: 'render';
        code: string | null;
        message: string;
     }
   | {
        ok: false;
        stage: 'send';
        code: string | null;
        failure: SendFailureClass;
        message: string;
     };

function mailDomain(env: Env): string {
   const at = env.EMAIL_FROM.lastIndexOf('@');
   return at === -1 ? 'example.com' : env.EMAIL_FROM.slice(at + 1);
}

function messageOf(error: unknown, fallback: string): string {
   return error instanceof Error ? error.message : fallback;
}

function mergeContextOf(
   request: DeliveryRequest,
   unsubscribeUrl: string,
   webUrl: string,
): MergeContext {
   const { subscriber, subject, campaign, automation } = request;

   return {
      subscriber: {
         id: subscriber.id,
         email: subscriber.email,
         first_name: subscriber.first_name,
         last_name: subscriber.last_name,
         tags: request.tags,
         meta: request.metadata,
      },
      campaign: {
         id: campaign.id,
         subject,
         utm_campaign: campaign.utmCampaign,
         meta: campaign.metadata,
      },
      ...(automation === undefined
         ? {}
         : { automation: { id: automation.id, meta: automation.metadata } }),
      links: {
         unsubscribe: unsubscribeUrl,
         web: webUrl,
      },
   };
}

export async function deliverEmail(request: DeliveryRequest): Promise<DeliveryOutcome> {
   const { env, adapter, origin, messageId, subscriber, campaign } = request;

   const unsubscribeToken = await signToken(
      { s: subscriber.id, c: campaign.id },
      {
         secret: env.TOKEN_SECRET,
         purpose: 'unsubscribe',
         ttlSeconds: UNSUBSCRIBE_TTL_SECONDS,
      },
   );
   const unsubscribeUrl = `${origin}/u/${unsubscribeToken}`;

   // A web view opened from the email should show that reader's own merge tags.
   // The token is bound to the message, subscriber and campaign; `/p/:id` still
   // works without it as the anonymous, shareable version.
   const webToken = await signToken(
      { m: messageId, s: subscriber.id, c: campaign.id },
      { secret: env.TOKEN_SECRET, purpose: 'web', ttlSeconds: WEB_TTL_SECONDS },
   );
   const webUrl = `${origin}/p/${campaign.id}?t=${webToken}`;

   let html: string;
   let text: string;

   try {
      const merged = applyMergeTags(
         request.document,
         mergeContextOf(request, unsubscribeUrl, webUrl),
      );
      const links = await signClickLinks(env, origin, merged, messageId);
      const rendered = renderEmail(merged, {
         unsubscribeUrl,
         resolveLink: (href, linkId) => {
            // Neither the web view nor unsubscribe should depend on a 24-hour
            // click-tracking token. Their own tokens live much longer.
            if (href === unsubscribeUrl || href === webUrl) return href;
            return links.get(linkKey(linkId, href)) ?? href;
         },
      });

      const openToken = await signToken(
         { m: messageId },
         {
            secret: env.TOKEN_SECRET,
            purpose: 'open',
            ttlSeconds: OPEN_TTL_SECONDS,
         },
      );
      const pixel = `<img src="${origin}/t/o/${openToken}.png" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;outline:none;text-decoration:none;">`;

      html = rendered.html.replace('</body>', `${pixel}</body>`);
      if (!html.includes(pixel)) html = `${html}${pixel}`;
      text = rendered.text;
   } catch (error) {
      return {
         ok: false,
         stage: 'render',
         code: errorCodeOf(error),
         message: messageOf(error, 'Render failed'),
      };
   }

   if (request.beforeSend !== undefined) await request.beforeSend();

   const headers: Record<string, string> = {
      'List-Unsubscribe': `<${unsubscribeUrl}>, <mailto:unsubscribe@${mailDomain(env)}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
   };

   try {
      const result = await adapter.send({
         from: request.from,
         ...(request.replyTo === null ? {} : { replyTo: request.replyTo }),
         to: subscriber.email,
         subject: request.subject,
         html,
         text,
         headers,
      });

      return { ok: true, providerMessageId: result.providerMessageId, unsubscribeUrl };
   } catch (error) {
      return {
         ok: false,
         stage: 'send',
         code: errorCodeOf(error),
         failure: adapter.classifyError(error),
         message: messageOf(error, 'Send failed'),
      };
   }
}
