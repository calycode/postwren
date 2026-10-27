export type ApiMeta = {
   requestId?: string;
   nextCursor?: string | null;
   hasMore?: boolean;
};

type ErrorBody = { code: string; message: string; details?: unknown };

const CONTENT_TYPE = 'application/json; charset=utf-8';

function normaliseStatus(status: number): number {
   return Number.isInteger(status) && status >= 200 && status <= 599 ? status : 500;
}

function serialise(value: unknown): string | null {
   try {
      const json = JSON.stringify(value);
      return json === undefined ? null : json;
   } catch {
      return null;
   }
}

function respond(body: unknown, status: number): Response {
   const json = serialise(body);

   if (json === null) {
      return new Response(
         JSON.stringify({
            data: null,
            error: { code: 'internal_error', message: 'Response serialisation failed' },
         }),
         { status: 500, headers: { 'content-type': CONTENT_TYPE } },
      );
   }

   const responseStatus = normaliseStatus(status);
   if (responseStatus === 204 || responseStatus === 205 || responseStatus === 304) {
      return new Response(null, {
         status: responseStatus,
         headers: { 'content-type': CONTENT_TYPE },
      });
   }

   return new Response(json, {
      status: responseStatus,
      headers: { 'content-type': CONTENT_TYPE },
   });
}

export function ok<T>(data: T, init?: { status?: number; requestId?: string }): Response {
   const body: { data: T; error: null; meta?: ApiMeta } = { data, error: null };
   if (init?.requestId !== undefined) {
      body.meta = { requestId: init.requestId };
   }
   return respond(body, init?.status ?? 200);
}

export function paginated<T>(
   data: T[],
   meta: { nextCursor: string | null; hasMore: boolean; requestId?: string },
): Response {
   const bodyMeta: ApiMeta = { nextCursor: meta.nextCursor, hasMore: meta.hasMore };
   if (meta.requestId !== undefined) {
      bodyMeta.requestId = meta.requestId;
   }
   return respond({ data, error: null, meta: bodyMeta }, 200);
}

export function fail(
   status: number,
   code: string,
   message: string,
   details?: unknown,
   requestId?: string,
): Response {
   const error: ErrorBody = { code, message };
   if (details !== undefined) {
      error.details = details;
   }

   const body: { data: null; error: ErrorBody; meta?: ApiMeta } = { data: null, error };
   if (requestId !== undefined) {
      body.meta = { requestId };
   }

   return respond(body, status);
}
