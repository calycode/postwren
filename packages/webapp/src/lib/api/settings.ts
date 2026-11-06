import { apiFetch } from './client';
import type { EmbedSettings, SenderAddress, SenderSettings } from './types';

export type SenderInput = {
   email: string;
   name?: string;
};

export type SenderPatch = {
   name?: string;
   verified?: boolean;
   isDefault?: boolean;
};

export function listSenders(): Promise<SenderSettings> {
   return apiFetch<SenderSettings>('/api/v1/settings/senders');
}

export function createSender(input: SenderInput): Promise<SenderAddress> {
   return apiFetch<SenderAddress>('/api/v1/settings/senders', {
      method: 'POST',
      body: input,
   });
}

export function updateSender(id: string, patch: SenderPatch): Promise<SenderAddress> {
   return apiFetch<SenderAddress>(`/api/v1/settings/senders/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: patch,
   });
}

export function removeSender(id: string): Promise<void> {
   return apiFetch<void>(`/api/v1/settings/senders/${encodeURIComponent(id)}`, {
      method: 'DELETE',
   }).then(() => undefined);
}

export function getEmbedOrigins(): Promise<EmbedSettings> {
   return apiFetch<EmbedSettings>('/api/v1/settings/embed-origins');
}

export function updateEmbedOrigins(origins: string[]): Promise<EmbedSettings> {
   return apiFetch<EmbedSettings>('/api/v1/settings/embed-origins', {
      method: 'PUT',
      body: { origins },
   });
}
