import { parseEnvelope } from './envelope';
import type { ApiErrorShape, ApiMeta } from './envelope';

const configuredBase = import.meta.env.VITE_API_BASE_URL as string | undefined;

export const API_BASE_URL = (configuredBase ?? '').replace(/\/$/, '');

export type ApiBody = BodyInit | object;
export type ApiRequestInit = Omit<RequestInit, 'body'> & { body?: ApiBody | null };

export class ApiError extends Error {
   readonly status: number;
   readonly code: string;
   readonly details?: unknown;

   constructor(status: number, code: string, message: string, details?: unknown) {
      super(message);
      this.name = 'ApiError';
      this.status = status;
      this.code = code;
      if (details !== undefined) this.details = details;
   }
}

function normalisePath(path: string): string {
   const absolute = path.startsWith('/') ? path : `/${path}`;
   if (absolute === '/api' || absolute.startsWith('/api/')) return absolute;
   return `/api${absolute}`;
}

function readCookie(name: string): string | null {
   if (typeof document === 'undefined') return null;
   const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
   return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function isNativeBody(body: ApiBody): body is BodyInit {
   return (
      typeof body === 'string' ||
      body instanceof FormData ||
      body instanceof Blob ||
      body instanceof URLSearchParams ||
      body instanceof ArrayBuffer ||
      ArrayBuffer.isView(body) ||
      (typeof ReadableStream !== 'undefined' && body instanceof ReadableStream)
   );
}

function prepareBody(body: ApiBody | null | undefined): {
   body: BodyInit | null | undefined;
   json: boolean;
} {
   if (body === null || body === undefined) return { body, json: false };
   if (isNativeBody(body)) return { body, json: false };
   return { body: JSON.stringify(body), json: true };
}

function messageOf(cause: unknown): string {
   return cause instanceof Error && cause.message.length > 0
      ? cause.message
      : 'Network request failed';
}

export async function apiRequest(path: string, init?: ApiRequestInit): Promise<Response> {
   const method = (init?.method ?? 'GET').toUpperCase();
   const headers = new Headers(init?.headers);
   const prepared = prepareBody(init?.body);

   if (prepared.json && !headers.has('content-type')) {
      headers.set('content-type', 'application/json');
   }

   if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(method)) {
      const csrf = readCookie('csrf');
      if (csrf) headers.set('x-csrf-token', csrf);
   }

   try {
      return await fetch(`${API_BASE_URL}${normalisePath(path)}`, {
         ...init,
         method,
         headers,
         body: prepared.body,
         credentials: 'include',
      });
   } catch (cause) {
      throw new ApiError(0, 'network_error', messageOf(cause));
   }
}

type JsonRead = { parsed: true; value: unknown } | { parsed: false };

async function readJson(response: Response): Promise<JsonRead> {
   try {
      return { parsed: true, value: await response.json() };
   } catch {
      return { parsed: false };
   }
}

function toApiError(status: number, error: ApiErrorShape): ApiError {
   return new ApiError(status, error.code, error.message, error.details);
}

export async function apiFetchPage<T>(
   path: string,
   init?: ApiRequestInit,
): Promise<{ data: T; meta: ApiMeta }> {
   const response = await apiRequest(path, init);

   if (response.status === 204) {
      return { data: undefined as T, meta: { nextCursor: null, hasMore: false } };
   }

   const json = await readJson(response);

   if (!json.parsed) {
      throw new ApiError(
         0,
         'network_error',
         response.ok
            ? 'The server response could not be read'
            : `Request failed: ${response.status}`,
      );
   }

   const result = parseEnvelope<T>(json.value, response.status);
   if (!result.ok) throw toApiError(result.status, result.error);

   return { data: result.data, meta: result.meta };
}

export async function apiFetch<T>(path: string, init?: ApiRequestInit): Promise<T> {
   const { data } = await apiFetchPage<T>(path, init);
   return data;
}
