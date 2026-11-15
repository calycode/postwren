import { retryAfterFrom } from './http';
import { ProviderSendError } from './types';
import type { BatchItemResult, EmailMessage, EmailSendAdapter, SendFailureClass } from './types';

const API = 'https://api.postmarkapp.com';

type PostmarkResponse = {
   MessageID?: string;
   ErrorCode?: number;
   Message?: string;
   To?: string;
};

export type PostmarkAdapterOptions = {
   serverToken: string;
   devMode: boolean;
   fetchImpl?: typeof fetch;
};

function payloadFor(input: EmailMessage): Record<string, unknown> {
   return {
      From:
         input.from.name.trim().length > 0
            ? `${input.from.name} <${input.from.email}>`
            : input.from.email,
      To: input.to,
      Subject: input.subject,
      HtmlBody: input.html,
      TextBody: input.text,
      ...(input.replyTo === undefined ? {} : { ReplyTo: input.replyTo }),
      ...(input.headers === undefined
         ? {}
         : {
              Headers: Object.entries(input.headers).map(([Name, Value]) => ({ Name, Value })),
           }),
   };
}

function failureFor(code: number | undefined): SendFailureClass {
   if (code === undefined) return 'permanent';
   if (code === 400 || code === 409) return 'account';
   if (code >= 500) return 'retry';
   return 'permanent';
}

class PostmarkEmailAdapter implements EmailSendAdapter {
   readonly provider = 'postmark';
   readonly batchSize = 100;
   readonly ratePerSecond = 8;

   constructor(private readonly options: PostmarkAdapterOptions) {}

   private get token(): string {
      return this.options.serverToken.trim();
   }

   private get fetcher(): typeof fetch {
      return this.options.fetchImpl ?? fetch;
   }

   private async request(path: string, body: unknown): Promise<Response> {
      const response = await this.fetcher(`${API}${path}`, {
         method: 'POST',
         headers: {
            'x-postmark-server-token': this.token,
            accept: 'application/json',
            'content-type': 'application/json',
         },
         body: JSON.stringify(body),
      });

      if (response.ok) return response;

      const parsed = (await response.json().catch(() => null)) as PostmarkResponse | null;
      throw new ProviderSendError(
         String(parsed?.ErrorCode ?? `http_${response.status}`),
         parsed?.Message ?? `Postmark returned ${response.status}`,
         response.status,
         retryAfterFrom(response),
      );
   }

   async send(input: EmailMessage): Promise<{ providerMessageId: string | null }> {
      if (this.token.length === 0) return this.devSink(input);

      const response = await this.request('/email', payloadFor(input));
      const body = (await response.json().catch(() => null)) as PostmarkResponse | null;

      if (body?.ErrorCode !== undefined && body.ErrorCode !== 0) {
         throw new ProviderSendError(
            String(body.ErrorCode),
            body.Message ?? 'Postmark rejected the message',
         );
      }

      return { providerMessageId: body?.MessageID ?? null };
   }

   async sendBatch(inputs: EmailMessage[]): Promise<BatchItemResult[]> {
      if (inputs.length === 0) return [];
      if (this.token.length === 0) {
         if (!this.options.devMode) {
            throw new ProviderSendError(
               'missing_api_key',
               'Postmark server token is not configured',
            );
         }
         return inputs.map(() => ({ ok: true, providerMessageId: `dev-${crypto.randomUUID()}` }));
      }

      const response = await this.request('/email/batch', inputs.map(payloadFor));
      const body = (await response.json().catch(() => null)) as PostmarkResponse[] | null;

      if (!Array.isArray(body) || body.length !== inputs.length) {
         throw new ProviderSendError(
            'batch_shape',
            'Postmark returned a different number of messages than were sent',
            502,
         );
      }

      return body.map((entry) => {
         if (entry.ErrorCode !== undefined && entry.ErrorCode !== 0) {
            return {
               ok: false,
               code: String(entry.ErrorCode),
               failure: failureFor(entry.ErrorCode),
               message: entry.Message ?? 'Postmark rejected the message',
               retryAfterSeconds: null,
            };
         }

         return { ok: true, providerMessageId: entry.MessageID ?? null };
      });
   }

   classifyError(error: unknown): SendFailureClass {
      if (!(error instanceof ProviderSendError)) return 'retry';

      const status = error.httpStatus;
      const code = Number(error.code);

      if (status === 429) return 'rate';
      if (status === 401 || status === 403) return 'account';
      if (!Number.isNaN(code) && code > 0) return failureFor(code);
      if (status !== null && status >= 500) return 'retry';

      return 'retry';
   }

   retryAfterSeconds(error: unknown): number | null {
      return error instanceof ProviderSendError ? error.retryAfterSeconds : null;
   }

   private devSink(input: EmailMessage): { providerMessageId: string | null } {
      if (!this.options.devMode) {
         throw new ProviderSendError('missing_api_key', 'Postmark server token is not configured');
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
}

export function createPostmarkAdapter(options: PostmarkAdapterOptions): EmailSendAdapter {
   return new PostmarkEmailAdapter(options);
}
