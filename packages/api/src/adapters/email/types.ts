export type { ProviderId } from '@postwren/shared/providers';
import type { ProviderId } from '@postwren/shared/providers';

export type SendFailureClass =
   'retry' | 'rate' | 'daily_quota' | 'account' | 'permanent' | 'content';

export type EmailMessage = {
   from: { name: string; email: string };
   replyTo?: string;
   to: string;
   subject: string;
   html: string;
   text: string;
   headers?: Record<string, string>;
};

export type SendResult = { providerMessageId: string | null };

export type BatchItemResult =
   | { ok: true; providerMessageId: string | null }
   | {
        ok: false;
        code: string | null;
        failure: SendFailureClass;
        message: string;
        retryAfterSeconds: number | null;
     };

export type ProviderUsage = {
   daily: { used: number; limit: number | null } | null;
   monthly: { used: number; limit: number | null } | null;
   rateLimit: { limit: number; duration: string } | null;
};

export interface EmailSendAdapter {
   readonly provider: ProviderId;
   /** Messages accepted in one request. 1 means the adapter sends sequentially. */
   readonly batchSize: number;
   /** Conservative pacing default. null means no artificial delay. */
   readonly ratePerSecond: number | null;
   send(input: EmailMessage): Promise<SendResult>;
   sendBatch?(inputs: EmailMessage[]): Promise<BatchItemResult[]>;
   classifyError(err: unknown): SendFailureClass;
   retryAfterSeconds(err: unknown): number | null;
   fetchUsage?(): Promise<ProviderUsage>;
}

/**
 * Carries the HTTP status and the provider's own error name so classification
 * does not have to parse a message string.
 */
export class ProviderSendError extends Error {
   constructor(
      readonly code: string,
      message: string,
      readonly httpStatus: number | null = null,
      readonly retryAfterSeconds: number | null = null,
   ) {
      super(message);
      this.name = 'ProviderSendError';
   }
}
