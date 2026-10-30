import type { BadgeVariants } from '@postwren/ui';
import type { CampaignStatus } from '@/lib/api/types';

export type CampaignBadgeVariant = NonNullable<BadgeVariants['variant']>;

export const CAMPAIGN_STATUSES: CampaignStatus[] = [
   'draft',
   'scheduled',
   'sending',
   'paused',
   'sent',
   'cancelled',
   'failed',
];

export function isCampaignStatus(value: unknown): value is CampaignStatus {
   return typeof value === 'string' && CAMPAIGN_STATUSES.includes(value as CampaignStatus);
}

export function campaignStatusVariant(status: CampaignStatus): CampaignBadgeVariant {
   switch (status) {
      case 'draft':
         return 'secondary';
      case 'scheduled':
         return 'warning';
      case 'sending':
         return 'default';
      case 'sent':
         return 'success';
      case 'paused':
         return 'warning';
      case 'cancelled':
         return 'outline';
      case 'failed':
         return 'destructive';
   }
}

export function isEditableStatus(status: CampaignStatus): status is 'draft' | 'paused' {
   return status === 'draft' || status === 'paused';
}

export type CampaignActions = {
   save: boolean;
   schedule: boolean;
   sendNow: boolean;
   pause: boolean;
   cancel: boolean;
   sendTest: boolean;
};

const ACTIONS: Record<CampaignStatus, CampaignActions> = {
   draft: {
      save: true,
      schedule: true,
      sendNow: true,
      pause: false,
      cancel: false,
      sendTest: true,
   },
   scheduled: {
      save: false,
      schedule: false,
      sendNow: true,
      pause: false,
      cancel: true,
      sendTest: true,
   },
   sending: {
      save: false,
      schedule: false,
      sendNow: false,
      pause: true,
      cancel: false,
      sendTest: true,
   },
   paused: {
      save: true,
      schedule: false,
      sendNow: true,
      pause: false,
      cancel: true,
      sendTest: true,
   },
   sent: {
      save: false,
      schedule: false,
      sendNow: false,
      pause: false,
      cancel: false,
      sendTest: true,
   },
   cancelled: {
      save: false,
      schedule: false,
      sendNow: false,
      pause: false,
      cancel: false,
      sendTest: true,
   },
   failed: {
      save: false,
      schedule: false,
      sendNow: false,
      pause: false,
      cancel: false,
      sendTest: true,
   },
};

export function campaignActions(status: CampaignStatus): CampaignActions {
   return ACTIONS[status];
}
