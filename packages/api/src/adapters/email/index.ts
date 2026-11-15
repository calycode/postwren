import type { Env } from '../../env';
import { resolveSendingProvider } from '../../lib/sending-provider';
import { createCloudflareAdapter } from './cloudflare';
import { createMailgunAdapter } from './mailgun';
import { createPostmarkAdapter } from './postmark';
import { createResendAdapter } from './resend';
import { createSendGridAdapter } from './sendgrid';
import type { EmailSendAdapter, ProviderId } from './types';

export { createCloudflareAdapter, errorCodeOf, classifySendError } from './cloudflare';
export { createMailgunAdapter } from './mailgun';
export { createPostmarkAdapter } from './postmark';
export { createResendAdapter } from './resend';
export { createSendGridAdapter } from './sendgrid';
export { ProviderSendError } from './types';
export type {
   BatchItemResult,
   EmailMessage,
   EmailSendAdapter,
   ProviderId,
   ProviderUsage,
   SendFailureClass,
   SendResult,
} from './types';

/**
 * The one place that knows which provider is active. Callers pass the provider
 * a campaign pinned, or omit it to use the workspace default.
 */
export async function createEmailSender(
   env: Env,
   provider?: ProviderId,
): Promise<EmailSendAdapter> {
   const config = await resolveSendingProvider(env, provider);
   const devMode = env.ENVIRONMENT !== 'production';

   switch (config.provider) {
      case 'resend':
         return createResendAdapter({ apiKey: config.apiKey ?? '', devMode });
      case 'postmark':
         return createPostmarkAdapter({ serverToken: config.apiKey ?? '', devMode });
      case 'sendgrid':
         return createSendGridAdapter({ apiKey: config.apiKey ?? '', devMode });
      case 'mailgun':
         return createMailgunAdapter({
            apiKey: config.apiKey ?? '',
            domain: config.fromDomain ?? '',
            devMode,
         });
      default:
         return createCloudflareAdapter(env);
   }
}
