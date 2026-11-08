import { apiFetch } from './client';
import type { MediaAsset } from './types';

export function upload(file: File): Promise<MediaAsset> {
   const form = new FormData();
   form.set('file', file);

   return apiFetch<MediaAsset>('/api/v1/media', { method: 'POST', body: form });
}

export function list(offset?: string | null): Promise<{
   items: MediaAsset[];
   cursor: string | null;
}> {
   const query =
      offset === null || offset === undefined ? '' : `?offset=${encodeURIComponent(offset)}`;
   return apiFetch<{ items: MediaAsset[]; cursor: string | null }>(`/api/v1/media${query}`);
}

export function remove(key: string): Promise<{ key: string; deleted: boolean }> {
   return apiFetch<{ key: string; deleted: boolean }>(
      `/api/v1/media?key=${encodeURIComponent(key)}`,
      { method: 'DELETE' },
   );
}
