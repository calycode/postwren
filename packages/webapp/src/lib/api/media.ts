import { apiFetch } from './client';
import type { MediaAsset } from './types';

export function upload(file: File): Promise<MediaAsset> {
   const form = new FormData();
   form.set('file', file);

   return apiFetch<MediaAsset>('/api/v1/media', { method: 'POST', body: form });
}
