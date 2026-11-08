import type { Campaign } from '@/lib/api/types';
import { isCampaignStatus } from './status';

export type CampaignView = Campaign & {
   audienceCount: number | null;
   sentCount: number | null;
   recipientCount: number | null;
   utmSource: string;
   utmMedium: string;
   utmCampaign: string;
};

export type CampaignStatsView = {
   audienceSize: number;
   queued: number;
   sent: number;
   failed: number;
   suppressed: number;
   delivered: number;
   bounced: number;
   complained: number;
   uniqueOpens: number;
   uniqueClicks: number;
   clickThroughRate: number;
   unsubscribed: number;
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

export type RecipientView = {
   id: string;
   campaignId: string;
   subscriberId: string;
   email: string;
   status: string;
   sentAt: number | null;
   openedAt: number | null;
   clickedAt: number | null;
   createdAt: number | null;
};

function recordOf(value: unknown): Record<string, unknown> | null {
   if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
   return value as Record<string, unknown>;
}

function stringOf(source: Record<string, unknown>, ...keys: string[]): string | null {
   for (const key of keys) {
      const value = source[key];
      if (typeof value === 'string') return value;
   }
   return null;
}

function numberOf(source: Record<string, unknown>, ...keys: string[]): number | null {
   for (const key of keys) {
      const value = source[key];
      if (typeof value === 'number' && Number.isFinite(value)) return value;
      if (typeof value === 'string' && value.trim().length > 0) {
         const parsed = Number(value);
         if (Number.isFinite(parsed)) return parsed;
      }
   }
   return null;
}

function nestedNumber(
   source: Record<string, unknown>,
   parent: string,
   ...keys: string[]
): number | null {
   const nested = recordOf(source[parent]);
   return nested === null ? null : numberOf(nested, ...keys);
}

function metadataOf(source: Record<string, unknown>): Record<string, string> {
   const direct = recordOf(source.metadata);
   if (direct !== null) {
      const metadata: Record<string, string> = {};
      for (const [key, value] of Object.entries(direct)) {
         if (typeof value === 'string') metadata[key] = value;
      }
      return metadata;
   }

   const json = stringOf(source, 'metadata_json', 'metadataJson');
   if (json !== null) {
      try {
         return metadataOf({ metadata: JSON.parse(json) });
      } catch {
         return {};
      }
   }

   return {};
}

export function toCampaignView(value: unknown): CampaignView {
   const source = recordOf(value) ?? {};
   const status = isCampaignStatus(source.status) ? source.status : 'draft';
   const scheduledAt = numberOf(source, 'scheduledAt', 'scheduled_at');
   const audienceCount =
      numberOf(source, 'audienceCount', 'audience_count') ??
      nestedNumber(source, 'stats', 'audienceSize', 'audience_size');

   return {
      id: stringOf(source, 'id') ?? '',
      name: stringOf(source, 'name') ?? '',
      templateId: stringOf(source, 'templateId', 'template_id') ?? '',
      templateRevision: numberOf(source, 'templateRevision', 'template_revision') ?? 0,
      subject: stringOf(source, 'subject') ?? '',
      fromName: stringOf(source, 'fromName', 'from_name') ?? '',
      fromEmail: stringOf(source, 'fromEmail', 'from_email') ?? '',
      replyTo: stringOf(source, 'replyTo', 'reply_to'),
      audienceQuery: stringOf(source, 'audienceQuery', 'audience_query') ?? '',
      status,
      scheduledAt,
      metadata: metadataOf(source),
      created_at: numberOf(source, 'created_at', 'createdAt') ?? 0,
      updated_at: numberOf(source, 'updated_at', 'updatedAt') ?? 0,
      audienceCount,
      sentCount:
         numberOf(source, 'sentCount', 'sent_count') ??
         nestedNumber(source, 'stats', 'sent') ??
         nestedNumber(source, 'counts', 'sent'),
      recipientCount:
         numberOf(
            source,
            'recipientCount',
            'recipient_count',
            'totalRecipients',
            'total_recipients',
         ) ??
         nestedNumber(source, 'stats', 'total', 'totalRecipients', 'recipientCount') ??
         nestedNumber(source, 'counts', 'total') ??
         audienceCount,
      utmSource: stringOf(source, 'utmSource', 'utm_source') ?? '',
      utmMedium: stringOf(source, 'utmMedium', 'utm_medium') ?? '',
      utmCampaign: stringOf(source, 'utmCampaign', 'utm_campaign') ?? '',
   };
}

export function toCampaignStatsView(value: unknown): CampaignStatsView {
   const source = recordOf(value) ?? {};
   const statuses = recordOf(source.statuses) ?? {};

   const audienceSize =
      numberOf(source, 'audienceSize', 'audience_size') ??
      numberOf(source, 'total', 'totalRecipients', 'total_recipients') ??
      numberOf(statuses, 'total') ??
      0;
   const uniqueClicks = numberOf(source, 'uniqueClicks', 'unique_clicks', 'clicked', 'clicks') ?? 0;
   const clickThroughRate =
      numberOf(source, 'clickThroughRate', 'click_through_rate') ??
      (audienceSize > 0 ? uniqueClicks / audienceSize : 0);

   const topLinks = Array.isArray(source.topLinks)
      ? source.topLinks.flatMap((entry) => {
           const link = recordOf(entry);
           if (link === null) return [];
           const url = stringOf(link, 'url');
           const clicks = numberOf(link, 'clicks');
           if (url === null || clicks === null) return [];
           return [
              {
                 url,
                 clicks,
                 clickers: numberOf(link, 'clickers') ?? 0,
                 lastClickedAt: numberOf(link, 'lastClickedAt', 'last_clicked_at') ?? 0,
              },
           ];
        })
      : [];

   const recentClicks = Array.isArray(source.recentClicks)
      ? source.recentClicks.flatMap((entry) => {
           const click = recordOf(entry);
           if (click === null) return [];
           const url = stringOf(click, 'url');
           const clickedAt = numberOf(click, 'clickedAt', 'clicked_at');
           if (url === null || clickedAt === null) return [];
           return [
              {
                 email: stringOf(click, 'email'),
                 url,
                 clickedAt,
              },
           ];
        })
      : [];

   return {
      audienceSize,
      queued: numberOf(source, 'queued') ?? numberOf(statuses, 'queued') ?? 0,
      sent: numberOf(source, 'sent') ?? numberOf(statuses, 'sent') ?? 0,
      failed: numberOf(source, 'failed') ?? numberOf(statuses, 'failed') ?? 0,
      suppressed: numberOf(source, 'suppressed') ?? numberOf(statuses, 'suppressed') ?? 0,
      delivered:
         numberOf(source, 'delivered') ??
         (numberOf(statuses, 'sent') ?? 0) + (numberOf(statuses, 'delivered') ?? 0),
      bounced: numberOf(source, 'bounced') ?? numberOf(statuses, 'bounced') ?? 0,
      complained: numberOf(source, 'complained') ?? numberOf(statuses, 'complained') ?? 0,
      uniqueOpens: numberOf(source, 'uniqueOpens', 'unique_opens', 'opened', 'opens') ?? 0,
      uniqueClicks,
      clickThroughRate,
      unsubscribed:
         numberOf(source, 'unsubscribed', 'unsubscribes') ??
         numberOf(statuses, 'unsubscribed') ??
         0,
      topLinks,
      recentClicks,
   };
}

export function toRecipientView(value: unknown, campaignId: string): RecipientView {
   const source = recordOf(value) ?? {};
   const subscriberId = stringOf(source, 'subscriberId', 'subscriber_id') ?? '';
   const email = stringOf(source, 'email', 'subscriber_email', 'subscriberEmail') ?? subscriberId;

   return {
      id:
         stringOf(source, 'id') ??
         `${campaignId}:${subscriberId.length > 0 ? subscriberId : Math.random().toString(36).slice(2)}`,
      campaignId: stringOf(source, 'campaignId', 'campaign_id') ?? campaignId,
      subscriberId,
      email,
      status: stringOf(source, 'status') ?? 'queued',
      sentAt: numberOf(source, 'sentAt', 'sent_at'),
      openedAt: numberOf(source, 'openedAt', 'opened_at'),
      clickedAt: numberOf(source, 'clickedAt', 'clicked_at'),
      createdAt: numberOf(source, 'created_at', 'createdAt'),
   };
}
