import { messageOf, retryAfterFrom } from './http';
import { ProviderSendError } from './types';
import type {
   BatchItemResult,
   EmailMessage,
   EmailSendAdapter,
   ProviderUsage,
   SendFailureClass,
} from './types';

const API = 'https://api.resend.com';

type ResendError = {
   name?: string;
   message?: string;
   statusCode?: number;
};

type ResendBatchBody = {
   data?: Array<{ id?: string }>;
   errors?: Array<{ index?: number; message?: string }>;
};

type ResendUsageBody = {
   emails?: {
      daily?: { used?: number; limit?: number | null };
      monthly?: { used?: number; limit?: number | null };
   };
   rate_limit?: { limit?: number; duration?: string };
};

export type ResendAdapterOptions = {
   apiKey: string;
   devMode: boolean;
   fetchImpl?: typeof fetch;
};

function fromHeader(from: { name: string; email: string }): string {
   return from.name.trim().length > 0 ? `${from.name} <${from.email}>` : from.email;
}

function payloadFor(input: EmailMessage): Record<string, unknown> {
   return {
      from: fromHeader(input.from),
      to: [input.to],
      subject: input.subject,
      html: input.html,
      text: input.text,
      ...(input.replyTo === undefined ? {} : { reply_to: input.replyTo }),
      ...(input.headers === undefined ? {} : { headers: input.headers }),
   };
}

class ResendEmailAdapter implements EmailSendAdapter {
   readonly provider = 'resend';
   readonly batchSize = 100;
   readonly ratePerSecond = 10;

   constructor(private readonly options: ResendAdapterOptions) {}

   private get apiKey(): string {
      return this.options.apiKey.trim();
   }

   private get fetcher(): typeof fetch {
      return this.options.fetchImpl ?? fetch;
   }

   private async request(path: string, init: RequestInit): Promise<Response> {
      const response = await this.fetcher(`${API}${path}`, {
         ...init,
         headers: {
            authorization: `Bearer ${this.apiKey}`,
            'content-type': 'application/json',
            ...init.headers,
         },
      });

      if (response.ok) return response;

      const body = (await response.json().catch(() => null)) as ResendError | null;
      throw new ProviderSendError(
         body?.name ?? `http_${response.status}`,
         body?.message ?? `Resend returned ${response.status}`,
         response.status,
         retryAfterFrom(response),
      );
   }

   async send(input: EmailMessage): Promise<{ providerMessageId: string | null }> {
      if (this.apiKey.length === 0) return this.devSink(input);

      const response = await this.request('/emails', {
         method: 'POST',
         body: JSON.stringify(payloadFor(input)),
      });
      const body = (await response.json().catch(() => null)) as { id?: string } | null;

      return { providerMessageId: body?.id ?? null };
   }

   async sendBatch(inputs: EmailMessage[]): Promise<BatchItemResult[]> {
      if (inputs.length === 0) return [];
      if (this.apiKey.length === 0) return inputs.map(() => this.devResult());

      try {
         const response = await this.request('/emails/batch', {
            method: 'POST',
            body: JSON.stringify(inputs.map(payloadFor)),
         });
         const body = (await response.json().catch(() => null)) as ResendBatchBody | null;
         const data = body?.data ?? [];

         if (data.length !== inputs.length) {
            throw new ProviderSendError(
               'batch_shape',
               'Resend returned a different number of messages than were sent',
               502,
            );
         }

         const errors = new Map(
            (body?.errors ?? []).map((entry) => [entry.index ?? -1, entry.message ?? 'Rejected']),
         );

         return inputs.map((_, index) => {
            const error = errors.get(index);
            if (error !== undefined) {
               return {
                  ok: false,
                  code: 'validation_error',
                  failure: 'permanent',
                  message: error,
                  retryAfterSeconds: null,
               };
            }

            return { ok: true, providerMessageId: data[index]?.id ?? null };
         });
      } catch (error) {
         if (error instanceof ProviderSendError && error.httpStatus === 422) {
            return this.sendSequentially(inputs);
         }
         throw error;
      }
   }

   async fetchUsage(): Promise<ProviderUsage> {
      const response = await this.request('/usage', { method: 'GET' });
      const body = (await response.json().catch(() => null)) as ResendUsageBody | null;

      const daily = body?.emails?.daily;
      const monthly = body?.emails?.monthly;
      const rate = body?.rate_limit;

      return {
         daily: daily === undefined ? null : { used: daily.used ?? 0, limit: daily.limit ?? null },
         monthly:
            monthly === undefined
               ? null
               : { used: monthly.used ?? 0, limit: monthly.limit ?? null },
         rateLimit:
            rate === undefined ? null : { limit: rate.limit ?? 0, duration: rate.duration ?? '1s' },
      };
   }

   classifyError(error: unknown): SendFailureClass {
      if (!(error instanceof ProviderSendError)) return 'retry';

      const status = error.httpStatus;
      const message = error.message.toLowerCase();
      const code = error.code.toLowerCase();

      if (code === 'missing_api_key' || code === 'invalid_api_key') return 'account';
      if (code === 'validation_error') return 'permanent';

      if (status === 429) {
         if (/daily|monthly|quota/.test(message)) return 'daily_quota';
         return 'rate';
      }

      if (status === 401 || status === 403) return 'account';
      if (status === 422) {
         return /too large|size|payload/.test(message) ? 'content' : 'permanent';
      }
      if (status !== null && status >= 500) return 'retry';

      return 'retry';
   }

   retryAfterSeconds(error: unknown): number | null {
      return error instanceof ProviderSendError ? error.retryAfterSeconds : null;
   }

   private devSink(input: EmailMessage): { providerMessageId: string | null } {
      if (!this.options.devMode) {
         throw new ProviderSendError('missing_api_key', 'Resend API key is not configured');
      }
      console.log(
         JSON.stringify({
            event: 'email_dev_sink',
            provider: this.provider,
            to: input.to,
            subject: input.subject,
            htmlBytes: input.html.length,
         }),
      );
      return { providerMessageId: `dev-${crypto.randomUUID()}` };
   }

   private devResult(): BatchItemResult {
      if (!this.options.devMode) {
         throw new ProviderSendError('missing_api_key', 'Resend API key is not configured');
      }
      return { ok: true, providerMessageId: `dev-${crypto.randomUUID()}` };
   }

   private async sendSequentially(inputs: EmailMessage[]): Promise<BatchItemResult[]> {
      const results: BatchItemResult[] = [];

      for (const input of inputs) {
         try {
            const result = await this.send(input);
            results.push({ ok: true, providerMessageId: result.providerMessageId });
         } catch (error) {
            results.push({
               ok: false,
               code: error instanceof ProviderSendError ? error.code : null,
               failure: this.classifyError(error),
               message: messageOf(error, 'Send failed'),
               retryAfterSeconds: this.retryAfterSeconds(error),
            });
         }
      }

      return results;
   }
}

export function createResendAdapter(options: ResendAdapterOptions): EmailSendAdapter {
   return new ResendEmailAdapter(options);
}
