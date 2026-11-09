export const WEBHOOK_EVENTS = [
   'subscriber.created',
   'subscriber.confirmed',
   'subscriber.updated',
   'subscriber.unsubscribed',
   'subscriber.bounced',
   'subscriber.complained',
   'subscriber.deleted',
   'campaign.scheduled',
   'campaign.sent',
   'webhook.test',
] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export const WEBHOOK_DELIVERY_STATUSES = ['pending', 'succeeded', 'failed'] as const;

export type WebhookDeliveryStatus = (typeof WEBHOOK_DELIVERY_STATUSES)[number];

const encoder = new TextEncoder();

function toHex(bytes: Uint8Array): string {
   let out = '';
   for (const byte of bytes) out += byte.toString(16).padStart(2, '0');
   return out;
}

async function hmacHex(secret: string, message: string): Promise<string> {
   const key = await globalThis.crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
   );
   const signature = await globalThis.crypto.subtle.sign('HMAC', key, encoder.encode(message));
   return toHex(new Uint8Array(signature));
}

/**
 * Stripe-style header: `t=<unix>,v1=<hex>`, signed over `<t>.<raw body>`.
 * Sending the timestamp lets a receiver reject a replayed delivery.
 */
export async function webhookSignature(
   secret: string,
   timestamp: number,
   body: string,
): Promise<string> {
   return `t=${timestamp},v1=${await hmacHex(secret, `${timestamp}.${body}`)}`;
}

export function isWebhookEvent(value: string): value is WebhookEvent {
   return (WEBHOOK_EVENTS as readonly string[]).includes(value);
}
