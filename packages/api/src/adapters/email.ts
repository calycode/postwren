import type { Env } from '../env';
import type { EmailBinding } from '../env';

export type SendFailureClass =
   'retry' | 'rate' | 'daily_quota' | 'account' | 'permanent' | 'content';

export interface EmailSendAdapter {
   send(input: {
      from: { name: string; email: string };
      replyTo?: string;
      to: string;
      subject: string;
      html: string;
      text: string;
      headers?: Record<string, string>;
   }): Promise<{ providerMessageId: string | null }>;
   classifyError(err: unknown): SendFailureClass;
}

const CLASS_BY_CODE: Record<string, SendFailureClass> = {
   E_DELIVERY_FAILED: 'retry',
   E_INTERNAL_SERVER_ERROR: 'retry',
   E_RATE_LIMIT_EXCEEDED: 'rate',
   E_DAILY_LIMIT_EXCEEDED: 'daily_quota',
   E_ACCOUNT_SUSPENDED: 'account',
   E_SENDER_NOT_VERIFIED: 'account',
   E_SENDER_DOMAIN_NOT_AVAILABLE: 'account',
   E_RECIPIENT_NOT_ALLOWED: 'permanent',
   E_RECIPIENT_SUPPRESSED: 'permanent',
   E_VALIDATION_ERROR: 'permanent',
   E_CONTENT_TOO_LARGE: 'content',
   E_TOO_MANY_RECIPIENTS: 'content',
   E_TOO_MANY_ATTACHMENTS: 'content',
};

export function errorCodeOf(error: unknown): string | null {
   if (typeof error === 'object' && error !== null) {
      const code = (error as { code?: unknown }).code;
      if (typeof code === 'string') return code;

      const cause = (error as { cause?: unknown }).cause;
      if (typeof cause === 'object' && cause !== null) {
         const nested = (cause as { code?: unknown }).code;
         if (typeof nested === 'string') return nested;
      }
   }

   if (error instanceof Error) {
      const match = /\b(E_[A-Z_]+)\b/.exec(error.message);
      if (match?.[1] !== undefined) return match[1];
   }

   return null;
}

export function classifySendError(error: unknown): SendFailureClass {
   const code = errorCodeOf(error);
   if (code === null) return 'retry';
   return CLASS_BY_CODE[code] ?? 'retry';
}

class CloudflareEmailAdapter implements EmailSendAdapter {
   constructor(
      private readonly binding: EmailBinding | undefined,
      private readonly devMode: boolean,
   ) {}

   async send(input: {
      from: { name: string; email: string };
      replyTo?: string;
      to: string;
      subject: string;
      html: string;
      text: string;
      headers?: Record<string, string>;
   }): Promise<{ providerMessageId: string | null }> {
      if (this.binding === undefined) {
         if (!this.devMode) throw new Error('EMAIL binding is not configured');
         console.log(
            JSON.stringify({
               event: 'email_dev_sink',
               to: input.to,
               subject: input.subject,
               htmlBytes: input.html.length,
            }),
         );
         return { providerMessageId: `dev-${crypto.randomUUID()}` };
      }

      const result = await this.binding.send({
         from: { email: input.from.email, name: input.from.name },
         to: input.to,
         subject: input.subject,
         html: input.html,
         text: input.text,
         ...(input.replyTo === undefined ? {} : { replyTo: input.replyTo }),
         ...(input.headers === undefined ? {} : { headers: input.headers }),
      });

      return { providerMessageId: result.messageId ?? null };
   }

   classifyError(error: unknown): SendFailureClass {
      return classifySendError(error);
   }
}

export function createCloudflareAdapter(env: Env): EmailSendAdapter {
   return new CloudflareEmailAdapter(env.EMAIL, env.ENVIRONMENT !== 'production');
}
