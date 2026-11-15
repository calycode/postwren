import { retryAfterFrom } from './http';
import { ProviderSendError } from './types';
import type { EmailMessage, EmailSendAdapter, SendFailureClass } from './types';

const API = 'https://api.sendgrid.com/v3/mail/send';

type SendGridError = {
   errors?: Array<{ message?: string; field?: string; help?: string }>;
};

export type SendGridAdapterOptions = {
   apiKey: string;
   devMode: boolean;
   fetchImpl?: typeof fetch;
};

function payloadFor(input: EmailMessage): Record<string, unknown> {
   return {
      personalizations: [{ to: [{ email: input.to }] }],
      from: {
         email: input.from.email,
         ...(input.from.name.trim().length > 0 ? { name: input.from.name } : {}),
      },
      ...(input.replyTo === undefined ? {} : { reply_to: { email: input.replyTo } }),
      subject: input.subject,
      content: [
         { type: 'text/plain', value: input.text },
         { type: 'text/html', value: input.html },
      ],
      ...(input.headers === undefined ? {} : { headers: input.headers }),
   };
}

class SendGridEmailAdapter implements EmailSendAdapter {
   readonly provider = 'sendgrid';
   /** SendGrid's batch endpoint does not return one message id per recipient. */
   readonly batchSize = 1;
   readonly ratePerSecond = null;

   constructor(private readonly options: SendGridAdapterOptions) {}

   private get apiKey(): string {
      return this.options.apiKey.trim();
   }

   async send(input: EmailMessage): Promise<{ providerMessageId: string | null }> {
      if (this.apiKey.length === 0) {
         if (!this.options.devMode) {
            throw new ProviderSendError('missing_api_key', 'SendGrid API key is not configured');
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

      const fetcher = this.options.fetchImpl ?? fetch;
      const response = await fetcher(API, {
         method: 'POST',
         headers: {
            authorization: `Bearer ${this.apiKey}`,
            'content-type': 'application/json',
         },
         body: JSON.stringify(payloadFor(input)),
      });

      if (!response.ok) {
         const body = (await response.json().catch(() => null)) as SendGridError | null;
         const detail = body?.errors?.[0]?.message;
         throw new ProviderSendError(
            `http_${response.status}`,
            detail ?? `SendGrid returned ${response.status}`,
            response.status,
            retryAfterFrom(response),
         );
      }

      return { providerMessageId: response.headers.get('x-message-id') };
   }

   classifyError(error: unknown): SendFailureClass {
      if (!(error instanceof ProviderSendError)) return 'retry';

      const status = error.httpStatus;
      if (status === 429) return 'rate';
      if (status === 401 || status === 403) return 'account';
      if (status === 413) return 'content';
      if (status === 400) return 'permanent';
      if (status !== null && status >= 500) return 'retry';

      return 'retry';
   }

   retryAfterSeconds(error: unknown): number | null {
      return error instanceof ProviderSendError ? error.retryAfterSeconds : null;
   }
}

export function createSendGridAdapter(options: SendGridAdapterOptions): EmailSendAdapter {
   return new SendGridEmailAdapter(options);
}
