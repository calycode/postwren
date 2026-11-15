import type { EmailSendingEvent } from '../env';
import type { ProviderId } from '@postwren/shared/providers';

export type EmailEventKind = 'delivered' | 'bounced' | 'complained' | 'failed' | 'other';

/**
 * One shape for every provider. The suppression policy in
 * `processEmailEvent` branches on `kind` only; `rawType` keeps the provider's
 * own vocabulary in `email_events` for audit.
 */
export type NormalizedEmailEvent = {
   provider: ProviderId;
   eventId: string | null;
   kind: EmailEventKind;
   rawType: string;
   messageId: string;
   recipient: string;
   bounceType: 'hard' | 'soft' | null;
   reason: string | null;
   payload: unknown;
};

export type WebhookParseResult =
   | { ok: true; events: NormalizedEmailEvent[] }
   | { ok: false; status: 400 | 401 | 404; reason: string };

const CF_COMPLAINED = 'cf.email.sending.message.complained';
const CF_BOUNCED = 'cf.email.sending.message.bounced';
const CF_DELIVERED = 'cf.email.sending.message.delivered';

export function normalizeCloudflareEvent(event: EmailSendingEvent): NormalizedEmailEvent | null {
   const payload = event.payload;
   if (typeof payload.recipient !== 'string' || typeof payload.messageId !== 'string') {
      return null;
   }

   const bounced = event.type === CF_BOUNCED;
   const kind: EmailEventKind =
      event.type === CF_COMPLAINED
         ? 'complained'
         : bounced
           ? 'bounced'
           : event.type === CF_DELIVERED
             ? 'delivered'
             : 'other';

   return {
      provider: 'cloudflare',
      eventId: payload.eventId ?? null,
      kind,
      rawType: event.type,
      messageId: payload.messageId,
      recipient: payload.recipient.trim().toLowerCase(),
      bounceType: bounced ? (payload.bounce?.type === 'hard' ? 'hard' : 'soft') : null,
      reason: bounced
         ? (payload.bounce?.reason ?? null)
         : kind === 'complained'
           ? (payload.complaint?.type ?? null)
           : null,
      payload: event,
   };
}

const encoder = new TextEncoder();
const MAX_SKEW_SECONDS = 5 * 60;
const MAX_MAILGUN_SKEW_SECONDS = 24 * 60 * 60;

function constantTimeEqual(left: string, right: string): boolean {
   if (left.length !== right.length) return false;
   let difference = 0;
   for (let index = 0; index < left.length; index += 1) {
      difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
   }
   return difference === 0;
}

function decodeBase64(secret: string): Uint8Array | null {
   try {
      const binary = atob(secret);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) {
         bytes[index] = binary.charCodeAt(index);
      }
      return bytes;
   } catch {
      return null;
   }
}

function encodeBase64(bytes: Uint8Array): string {
   let binary = '';
   for (const byte of bytes) binary += String.fromCharCode(byte);
   return btoa(binary);
}

function encodeHex(bytes: Uint8Array): string {
   let output = '';
   for (const byte of bytes) output += byte.toString(16).padStart(2, '0');
   return output;
}

/**
 * Resend signs webhooks with the standard webhooks scheme: HMAC-SHA256 over
 * `${webhook-id}.${webhook-timestamp}.${rawBody}`, base64 in `webhook-signature`
 * as `v1,<signature>`. Verification is local; nothing is trusted before it.
 */
export async function verifyResendWebhook(input: {
   raw: string;
   id: string | null;
   timestamp: string | null;
   signature: string | null;
   secret: string;
   now?: number;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
   if (input.id === null || input.timestamp === null || input.signature === null) {
      return { ok: false, reason: 'missing_headers' };
   }

   const timestamp = Number(input.timestamp);
   if (!Number.isFinite(timestamp)) return { ok: false, reason: 'invalid_timestamp' };

   const now = input.now ?? Math.floor(Date.now() / 1000);
   if (Math.abs(now - timestamp) > MAX_SKEW_SECONDS) {
      return { ok: false, reason: 'stale_timestamp' };
   }

   const encoded = input.secret.trim().replace(/^whsec_/, '');
   const secret = decodeBase64(encoded);
   if (secret === null) return { ok: false, reason: 'invalid_secret' };

   const key = await crypto.subtle.importKey(
      'raw',
      secret,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
   );
   const digest = await crypto.subtle.sign(
      'HMAC',
      key,
      encoder.encode(`${input.id}.${input.timestamp}.${input.raw}`),
   );
   const expected = encodeBase64(new Uint8Array(digest));

   for (const candidate of input.signature.split(' ')) {
      const [version, value] = candidate.split(',');
      if (version === 'v1' && value !== undefined && constantTimeEqual(value, expected)) {
         return { ok: true };
      }
   }

   return { ok: false, reason: 'signature_mismatch' };
}

type ResendWebhookEvent = {
   type?: string;
   created_at?: string;
   data?: {
      email_id?: string;
      to?: string[] | string;
      subject?: string;
      bounce?: { type?: string; message?: string; subType?: string };
      failed?: { reason?: string };
   };
};

function firstRecipient(value: string[] | string | undefined): string | null {
   if (typeof value === 'string') return value.trim().toLowerCase() || null;
   if (Array.isArray(value)) {
      const first = value.find((entry) => typeof entry === 'string' && entry.trim().length > 0);
      return first === undefined ? null : first.trim().toLowerCase();
   }
   return null;
}

function resendKind(rawType: string): EmailEventKind {
   if (rawType === 'email.delivered') return 'delivered';
   if (rawType === 'email.bounced') return 'bounced';
   if (rawType === 'email.complained') return 'complained';
   if (rawType === 'email.failed' || rawType === 'email.suppressed') return 'failed';
   return 'other';
}

export function parseResendEvents(raw: string, webhookId: string | null): NormalizedEmailEvent[] {
   let parsed: unknown;
   try {
      parsed = JSON.parse(raw);
   } catch {
      return [];
   }

   const batch = Array.isArray(parsed) ? parsed : [parsed];
   const events: NormalizedEmailEvent[] = [];

   for (const [index, entry] of batch.entries()) {
      if (typeof entry !== 'object' || entry === null) continue;
      const event = entry as ResendWebhookEvent;
      const rawType = typeof event.type === 'string' ? event.type : '';
      const recipient = firstRecipient(event.data?.to);
      const messageId = event.data?.email_id;

      if (rawType.length === 0 || recipient === null || typeof messageId !== 'string') continue;

      const kind = resendKind(rawType);
      const fallbackId = `resend:${rawType}:${messageId}:${event.created_at ?? ''}`;

      events.push({
         provider: 'resend',
         eventId: webhookId === null ? fallbackId : `resend:${webhookId}:${index}`,
         kind,
         rawType,
         messageId,
         recipient,
         bounceType:
            kind === 'bounced'
               ? event.data?.bounce?.type?.toLowerCase() === 'permanent'
                  ? 'hard'
                  : 'soft'
               : null,
         reason:
            kind === 'bounced'
               ? (event.data?.bounce?.message ?? null)
               : kind === 'failed'
                 ? (event.data?.failed?.reason ?? null)
                 : null,
         payload: event,
      });
   }

   return events;
}

type PostmarkEvent = {
   ID?: number;
   RecordType?: string;
   MessageID?: string;
   Recipient?: string;
   Type?: string;
   Description?: string;
   Details?: string;
   BouncedAt?: string;
   ReceivedAt?: string;
};

const POSTMARK_HARD = new Set(['HardBounce', 'BadEmailAddress', 'ManuallyDeactivated', 'Blocked']);

export function parsePostmarkEvent(raw: string): NormalizedEmailEvent[] {
   let event: PostmarkEvent;
   try {
      event = JSON.parse(raw) as PostmarkEvent;
   } catch {
      return [];
   }

   if (typeof event.MessageID !== 'string' || typeof event.Recipient !== 'string') return [];
   if (typeof event.RecordType !== 'string') return [];

   const rawType = event.RecordType;
   const kind: EmailEventKind =
      rawType === 'Delivery'
         ? 'delivered'
         : rawType === 'Bounce'
           ? 'bounced'
           : rawType === 'SpamComplaint'
             ? 'complained'
             : 'other';

   const bounced = kind === 'bounced';

   return [
      {
         provider: 'postmark',
         eventId:
            event.ID === undefined
               ? `postmark:${event.MessageID}:${rawType}:${event.BouncedAt ?? event.ReceivedAt ?? ''}`
               : `postmark:${event.ID}`,
         kind,
         rawType,
         messageId: event.MessageID,
         recipient: event.Recipient.trim().toLowerCase(),
         bounceType: bounced
            ? event.Type !== undefined && POSTMARK_HARD.has(event.Type)
               ? 'hard'
               : 'soft'
            : null,
         reason: bounced ? (event.Details ?? event.Description ?? null) : null,
         payload: event,
      },
   ];
}

type SendGridEvent = {
   event?: string;
   sg_event_id?: string;
   sg_message_id?: string;
   email?: string;
   reason?: string;
   type?: string;
   timestamp?: number;
};

function sendGridKind(rawType: string): EmailEventKind {
   if (rawType === 'delivered') return 'delivered';
   if (rawType === 'bounce' || rawType === 'dropped' || rawType === 'deferred') return 'bounced';
   if (rawType === 'spamreport' || rawType === 'spam report') return 'complained';
   return 'other';
}

export function parseSendGridEvents(raw: string): NormalizedEmailEvent[] {
   let parsed: unknown;
   try {
      parsed = JSON.parse(raw);
   } catch {
      return [];
   }

   const batch = Array.isArray(parsed) ? parsed : [parsed];
   const events: NormalizedEmailEvent[] = [];

   for (const entry of batch) {
      if (typeof entry !== 'object' || entry === null) continue;
      const event = entry as SendGridEvent;
      const rawType = typeof event.event === 'string' ? event.event : '';

      // SendGrid appends routing detail after `.filter` to the X-Message-Id.
      const messageId = event.sg_message_id?.split('.filter')[0];
      if (rawType.length === 0 || typeof event.email !== 'string' || !messageId) continue;

      const kind = sendGridKind(rawType);
      const bounced = kind === 'bounced';

      events.push({
         provider: 'sendgrid',
         eventId:
            typeof event.sg_event_id === 'string'
               ? `sendgrid:${event.sg_event_id}`
               : `sendgrid:${rawType}:${messageId}:${event.timestamp ?? ''}`,
         kind,
         rawType,
         messageId,
         recipient: event.email.trim().toLowerCase(),
         bounceType: bounced
            ? rawType === 'deferred' || event.type === 'soft'
               ? 'soft'
               : 'hard'
            : null,
         reason: typeof event.reason === 'string' ? event.reason : null,
         payload: event,
      });
   }

   return events;
}

type MailgunPayload = {
   signature?: { timestamp?: string; token?: string; signature?: string };
   'event-data'?: {
      id?: string;
      event?: string;
      recipient?: string;
      severity?: string;
      reason?: string;
      message?: { headers?: { 'message-id'?: string } };
   };
};

export async function verifyMailgunSignature(input: {
   timestamp: string;
   token: string;
   signature: string;
   secret: string;
   now?: number;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
   const timestamp = Number(input.timestamp);
   if (!Number.isFinite(timestamp)) return { ok: false, reason: 'invalid_timestamp' };

   const now = input.now ?? Math.floor(Date.now() / 1000);
   if (Math.abs(now - timestamp) > MAX_MAILGUN_SKEW_SECONDS) {
      return { ok: false, reason: 'stale_timestamp' };
   }

   const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(input.secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
   );
   const digest = await crypto.subtle.sign(
      'HMAC',
      key,
      encoder.encode(`${input.timestamp}${input.token}`),
   );
   const expected = encodeHex(new Uint8Array(digest));

   return constantTimeEqual(expected, input.signature.toLowerCase())
      ? { ok: true }
      : { ok: false, reason: 'signature_mismatch' };
}

export function parseMailgunEvent(raw: string): NormalizedEmailEvent[] {
   let payload: MailgunPayload;
   try {
      payload = JSON.parse(raw) as MailgunPayload;
   } catch {
      return [];
   }

   const event = payload['event-data'];
   if (event === undefined) return [];

   const rawType = typeof event.event === 'string' ? event.event : '';
   const messageId = event.message?.headers?.['message-id'];
   const recipient = event.recipient;

   if (rawType.length === 0 || typeof messageId !== 'string' || typeof recipient !== 'string') {
      return [];
   }

   const kind: EmailEventKind =
      rawType === 'delivered'
         ? 'delivered'
         : rawType === 'failed'
           ? 'bounced'
           : rawType === 'complained'
             ? 'complained'
             : 'other';

   const bounced = kind === 'bounced';

   return [
      {
         provider: 'mailgun',
         eventId:
            typeof event.id === 'string'
               ? `mailgun:${event.id}`
               : `mailgun:${rawType}:${messageId}:${recipient}`,
         kind,
         rawType,
         messageId,
         recipient: recipient.trim().toLowerCase(),
         bounceType: bounced ? (event.severity === 'permanent' ? 'hard' : 'soft') : null,
         reason: typeof event.reason === 'string' ? event.reason : null,
         payload: event,
      },
   ];
}

/**
 * Verifies and normalises an inbound provider webhook. Signed providers are
 * checked locally. Postmark and SendGrid rely on the unguessable token in the
 * route path; their descriptor says so in the settings UI.
 */
export async function verifyAndParseWebhook(input: {
   provider: ProviderId;
   raw: string;
   headers: Headers;
   secret: string | null;
   now?: number;
}): Promise<WebhookParseResult> {
   switch (input.provider) {
      case 'resend': {
         if (input.secret === null) {
            return { ok: false, status: 404, reason: 'missing_secret' };
         }
         const verification = await verifyResendWebhook({
            raw: input.raw,
            id: input.headers.get('webhook-id'),
            timestamp: input.headers.get('webhook-timestamp'),
            signature: input.headers.get('webhook-signature'),
            secret: input.secret,
            ...(input.now === undefined ? {} : { now: input.now }),
         });
         if (!verification.ok) return { ok: false, status: 401, reason: verification.reason };
         return { ok: true, events: parseResendEvents(input.raw, input.headers.get('webhook-id')) };
      }

      case 'postmark':
         return { ok: true, events: parsePostmarkEvent(input.raw) };

      case 'sendgrid':
         return { ok: true, events: parseSendGridEvents(input.raw) };

      case 'mailgun': {
         if (input.secret === null) {
            return { ok: false, status: 404, reason: 'missing_secret' };
         }
         let payload: MailgunPayload;
         try {
            payload = JSON.parse(input.raw) as MailgunPayload;
         } catch {
            return { ok: false, status: 400, reason: 'invalid_json' };
         }
         const signature = payload.signature;
         if (
            signature?.timestamp === undefined ||
            signature.token === undefined ||
            signature.signature === undefined
         ) {
            return { ok: false, status: 401, reason: 'missing_signature' };
         }
         const verification = await verifyMailgunSignature({
            timestamp: signature.timestamp,
            token: signature.token,
            signature: signature.signature,
            secret: input.secret,
            ...(input.now === undefined ? {} : { now: input.now }),
         });
         if (!verification.ok) return { ok: false, status: 401, reason: verification.reason };
         return { ok: true, events: parseMailgunEvent(input.raw) };
      }

      default:
         return { ok: false, status: 404, reason: 'not_supported' };
   }
}
