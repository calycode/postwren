import { apiFetch } from './client';
import type { RenderWarning, Template, TemplatePreview } from './types';

export type TemplateInput = {
   name: string;
   subject: string;
   irJson: unknown;
};

export type TemplatePatch = Partial<TemplateInput>;

export function list(): Promise<Template[]> {
   return apiFetch<Template[]>('/api/v1/templates');
}

export function get(id: string): Promise<Template> {
   return apiFetch<Template>(`/api/v1/templates/${encodeURIComponent(id)}`);
}

export function create(input: TemplateInput): Promise<Template> {
   return apiFetch<Template>('/api/v1/templates', { method: 'POST', body: input });
}

export function update(id: string, input: TemplatePatch): Promise<Template> {
   return apiFetch<Template>(`/api/v1/templates/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: input,
   });
}

export function remove(id: string): Promise<void> {
   return apiFetch<void>(`/api/v1/templates/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export function duplicate(id: string): Promise<Template> {
   return apiFetch<Template>(`/api/v1/templates/${encodeURIComponent(id)}/duplicate`, {
      method: 'POST',
   });
}

export function preview(id: string): Promise<TemplatePreview> {
   return apiFetch<TemplatePreview>(`/api/v1/templates/${encodeURIComponent(id)}/preview`, {
      method: 'POST',
   });
}

export function renderWarnings(id: string): Promise<RenderWarning[]> {
   return apiFetch<RenderWarning[]>(`/api/v1/templates/${encodeURIComponent(id)}/render-warnings`, {
      method: 'POST',
   });
}
