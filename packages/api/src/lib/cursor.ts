import { AppError } from '@mailer/worker-kit/errors';

function encodeBase64Url(value: string): string {
   return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decodeBase64Url(value: string): string {
   const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
   const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
   return atob(padded);
}

function invalidCursor(): never {
   throw new AppError(422, 'validation_error', 'Invalid cursor');
}

export function encodeCursor(value: string): string {
   return encodeBase64Url(value);
}

export function decodeCursor(value: string): string {
   try {
      return decodeBase64Url(value);
   } catch {
      invalidCursor();
   }
}

export function encodeKeysetCursor(createdAt: number, id: string): string {
   return encodeBase64Url(`${createdAt}:${id}`);
}

export function decodeKeysetCursor(value: string): { createdAt: number; id: string } {
   const decoded = decodeCursor(value);
   const separator = decoded.indexOf(':');
   if (separator === -1) invalidCursor();

   const createdAt = Number(decoded.slice(0, separator));
   const id = decoded.slice(separator + 1);

   if (!Number.isInteger(createdAt) || id.length === 0) invalidCursor();

   return { createdAt, id };
}
