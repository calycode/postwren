import { apiFetch } from './client';
import type { SubscribeKey } from './types';

export type SubscribeKeyInput = {
   name: string;
   allowedOrigins?: string[];
   defaultTags?: string[];
};

export function list(): Promise<SubscribeKey[]> {
   return apiFetch<SubscribeKey[]>('/api/v1/subscribe-keys');
}

export function create(input: SubscribeKeyInput): Promise<SubscribeKey> {
   return apiFetch<SubscribeKey>('/api/v1/subscribe-keys', {
      method: 'POST',
      body: input,
   });
}

export function revoke(id: string): Promise<void> {
   return apiFetch<void>(`/api/v1/subscribe-keys/${encodeURIComponent(id)}`, {
      method: 'DELETE',
   }).then(() => undefined);
}
