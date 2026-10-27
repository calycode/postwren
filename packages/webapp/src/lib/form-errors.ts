import { ApiError } from './api/client';

export type FieldErrors = Record<string, string>;

function isRecord(value: unknown): value is Record<string, unknown> {
   return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function messageFrom(value: unknown): string | null {
   if (typeof value === 'string') return value;
   if (Array.isArray(value)) {
      const messages = value.filter((item): item is string => typeof item === 'string');
      return messages.length > 0 ? messages.join(', ') : null;
   }
   return null;
}

export function fieldErrorsFrom(details: unknown): FieldErrors {
   const errors: FieldErrors = {};
   if (!isRecord(details)) return errors;

   const source = isRecord(details.fields) ? details.fields : details;

   for (const [key, value] of Object.entries(source)) {
      const message = messageFrom(value);
      if (message) errors[key] = message;
   }

   if (Array.isArray(details.issues)) {
      for (const issue of details.issues) {
         if (!isRecord(issue)) continue;
         const message = messageFrom(issue.message);
         const path = Array.isArray(issue.path)
            ? issue.path.map((part) => String(part)).join('.')
            : typeof issue.path === 'string'
              ? issue.path
              : '';
         if (message && path) errors[path] = message;
      }
   }

   return errors;
}

export function errorMessage(cause: unknown, fallback = 'Something went wrong'): string {
   if (cause instanceof ApiError) return cause.message;
   if (cause instanceof Error && cause.message.length > 0) return cause.message;
   return fallback;
}

export function isEmail(value: string): boolean {
   return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}
