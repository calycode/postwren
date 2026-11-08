import { apiFetch } from './client';
import type { SavedBlock } from './types';

export function list(): Promise<SavedBlock[]> {
   return apiFetch<SavedBlock[]>('/api/v1/saved-blocks');
}

export function create(input: { name: string; block: unknown }): Promise<SavedBlock> {
   return apiFetch<SavedBlock>('/api/v1/saved-blocks', { method: 'POST', body: input });
}

export function rename(id: string, name: string): Promise<SavedBlock> {
   return apiFetch<SavedBlock>(`/api/v1/saved-blocks/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: { name },
   });
}

export function remove(id: string): Promise<void> {
   return apiFetch<void>(`/api/v1/saved-blocks/${encodeURIComponent(id)}`, {
      method: 'DELETE',
   });
}
