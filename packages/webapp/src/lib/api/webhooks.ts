import { apiFetch } from './client';
import type { WebhookDelivery, WebhookEndpoint, WebhookEvent } from './types';

export type WebhookEndpointInput = {
   url: string;
   description?: string;
   events: WebhookEvent[];
};

export function list(): Promise<WebhookEndpoint[]> {
   return apiFetch<WebhookEndpoint[]>('/api/v1/webhooks');
}

export function create(input: WebhookEndpointInput): Promise<WebhookEndpoint> {
   return apiFetch<WebhookEndpoint>('/api/v1/webhooks', { method: 'POST', body: input });
}

export function update(
   id: string,
   input: { url?: string; description?: string; events?: WebhookEvent[]; enabled?: boolean },
): Promise<WebhookEndpoint> {
   return apiFetch<WebhookEndpoint>(`/api/v1/webhooks/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: input,
   });
}

export function remove(id: string): Promise<{ id: string; deleted: boolean }> {
   return apiFetch<{ id: string; deleted: boolean }>(`/api/v1/webhooks/${encodeURIComponent(id)}`, {
      method: 'DELETE',
   });
}

export function deliveries(id: string): Promise<WebhookDelivery[]> {
   return apiFetch<WebhookDelivery[]>(`/api/v1/webhooks/${encodeURIComponent(id)}/deliveries`);
}

export function test(id: string): Promise<{
   queued: boolean;
   delivery: WebhookDelivery | null;
}> {
   return apiFetch<{ queued: boolean; delivery: WebhookDelivery | null }>(
      `/api/v1/webhooks/${encodeURIComponent(id)}/test`,
      { method: 'POST' },
   );
}

export function retryDelivery(id: string): Promise<WebhookDelivery | null> {
   return apiFetch<WebhookDelivery | null>(
      `/api/v1/webhooks/deliveries/${encodeURIComponent(id)}/retry`,
      { method: 'POST' },
   );
}
