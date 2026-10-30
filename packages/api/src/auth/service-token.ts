import { timingSafeEqual } from '@mailer/worker-kit/http';
import { isScope } from './scopes';
import type { Scope } from './scopes';
import { nowSeconds } from '../lib/time';

export const SERVICE_TOKEN_HEADER = 'x-mailer-service-token';
export const SERVICE_TOKEN_TTL_SECONDS = 60;

type ServiceTokenPayload = {
   v: 1;
   sub: 'mcp';
   scopes: Scope[];
   exp: number;
};

const encoder = new TextEncoder();

function encodeBase64Url(value: string): string {
   return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodeBase64Url(value: string): string {
   const padded = value.replace(/-/g, '+').replace(/_/g, '/');
   return atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
}

async function sign(secret: string, payload: string): Promise<string> {
   const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
   );
   const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
   let binary = '';
   for (const byte of new Uint8Array(signature)) {
      binary += String.fromCharCode(byte);
   }
   return encodeBase64Url(binary);
}

/**
 * The MCP layer never reuses the caller's token against the REST routes. It
 * mints a short-lived, request-local credential carrying exactly the scopes the
 * caller already proved, so the one scope gate still applies.
 */
export async function signServiceToken(
   secret: string,
   scopes: readonly Scope[],
   ttlSeconds = SERVICE_TOKEN_TTL_SECONDS,
   now = nowSeconds(),
): Promise<string> {
   const payload: ServiceTokenPayload = {
      v: 1,
      sub: 'mcp',
      scopes: [...scopes],
      exp: now + ttlSeconds,
   };
   const body = encodeBase64Url(JSON.stringify(payload));
   return `${body}.${await sign(secret, body)}`;
}

export async function verifyServiceToken(
   secret: string,
   token: string,
   now = nowSeconds(),
): Promise<Scope[] | null> {
   if (token.length === 0 || token.length > 4096) {
      return null;
   }

   const separator = token.lastIndexOf('.');
   if (separator <= 0 || separator === token.length - 1) {
      return null;
   }

   const body = token.slice(0, separator);
   const provided = token.slice(separator + 1);
   const expected = await sign(secret, body);

   if (!timingSafeEqual(provided, expected)) {
      return null;
   }

   let payload: unknown;
   try {
      payload = JSON.parse(decodeBase64Url(body));
   } catch {
      return null;
   }

   if (payload === null || typeof payload !== 'object') {
      return null;
   }

   const candidate = payload as Partial<ServiceTokenPayload>;
   if (
      candidate.v !== 1 ||
      candidate.sub !== 'mcp' ||
      typeof candidate.exp !== 'number' ||
      !Number.isFinite(candidate.exp) ||
      candidate.exp <= now ||
      !Array.isArray(candidate.scopes)
   ) {
      return null;
   }

   const scopes = candidate.scopes.filter(
      (value): value is Scope => typeof value === 'string' && isScope(value),
   );
   return scopes.length === candidate.scopes.length ? scopes : null;
}
