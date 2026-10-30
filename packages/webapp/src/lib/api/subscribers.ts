import { ApiError, apiFetchPage, apiRequest } from './client';
import { parseEnvelope } from './envelope';
import type { ImportResult, PageMeta, Subscriber, SubscriberStatus, Tag } from './types';

export type SubscriberListParams = {
   cursor?: string;
   limit?: number;
   q?: string;
   tag?: string;
   status?: SubscriberStatus;
};

export type SubscriberInput = {
   email: string;
   firstName?: string;
   lastName?: string;
   metadata?: Record<string, string>;
};

export type SubscriberPatch = Partial<Omit<SubscriberInput, 'metadata'>> & {
   metadata?: Record<string, string | null>;
};

export type BulkTagsInput = {
   subscriberIds: string[];
   add?: string[];
   remove?: string[];
};

function queryString(params: SubscriberListParams): string {
   const search = new URLSearchParams();

   if (params.cursor) search.set('cursor', params.cursor);
   if (params.limit !== undefined) search.set('limit', String(params.limit));
   if (params.q) search.set('q', params.q);
   if (params.tag) search.set('tag', params.tag);
   if (params.status) search.set('status', params.status);

   const value = search.toString();
   return value.length > 0 ? `?${value}` : '';
}

export function list(
   params: SubscriberListParams = {},
): Promise<{ data: Subscriber[]; meta: PageMeta }> {
   return apiFetchPage<Subscriber[]>(`/api/v1/subscribers${queryString(params)}`);
}

export function create(input: SubscriberInput): Promise<Subscriber> {
   return apiFetchPage<Subscriber>('/api/v1/subscribers', {
      method: 'POST',
      body: input,
   }).then((result) => result.data);
}

export function update(id: string, input: SubscriberPatch): Promise<Subscriber> {
   return apiFetchPage<Subscriber>(`/api/v1/subscribers/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: input,
   }).then((result) => result.data);
}

export function remove(id: string): Promise<void> {
   return apiFetchPage<void>(`/api/v1/subscribers/${encodeURIComponent(id)}`, {
      method: 'DELETE',
   }).then(() => undefined);
}

export function importCsv(csv: string, tags: string[]): Promise<ImportResult> {
   return apiFetchPage<ImportResult>('/api/v1/subscribers/import', {
      method: 'POST',
      body: { csv, tags },
   }).then((result) => result.data);
}

export async function exportCsv(): Promise<Blob> {
   const response = await apiRequest('/api/v1/subscribers/export');

   if (!response.ok) {
      const payload = await response.json().catch(() => null);
      const result = parseEnvelope<never>(payload, response.status);
      if (!result.ok)
         throw new ApiError(
            result.status,
            result.error.code,
            result.error.message,
            result.error.details,
         );
      throw new ApiError(response.status, 'export_failed', 'Could not export subscribers');
   }

   return response.blob();
}

export function addTag(id: string, tagId: string): Promise<void> {
   return apiFetchPage<void>(`/api/v1/subscribers/${encodeURIComponent(id)}/tags`, {
      method: 'POST',
      body: { tagId },
   }).then(() => undefined);
}

export function removeTag(id: string, tagId: string): Promise<void> {
   return apiFetchPage<void>(
      `/api/v1/subscribers/${encodeURIComponent(id)}/tags/${encodeURIComponent(tagId)}`,
      { method: 'DELETE' },
   ).then(() => undefined);
}

export function bulkTags(input: BulkTagsInput): Promise<{ updated: number }> {
   return apiFetchPage<{ updated: number }>('/api/v1/subscribers/bulk-tags', {
      method: 'POST',
      body: input,
   }).then((result) => result.data);
}

export type { Subscriber, SubscriberStatus, Tag };
