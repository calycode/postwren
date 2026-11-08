import { apiFetch } from './client';
import type {
   Automation,
   AutomationStep,
   AutomationTrigger,
   AutomationTriggerConfig,
} from './types';

export type AutomationInput = {
   name: string;
   triggerType: AutomationTrigger;
   triggerConfig?: AutomationTriggerConfig;
   entryQuery: string;
   fromName: string;
   fromEmail: string;
   replyTo?: string;
   steps: AutomationStep[];
   metadata?: Record<string, string>;
};

export type AutomationPatch = Partial<Omit<AutomationInput, 'metadata'>> & {
   metadata?: Record<string, string | null>;
};

export function list(): Promise<Automation[]> {
   return apiFetch<Automation[]>('/api/v1/automations');
}

export function get(
   id: string,
   options: { status?: string; q?: string } = {},
): Promise<Automation> {
   const params = new URLSearchParams();
   if (options.status !== undefined && options.status.length > 0)
      params.set('status', options.status);
   if (options.q !== undefined && options.q.length > 0) params.set('q', options.q);
   const query = params.size > 0 ? `?${params.toString()}` : '';
   return apiFetch<Automation>(`/api/v1/automations/${encodeURIComponent(id)}${query}`);
}

export function create(input: AutomationInput): Promise<Automation> {
   return apiFetch<Automation>('/api/v1/automations', { method: 'POST', body: input });
}

export function update(id: string, input: AutomationPatch): Promise<Automation> {
   return apiFetch<Automation>(`/api/v1/automations/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: input,
   });
}

export function activate(id: string): Promise<Automation> {
   return apiFetch<Automation>(`/api/v1/automations/${encodeURIComponent(id)}/activate`, {
      method: 'POST',
   });
}

export function pause(id: string): Promise<Automation> {
   return apiFetch<Automation>(`/api/v1/automations/${encodeURIComponent(id)}/pause`, {
      method: 'POST',
   });
}

export function enroll(id: string, email: string): Promise<{ enrolled: boolean }> {
   return apiFetch<{ enrolled: boolean }>(`/api/v1/automations/${encodeURIComponent(id)}/enroll`, {
      method: 'POST',
      body: { email },
   });
}

export function remove(id: string): Promise<void> {
   return apiFetch<void>(`/api/v1/automations/${encodeURIComponent(id)}`, {
      method: 'DELETE',
   });
}
