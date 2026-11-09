import { apiFetch } from './client';
import type { TemplateComment } from './types';

export type TemplateCommentInput = {
   blockId: string;
   body: string;
};

export function list(templateId: string): Promise<TemplateComment[]> {
   return apiFetch<TemplateComment[]>(
      `/api/v1/templates/${encodeURIComponent(templateId)}/comments`,
   );
}

export function create(templateId: string, input: TemplateCommentInput): Promise<TemplateComment> {
   return apiFetch<TemplateComment>(
      `/api/v1/templates/${encodeURIComponent(templateId)}/comments`,
      { method: 'POST', body: input },
   );
}

export function update(
   templateId: string,
   commentId: string,
   input: { body?: string; status?: 'open' | 'done' },
): Promise<TemplateComment> {
   return apiFetch<TemplateComment>(
      `/api/v1/templates/${encodeURIComponent(templateId)}/comments/${encodeURIComponent(commentId)}`,
      { method: 'PATCH', body: input },
   );
}

export function remove(
   templateId: string,
   commentId: string,
): Promise<{ id: string; deleted: boolean }> {
   return apiFetch<{ id: string; deleted: boolean }>(
      `/api/v1/templates/${encodeURIComponent(templateId)}/comments/${encodeURIComponent(commentId)}`,
      { method: 'DELETE' },
   );
}
