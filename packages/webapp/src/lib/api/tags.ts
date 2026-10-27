import { apiFetch } from './client';
import type { Tag } from './types';

export function list(): Promise<Tag[]> {
   return apiFetch<Tag[]>('/api/v1/tags');
}

export function create(name: string): Promise<Tag> {
   return apiFetch<Tag>('/api/v1/tags', { method: 'POST', body: { name } });
}

export function update(id: string, name: string): Promise<Tag> {
   return apiFetch<Tag>(`/api/v1/tags/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: { name },
   });
}

export function remove(id: string): Promise<void> {
   return apiFetch<void>(`/api/v1/tags/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export function autocomplete(query: string): Promise<Tag[]> {
   const search = new URLSearchParams();
   if (query.trim().length > 0) search.set('q', query.trim());
   const suffix = search.toString();
   return apiFetch<Tag[]>(`/api/v1/tags/autocomplete${suffix.length > 0 ? `?${suffix}` : ''}`);
}
