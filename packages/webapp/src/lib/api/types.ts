import type { Block } from '@postwren/email/ir';
import type {
   AutomationStatus,
   AutomationStep,
   AutomationTrigger,
   AutomationTriggerConfig,
} from '@postwren/shared/automation';

export type { AutomationStatus, AutomationStep, AutomationTrigger, AutomationTriggerConfig };

export type SubscriberStatus =
   'pending' | 'subscribed' | 'unsubscribed' | 'bounced' | 'complained' | 'deleted';

export type Tag = {
   id: string;
   name: string;
   subscriber_count?: number;
   campaign_count?: number;
   automation_count?: number;
   created_at?: number;
};

export type Subscriber = {
   id: string;
   email: string;
   first_name: string | null;
   last_name: string | null;
   status: SubscriberStatus;
   tags: Tag[];
   metadata: Record<string, string>;
   created_at: number;
   updated_at: number;
};

export type Template = {
   id: string;
   name: string;
   subject: string;
   revision: number;
   irJson: unknown;
   preview_html: string | null;
   created_at: number;
   updated_at: number;
};

export type TemplateVersionSummary = {
   revision: number;
   name: string;
   subject: string;
   createdAt: number;
};

export type TemplateVersion = TemplateVersionSummary & {
   ir: unknown;
   previewHtml: string;
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
   metadata: Record<string, string>;
   created_at: number;
   updated_at: number;
};

export type CampaignStats = {
   campaignId: string;
   audienceSize: number;
   totalRecipients: number;
   statuses: Record<string, number>;
   uniqueOpens: number;
   uniqueClicks: number;
   clickThroughRate: number;
   topLinks: {
      url: string;
      clicks: number;
      clickers: number;
      lastClickedAt: number;
   }[];
   recentClicks: {
      email: string | null;
      url: string;
      clickedAt: number;
   }[];
};

export type CampaignRecipient = {
   id: string;
   campaignId: string;
   subscriberId: string;
   email: string;
   messageId: string | null;
   status: 'queued' | 'sent' | 'delivered' | 'bounced' | 'failed' | 'skipped';
   sentAt: number | null;
   opened_at?: number | null;
   clicked_at?: number | null;
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
   key: string;
   url: string;
   name: string;
   contentType: string;
   size: number;
   uploadedAt?: string;
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
   devCode?: string;
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

export type DiscoveredDomain = {
   id: string;
   name: string;
   status: string;
   emailRouting: boolean | null;
   mx: boolean;
   spf: boolean;
   dkim: boolean;
   dmarc: boolean;
   suggestedAddress: string;
};

export type EmbedSettings = {
   origins: string[];
};

export type SubscribeKey = {
   id: string;
   name: string;
   prefix: string;
   allowed_origins: string[];
   default_tags: string[];
   require_confirmation: boolean;
   created_at: number;
   revoked_at: number | null;
   key?: string;
};

export type WebhookEvent =
   | 'subscriber.created'
   | 'subscriber.confirmed'
   | 'subscriber.updated'
   | 'subscriber.unsubscribed'
   | 'subscriber.deleted'
   | 'campaign.scheduled'
   | 'campaign.sent'
   | 'webhook.test';

export type WebhookEndpoint = {
   id: string;
   url: string;
   description: string | null;
   events: WebhookEvent[];
   enabled: boolean;
   created_at: number;
   updated_at: number;
   last_success_at: number | null;
   last_failure_at: number | null;
   failure_count: number;
   secret?: string;
};

export type WebhookDelivery = {
   id: string;
   endpoint_id: string;
   event: WebhookEvent;
   status: 'pending' | 'succeeded' | 'failed';
   attempts: number;
   response_status: number | null;
   error: string | null;
   next_attempt_at: number | null;
   created_at: number;
   delivered_at: number | null;
};

export type DashboardCampaign = {
   id: string;
   name: string;
   subject: string;
   status: CampaignStatus;
   audienceCount: number | null;
   scheduledAt: number | null;
   startedAt: number | null;
   completedAt: number | null;
   createdAt: number;
   updatedAt: number;
};

export type Dashboard = {
   generatedAt: number;
   counts: {
      activeSubscribers: number;
      totalSubscribers: number;
      unsubscribed: number;
      templates: number;
      campaignsSent: number;
      scheduled: number;
   };
   engagement: {
      windowDays: number;
      sent: number;
      opened: number;
      clicked: number;
      openRate: number | null;
      clickRate: number | null;
   };
   growth: { weekStart: number; count: number }[];
   recent: DashboardCampaign[];
   upcoming: DashboardCampaign[];
   automations: {
      activeAutomations: number;
      activeRuns: number;
      runs7d: number;
      finished7d: number;
      sent7d: number;
      windowDays: number;
      recent: {
         id: string;
         automationId: string;
         automationName: string;
         email: string;
         status: string;
         enteredAt: number;
         completedAt: number | null;
         exitReason: string | null;
      }[];
   };
   setup: {
      verifiedSender: boolean;
      template: boolean;
      sentCampaign: boolean;
   };
};

export type SubscriberTimelineEntry = {
   campaignId: string;
   campaignName: string;
   subject: string;
   status: string;
   sentAt: number | null;
   openedAt: number | null;
   clickedAt: number | null;
};

export type SubscriberActivity = {
   subscriberId: string;
   totals: {
      received: number;
      opened: number;
      clicked: number;
      lastSentAt: number | null;
   };
   timeline: SubscriberTimelineEntry[];
   clicks: {
      url: string;
      clickedAt: number;
      campaignId: string;
      campaignName: string;
   }[];
};

export type ApiKey = {
   id: string;
   name: string;
   prefix: string;
   scopes: string[];
   created_at: number;
   last_used_at: number | null;
   expires_at: number | null;
   revoked_at: number | null;
   key?: string;
};

export type SavedBlock = {
   id: string;
   name: string;
   block: Block;
   created_at: number;
   updated_at: number;
};

export type Automation = {
   id: string;
   name: string;
   status: AutomationStatus;
   triggerType: AutomationTrigger;
   triggerConfig: AutomationTriggerConfig;
   entryQuery: string;
   fromName: string;
   fromEmail: string;
   replyTo: string | null;
   steps: AutomationStep[];
   metadata: Record<string, string>;
   version: number;
   created_at: number;
   updated_at: number;
   activated_at: number | null;
   activeRuns?: number;
   totalRuns?: number;
   sentCount?: number;
   runs?: AutomationRun[];
};

export type AutomationRun = {
   id: string;
   status: string;
   subscriberId: string;
   email: string;
   automationVersion: number;
   currentStep: string;
   nextRunAt: number | null;
   enteredAt: number;
   startedAt: number | null;
   lastStepAt: number | null;
   completedAt: number | null;
   durationMs: number | null;
   stepsExecuted: number;
   sentCount: number;
   attempts: number;
   exitReason: string | null;
   lastError: string | null;
   deliveries: AutomationDelivery[];
};

export type AutomationDelivery = {
   id: string;
   email: string;
   subject: string;
   status: string;
   stepIndex: number | null;
   sentAt: number | null;
   openedAt: number | null;
   clickedAt: number | null;
   queuedAt: number | null;
   durationMs: number | null;
   errorCode: string | null;
};
