import { apiFetch, apiFetchPage } from './client';
import type {
   AudiencePreview,
   Campaign,
   CampaignRecipient,
   CampaignStats,
   PageMeta,
} from './types';

export type CampaignInput = {
   name: string;
   templateId: string;
   subject: string;
   fromName: string;
   fromEmail: string;
   replyTo?: string;
   audienceQuery: string;
   scheduledAt?: number;
   utmSource?: string;
   utmMedium?: string;
   utmCampaign?: string;
};

export type CampaignPatch = Partial<CampaignInput>;

export type CampaignListParams = {
   cursor?: string;
   limit?: number;
   status?: Campaign['status'];
   q?: string;
};

function campaignQuery(params: CampaignListParams): string {
   const search = new URLSearchParams();
   if (params.cursor) search.set('cursor', params.cursor);
   if (params.limit !== undefined) search.set('limit', String(params.limit));
   if (params.status) search.set('status', params.status);
   if (params.q) search.set('q', params.q);
   const value = search.toString();
   return value.length > 0 ? `?${value}` : '';
}

export function list(
   params: CampaignListParams = {},
): Promise<{ data: Campaign[]; meta: PageMeta }> {
   return apiFetchPage<Campaign[]>(`/api/v1/campaigns${campaignQuery(params)}`);
}

export function get(id: string): Promise<Campaign> {
   return apiFetch<Campaign>(`/api/v1/campaigns/${encodeURIComponent(id)}`);
}

export function create(input: CampaignInput): Promise<Campaign> {
   return apiFetch<Campaign>('/api/v1/campaigns', { method: 'POST', body: input });
}

export function update(id: string, input: CampaignPatch): Promise<Campaign> {
   return apiFetch<Campaign>(`/api/v1/campaigns/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: input,
   });
}

export function schedule(id: string, scheduledAt: number): Promise<Campaign> {
   return apiFetch<Campaign>(`/api/v1/campaigns/${encodeURIComponent(id)}/schedule`, {
      method: 'POST',
      body: { scheduledAt },
   });
}

export function sendNow(id: string): Promise<Campaign> {
   return apiFetch<Campaign>(`/api/v1/campaigns/${encodeURIComponent(id)}/send-now`, {
      method: 'POST',
   });
}

export function pause(id: string): Promise<Campaign> {
   return apiFetch<Campaign>(`/api/v1/campaigns/${encodeURIComponent(id)}/pause`, {
      method: 'POST',
   });
}

export function cancel(id: string): Promise<Campaign> {
   return apiFetch<Campaign>(`/api/v1/campaigns/${encodeURIComponent(id)}/cancel`, {
      method: 'POST',
   });
}

export function test(id: string, email: string): Promise<{ sent: boolean }> {
   return apiFetch<{ sent: boolean }>(`/api/v1/campaigns/${encodeURIComponent(id)}/test`, {
      method: 'POST',
      body: { email },
   });
}

export function recipients(
   id: string,
   params: { cursor?: string; limit?: number } = {},
): Promise<{ data: CampaignRecipient[]; meta: PageMeta }> {
   const search = new URLSearchParams();
   if (params.cursor) search.set('cursor', params.cursor);
   if (params.limit !== undefined) search.set('limit', String(params.limit));
   const suffix = search.toString();
   return apiFetchPage<CampaignRecipient[]>(
      `/api/v1/campaigns/${encodeURIComponent(id)}/recipients${suffix.length > 0 ? `?${suffix}` : ''}`,
   );
}

export function stats(id: string): Promise<CampaignStats> {
   return apiFetch<CampaignStats>(`/api/v1/campaigns/${encodeURIComponent(id)}/stats`);
}

export function audiencePreview(query: string): Promise<AudiencePreview> {
   const search = new URLSearchParams({ q: query });
   return apiFetch<AudiencePreview>(`/api/v1/audience/preview?${search.toString()}`);
}
