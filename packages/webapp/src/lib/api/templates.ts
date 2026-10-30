import { apiFetch } from './client';
import type { RenderWarning, Template, TemplatePreview } from './types';

export type TemplateInput = {
   name: string;
   subject: string;
   irJson: unknown;
};

export type TemplatePatch = Partial<TemplateInput>;

export type TemplateUpdateOptions = {
   /** Autosave keeps the saved revision; an explicit save advances it. */
   bumpRevision?: boolean;
   /** Lets the request outlive a page unload when the caller cannot await it. */
   keepalive?: boolean;
};

export function list(): Promise<Template[]> {
   return apiFetch<Template[]>('/api/v1/templates');
}

export function get(id: string): Promise<Template> {
   return apiFetch<Template>(`/api/v1/templates/${encodeURIComponent(id)}`);
}

export function create(input: TemplateInput): Promise<Template> {
   return apiFetch<Template>('/api/v1/templates', { method: 'POST', body: input });
}

export function update(
   id: string,
   input: TemplatePatch,
   options: TemplateUpdateOptions = {},
): Promise<Template> {
   const body: TemplatePatch & { bumpRevision?: boolean } = { ...input };
   if (options.bumpRevision !== undefined) {
      body.bumpRevision = options.bumpRevision;
   }

   return apiFetch<Template>(`/api/v1/templates/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body,
      keepalive: options.keepalive,
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
