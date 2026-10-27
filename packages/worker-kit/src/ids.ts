const CROCKFORD = '0123456789abcdefghjkmnpqrstvwxyz';
const BASE64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const encoder = new TextEncoder();

function randomBytes(bytes: number): Uint8Array {
   return globalThis.crypto.getRandomValues(new Uint8Array(bytes));
}

export function createId(prefix: string, bytes = 16): string {
   let output = prefix;
   let buffer = 0;
   let bits = 0;

   for (const byte of randomBytes(bytes)) {
      buffer = (buffer << 8) | byte;
      bits += 8;

      while (bits >= 5) {
         bits -= 5;
         output += CROCKFORD.charAt((buffer >> bits) & 31);
         buffer &= (1 << bits) - 1;
      }
   }

   if (bits > 0) {
      output += CROCKFORD.charAt((buffer << (5 - bits)) & 31);
   }

   return output;
}

function encodeBase64Url(bytes: Uint8Array): string {
   let output = '';

   for (let i = 0; i < bytes.length; i += 3) {
      const b0 = bytes[i] ?? 0;
      const b1 = bytes[i + 1] ?? 0;
      const b2 = bytes[i + 2] ?? 0;
      const triple = (b0 << 16) | (b1 << 8) | b2;

      output += BASE64URL.charAt((triple >> 18) & 63);
      output += BASE64URL.charAt((triple >> 12) & 63);
      if (i + 1 < bytes.length) output += BASE64URL.charAt((triple >> 6) & 63);
      if (i + 2 < bytes.length) output += BASE64URL.charAt(triple & 63);
   }

   return output;
}

export function randomToken(bytes = 32): string {
   return encodeBase64Url(randomBytes(bytes));
}

export async function sha256Hex(input: string): Promise<string> {
   const digest = await globalThis.crypto.subtle.digest('SHA-256', encoder.encode(input));
   let hex = '';

   for (const byte of new Uint8Array(digest)) {
      hex += byte.toString(16).padStart(2, '0');
   }

   return hex;
}
