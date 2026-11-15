import { AppError } from '@postwren/worker-kit/errors';
import type { Env } from '../env';

const VERSION = 'v1';
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64(bytes: Uint8Array): string {
   let binary = '';
   for (const byte of bytes) binary += String.fromCharCode(byte);
   return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
   const binary = atob(value);
   const bytes = new Uint8Array(binary.length);
   for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
   }
   return bytes;
}

/**
 * A dedicated key wins when the operator sets one. Otherwise the AES key is
 * derived from TOKEN_SECRET with HKDF, so a fresh install works without another
 * required secret. Rotating TOKEN_SECRET makes stored provider keys
 * undecryptable, which is the same blast radius as the tokens it already signs.
 */
async function encryptionKey(env: Env): Promise<CryptoKey> {
   const configured = env.SETTINGS_ENCRYPTION_KEY?.trim() ?? '';

   if (configured.length > 0) {
      const raw = fromBase64(configured);
      if (raw.length !== 32) {
         throw new AppError(
            500,
            'settings_key_invalid',
            'SETTINGS_ENCRYPTION_KEY must be base64 for exactly 32 bytes',
         );
      }
      return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
   }

   const material = await crypto.subtle.importKey(
      'raw',
      encoder.encode(env.TOKEN_SECRET),
      'HKDF',
      false,
      ['deriveKey'],
   );

   return crypto.subtle.deriveKey(
      {
         name: 'HKDF',
         hash: 'SHA-256',
         salt: encoder.encode('postwren.email-providers'),
         info: encoder.encode('aes-256-gcm'),
      },
      material,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
   );
}

export async function encryptSecret(env: Env, plaintext: string): Promise<string> {
   const key = await encryptionKey(env);
   const iv = crypto.getRandomValues(new Uint8Array(12));
   const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      encoder.encode(plaintext),
   );

   return `${VERSION}.${toBase64(iv)}.${toBase64(new Uint8Array(ciphertext))}`;
}

export async function decryptSecret(env: Env, value: string): Promise<string> {
   const parts = value.split('.');
   if (parts.length !== 3 || parts[0] !== VERSION) {
      throw new AppError(500, 'settings_secret_invalid', 'Stored provider secret is malformed');
   }

   const key = await encryptionKey(env);
   const iv = fromBase64(parts[1] ?? '');
   const ciphertext = fromBase64(parts[2] ?? '');

   try {
      const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
      return decoder.decode(plaintext);
   } catch {
      throw new AppError(
         500,
         'settings_secret_undecryptable',
         'Stored provider secret cannot be decrypted. Check SETTINGS_ENCRYPTION_KEY or TOKEN_SECRET.',
      );
   }
}

export function encryptionSource(env: Env): 'dedicated' | 'derived' {
   return (env.SETTINGS_ENCRYPTION_KEY?.trim() ?? '').length > 0 ? 'dedicated' : 'derived';
}
