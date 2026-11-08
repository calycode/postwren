import { SCOPES, type Scope } from '@postwren/shared/scopes';
import { apiFetch } from './client';
import type { ApiKey } from './types';

export const API_KEY_SCOPES = SCOPES;
export type ApiKeyScope = Scope;

export type ApiKeyInput = {
   name: string;
   scopes: ApiKeyScope[];
   expiresAt?: number;
};

export function list(): Promise<ApiKey[]> {
   return apiFetch<ApiKey[]>('/api/v1/settings/api-keys');
}

export function create(input: ApiKeyInput): Promise<ApiKey> {
   return apiFetch<ApiKey>('/api/v1/settings/api-keys', { method: 'POST', body: input });
}

export function revoke(id: string): Promise<{ id: string; revoked: boolean }> {
   return apiFetch<{ id: string; revoked: boolean }>(
      `/api/v1/settings/api-keys/${encodeURIComponent(id)}`,
      { method: 'DELETE' },
   );
}

/** Only works on an already-revoked key; the API refuses to delete a live one. */
export function remove(id: string): Promise<{ id: string; deleted: boolean }> {
   return apiFetch<{ id: string; deleted: boolean }>(
      `/api/v1/settings/api-keys/${encodeURIComponent(id)}`,
      { method: 'DELETE' },
   );
}
