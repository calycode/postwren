import { createId, randomToken, sha256Hex } from '@mailer/worker-kit/ids';

export const API_KEY_PREFIX = 'mlr_';

const KEY_PATTERN = /^mlr_([a-z0-9]{6,32})_([A-Za-z0-9_-]{20,})$/;

export type ParsedApiKey = { prefix: string; secret: string };

export function generateApiKey(): { raw: string; prefix: string } {
   const prefix = createId('', 6);
   const secret = randomToken(32);
   return { raw: `${API_KEY_PREFIX}${prefix}_${secret}`, prefix };
}

export function parseApiKey(raw: string): ParsedApiKey | null {
   const match = KEY_PATTERN.exec(raw);
   if (match === null) return null;
   const prefix = match[1];
   const secret = match[2];
   if (prefix === undefined || secret === undefined) return null;
   return { prefix, secret };
}

export function apiKeyHash(raw: string): Promise<string> {
   return sha256Hex(raw);
}
