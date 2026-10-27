export type CampaignJob = {
   campaignId: string;
   recipientIds: string[];
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
   SESSION_SECRET: string;
   TOKEN_SECRET: string;
   APP_URL: string;
   ENVIRONMENT: string;
   EMAIL_FROM: string;
   OWNER_EMAIL?: string;
}

export type AppEnv = {
   Bindings: Env;
   Variables: {
      requestId: string;
      userId: string | null;
   };
};
