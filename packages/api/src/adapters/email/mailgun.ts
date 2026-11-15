import { retryAfterFrom } from './http';
import { ProviderSendError } from './types';
import type { EmailMessage, EmailSendAdapter, SendFailureClass } from './types';

type MailgunResponse = {
   id?: string;
   message?: string;
};

export type MailgunAdapterOptions = {
   apiKey: string;
   domain: string;
   devMode: boolean;
   fetchImpl?: typeof fetch;
};

function normaliseDomain(value: string): string {
   const trimmed = value.trim().toLowerCase();
   if (trimmed.length === 0) return '';

   const withoutScheme = trimmed.replace(/^https?:\/\//, '');
   return withoutScheme.split('/')[0] ?? '';
}

function fromHeader(from: { name: string; email: string }): string {
   return from.name.trim().length > 0 ? `${from.name} <${from.email}>` : from.email;
}

class MailgunEmailAdapter implements EmailSendAdapter {
   readonly provider = 'mailgun';
   /** Mailgun's multi-recipient API does not return one message id per recipient. */
   readonly batchSize = 1;
   readonly ratePerSecond = null;

   constructor(private readonly options: MailgunAdapterOptions) {}

   private get apiKey(): string {
      return this.options.apiKey.trim();
   }

   private get domain(): string {
      return normaliseDomain(this.options.domain);
   }

   async send(input: EmailMessage): Promise<{ providerMessageId: string | null }> {
      if (this.apiKey.length === 0 || this.domain.length === 0) {
         if (!this.options.devMode) {
            throw new ProviderSendError(
               'missing_credentials',
               'Mailgun API key and sending domain are required',
            );
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

      const form = new URLSearchParams({
         from: fromHeader(input.from),
         to: input.to,
         subject: input.subject,
         html: input.html,
         text: input.text,
      });

      if (input.replyTo !== undefined) form.set('h:Reply-To', input.replyTo);
      for (const [name, value] of Object.entries(input.headers ?? {})) {
         form.set(`h:${name}`, value);
      }

      const fetcher = this.options.fetchImpl ?? fetch;
      const response = await fetcher(
         `https://api.mailgun.net/v3/${encodeURIComponent(this.domain)}/messages`,
         {
            method: 'POST',
            headers: {
               authorization: `Basic ${btoa(`api:${this.apiKey}`)}`,
               'content-type': 'application/x-www-form-urlencoded',
            },
            body: form.toString(),
         },
      );

      if (!response.ok) {
         const body = (await response.json().catch(() => null)) as MailgunResponse | null;
         throw new ProviderSendError(
            `http_${response.status}`,
            body?.message ?? `Mailgun returned ${response.status}`,
            response.status,
            retryAfterFrom(response),
         );
      }

      const body = (await response.json().catch(() => null)) as MailgunResponse | null;
      return { providerMessageId: body?.id ?? null };
   }

   classifyError(error: unknown): SendFailureClass {
      if (!(error instanceof ProviderSendError)) return 'retry';

      const status = error.httpStatus;
      if (status === 429) return 'rate';
      if (status === 401 || status === 403 || status === 404) return 'account';
      if (status === 413) return 'content';
      if (status === 400) return 'permanent';
      if (status !== null && status >= 500) return 'retry';

      return 'retry';
   }

   retryAfterSeconds(error: unknown): number | null {
      return error instanceof ProviderSendError ? error.retryAfterSeconds : null;
   }
}

export function createMailgunAdapter(options: MailgunAdapterOptions): EmailSendAdapter {
   return new MailgunEmailAdapter(options);
}
