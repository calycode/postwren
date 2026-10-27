export type ApiMeta = {
   requestId?: string;
   nextCursor: string | null;
   hasMore: boolean;
};

export type ApiErrorShape = {
   code: string;
   message: string;
   details?: unknown;
};

export type EnvelopeResult<T> =
   { ok: true; data: T; meta: ApiMeta } | { ok: false; status: number; error: ApiErrorShape };

function isRecord(value: unknown): value is Record<string, unknown> {
   return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readMeta(value: unknown): ApiMeta {
   if (!isRecord(value)) return { nextCursor: null, hasMore: false };

   return {
      nextCursor: typeof value.nextCursor === 'string' ? value.nextCursor : null,
      hasMore: value.hasMore === true,
      ...(typeof value.requestId === 'string' ? { requestId: value.requestId } : {}),
   };
}

function failure(
   status: number,
   code: string,
   message: string,
   details?: unknown,
): EnvelopeResult<never> {
   return {
      ok: false,
      status,
      error: { code, message, ...(details === undefined ? {} : { details }) },
   };
}

export function parseEnvelope<T>(payload: unknown, status: number): EnvelopeResult<T> {
   if (!isRecord(payload)) {
      return failure(status, 'invalid_response', 'Unexpected response from the server');
   }

   if (payload.error === null) {
      if (!Object.prototype.hasOwnProperty.call(payload, 'data')) {
         return failure(status, 'invalid_response', 'Response envelope is missing data');
      }

      return { ok: true, data: payload.data as T, meta: readMeta(payload.meta) };
   }

   if (isRecord(payload.error)) {
      const code = typeof payload.error.code === 'string' ? payload.error.code : 'unknown_error';
      const message =
         typeof payload.error.message === 'string' ? payload.error.message : 'The request failed';
      return failure(status, code, message, payload.error.details);
   }

   return failure(status, 'invalid_response', 'Unexpected error envelope from the server');
}
