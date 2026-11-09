import type { OAuthHelpers } from '@cloudflare/workers-oauth-provider';
import type { Scope } from './auth/scopes';

export type CampaignJob = {
   campaignId: string;
   recipientIds: string[];
};

/**
 * One event from a Cloudflare Email Sending event subscription. The queue also
 * carries `delivered`, `deferred`, `failed` and `rejected`; only bounced and
 * complained change a subscriber's suppression state.
 */
export type EmailSendingEvent = {
   type: string;
   source?: { type?: string; zoneId?: string; domain?: string };
   payload: {
      eventId?: string;
      messageId: string;
      recipient: string;
      subject?: string;
      terminal?: boolean;
      delivery?: {
         status?: string;
         smtpStatusCode?: string;
         smtpEnhancedStatusCode?: string;
         smtpResponse?: string;
      };
      bounce?: { type?: string; classification?: string; reason?: string };
      complaint?: { type?: string };
   };
};

export interface EmailBinding {
   send(message: {
      to: string | { email: string; name?: string };
      from: string | { email: string; name?: string };
      subject: string;
      html?: string;
      text?: string;
      replyTo?: string;
      headers?: Record<string, string>;
   }): Promise<{ messageId: string }>;
}

export interface Env {
   DB: D1Database;
   MEDIA: R2Bucket;
   ASSETS: Fetcher;
   CAMPAIGN_QUEUE: Queue<CampaignJob>;
   EMAIL: EmailBinding;
   OAUTH_KV: KVNamespace;
   OAUTH_PROVIDER?: OAuthHelpers;
   SESSION_SECRET: string;
   TOKEN_SECRET: string;
   APP_URL: string;
   ENVIRONMENT: string;
   EMAIL_FROM: string;
   OWNER_EMAIL?: string;
   CLOUDFLARE_API_TOKEN?: string;
   CLOUDFLARE_ACCOUNT_ID?: string;
   TURNSTILE_SECRET?: string;
}

export type AuthKind = 'session' | 'api_key' | 'service';

export type AppEnv = {
   Bindings: Env;
   Variables: {
      requestId: string;
      userId: string | null;
      authKind: AuthKind | null;
      authScopes: Scope[] | null;
      credentialId: string | null;
   };
};
