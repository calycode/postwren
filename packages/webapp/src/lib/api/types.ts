export type SubscriberStatus = 'active' | 'unsubscribed' | 'bounced' | 'complained' | 'deleted';

export type Tag = {
   id: string;
   name: string;
   subscriber_count?: number;
   created_at?: number;
};

export type Subscriber = {
   id: string;
   email: string;
   first_name: string | null;
   last_name: string | null;
   status: SubscriberStatus;
   tags: Tag[];
   created_at: number;
   updated_at: number;
};

export type Template = {
   id: string;
   name: string;
   subject: string;
   revision: number;
   irJson: unknown;
   created_at: number;
   updated_at: number;
};

export type CampaignStatus =
   'draft' | 'scheduled' | 'sending' | 'paused' | 'sent' | 'cancelled' | 'failed';

export type Campaign = {
   id: string;
   name: string;
   templateId: string;
   templateRevision: number;
   subject: string;
   fromName: string;
   fromEmail: string;
   replyTo: string | null;
   audienceQuery: string;
   status: CampaignStatus;
   scheduledAt: number | null;
   created_at: number;
   updated_at: number;
};

export type CampaignStats = {
   total: number;
   queued: number;
   sent: number;
   delivered: number;
   opened: number;
   clicked: number;
   bounced: number;
   complained: number;
   unsubscribed: number;
   failed: number;
};

export type CampaignRecipient = {
   id: string;
   campaignId: string;
   subscriberId: string;
   email: string;
   messageId: string | null;
   status: 'queued' | 'sent' | 'delivered' | 'bounced' | 'failed' | 'skipped';
   sentAt: number | null;
   created_at: number;
};

export type PageMeta = {
   requestId?: string;
   nextCursor: string | null;
   hasMore: boolean;
};

export type Page<T> = {
   data: T[];
   meta: PageMeta;
};

export type ImportRowError = {
   row: number;
   message: string;
};

export type ImportResult = {
   imported: number;
   skipped: number;
   errors: ImportRowError[];
};

export type RenderWarning = {
   code: string;
   message: string;
   blockId?: string;
};

export type TemplatePreview = {
   html: string;
   text: string;
   warnings: RenderWarning[];
};

export type MediaAsset = {
   id: string;
   url: string;
   filename?: string;
   contentType?: string;
   size?: number;
};

export type AuthUser = {
   id: string;
   email: string;
   role: string;
   created_at: number;
};

export type MagicLinkResult = {
   sent: boolean;
   devToken?: string;
};

export type AdminEnvironment = {
   environment: string;
   apiBaseUrl: string;
   appUrl?: string;
   emailFrom?: string;
};

export type AudiencePreview = {
   count: number;
   sample: Subscriber[];
};

export type SenderAddress = {
   id: string;
   email: string;
   name: string;
   domain: string;
   verified_at: number | null;
   is_default: number;
   created_at: number;
};

export type SenderSettings = {
   addresses: SenderAddress[];
   domains: string[];
   defaultFrom: string;
};
