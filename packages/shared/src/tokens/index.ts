export type TokenPurpose = 'click' | 'open' | 'unsubscribe';

export type SignOptions = {
   secret: string;
   purpose: TokenPurpose;
   ttlSeconds: number;
   now?: number;
};

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

const LOOKUP: Record<string, number> = {};
for (let i = 0; i < ALPHABET.length; i += 1) {
   LOOKUP[ALPHABET.charAt(i)] = i;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

function encodeBase64Url(bytes: Uint8Array): string {
   let out = '';
   for (let i = 0; i < bytes.length; i += 3) {
      const b0 = bytes[i] ?? 0;
      const b1 = bytes[i + 1] ?? 0;
      const b2 = bytes[i + 2] ?? 0;
      const triple = (b0 << 16) | (b1 << 8) | b2;

      out += ALPHABET.charAt((triple >> 18) & 63);
      out += ALPHABET.charAt((triple >> 12) & 63);
      if (i + 1 < bytes.length) out += ALPHABET.charAt((triple >> 6) & 63);
      if (i + 2 < bytes.length) out += ALPHABET.charAt(triple & 63);
   }
   return out;
}

function decodeBase64Url(value: string): Uint8Array | null {
   if (value.length % 4 === 1) return null;

   const bytes: number[] = [];
   let buffer = 0;
   let bits = 0;

   for (const char of value) {
      const index = LOOKUP[char];
      if (index === undefined) return null;

      buffer = (buffer << 6) | index;
      bits += 6;

      if (bits >= 8) {
         bits -= 8;
         bytes.push((buffer >> bits) & 0xff);
         buffer &= (1 << bits) - 1;
      }
   }

   return new Uint8Array(bytes);
}

async function hmac(message: string, secret: string): Promise<ArrayBuffer> {
   const key = await globalThis.crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
   );
   return globalThis.crypto.subtle.sign('HMAC', key, encoder.encode(message));
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
   let diff = a.length ^ b.length;
   const length = Math.max(a.length, b.length);
   for (let i = 0; i < length; i += 1) {
      diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
   }
   return diff === 0;
}

function currentSeconds(): number {
   return Math.floor(Date.now() / 1000);
}

export async function signToken(
   payload: Record<string, unknown>,
   opts: SignOptions,
): Promise<string> {
   const now = opts.now ?? currentSeconds();
   const body = { ...payload, p: opts.purpose, exp: now + opts.ttlSeconds };
   const json = JSON.stringify(body);
   if (json === undefined) {
      throw new Error('Token payload is not serialisable');
   }

   const encoded = encodeBase64Url(encoder.encode(json));
   const signature = await hmac(encoded, opts.secret);
   return `${encoded}.${encodeBase64Url(new Uint8Array(signature))}`;
}

export async function verifyToken<T extends Record<string, unknown>>(
   token: string,
   opts: { secret: string; purpose: TokenPurpose; now?: number },
): Promise<T | null> {
   try {
      const separator = token.indexOf('.');
      if (
         separator <= 0 ||
         separator !== token.lastIndexOf('.') ||
         separator === token.length - 1
      ) {
         return null;
      }

      const encodedPayload = token.slice(0, separator);
      const signature = decodeBase64Url(token.slice(separator + 1));
      if (signature === null) return null;

      const expected = new Uint8Array(await hmac(encodedPayload, opts.secret));
      if (!constantTimeEqual(expected, signature)) return null;

      const payloadBytes = decodeBase64Url(encodedPayload);
      if (payloadBytes === null) return null;

      const parsed: unknown = JSON.parse(decoder.decode(payloadBytes));
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;

      const record = parsed as Record<string, unknown>;
      if (record.p !== opts.purpose) return null;

      const exp = record.exp;
      if (typeof exp !== 'number' || !Number.isFinite(exp)) return null;

      const now = opts.now ?? currentSeconds();
      if (exp <= now) return null;

      return record as T;
   } catch {
      return null;
   }
}
