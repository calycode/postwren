import { createId, randomToken } from '@postwren/worker-kit/ids';
import { AppError } from '@postwren/worker-kit/errors';
import { PROVIDERS, isProviderId, providerById } from '@postwren/shared/providers';
import type { ProviderDescriptor, ProviderId } from '@postwren/shared/providers';
import type { Env } from '../env';
import { configuredAppOrigin } from './app-url';
import { decryptSecret, encryptSecret, encryptionSource } from './secrets';
import { nowSeconds } from './time';

export type EmailProviderRow = {
   id: string;
   provider: string;
   label: string;
   api_key_ciphertext: string | null;
   api_key_last4: string | null;
   webhook_secret_ciphertext: string | null;
   webhook_token: string;
   from_domain: string | null;
   status: string;
   is_default: number;
   created_at: number;
   updated_at: number;
};

export type StoredProviderFields = {
   apiKey: boolean;
   webhookSecret: boolean;
   fromDomain: string | null;
};

export type SendingProviderState = {
   provider: ProviderId;
   label: string;
   configured: boolean;
   eventsConfigured: boolean;
   apiKeyLast4: string | null;
   webhookUrl: string | null;
   fromDomain: string | null;
   status: string;
   encryption: 'dedicated' | 'derived';
   stored: StoredProviderFields;
   providers: readonly ProviderDescriptor[];
};

export type SendingProviderInput = {
   provider: ProviderId;
   label?: string;
   apiKey?: string;
   webhookSecret?: string;
   fromDomain?: string;
};

export type ResolvedSendingProvider = {
   provider: ProviderId;
   apiKey: string | null;
   webhookSecret: string | null;
   webhookToken: string | null;
   fromDomain: string | null;
   row: EmailProviderRow | null;
};

function providerOf(value: string): ProviderId {
   return isProviderId(value) ? value : 'cloudflare';
}

function descriptorOf(provider: ProviderId): ProviderDescriptor {
   const descriptor = providerById(provider);
   if (descriptor === null) {
      throw new AppError(422, 'validation_error', `Unknown sending provider: ${provider}`);
   }
   return descriptor;
}

export async function loadProviderRow(
   db: D1Database,
   provider: ProviderId,
): Promise<EmailProviderRow | null> {
   return db
      .prepare('SELECT * FROM email_providers WHERE provider = ?')
      .bind(provider)
      .first<EmailProviderRow>();
}

export async function loadDefaultProviderRow(db: D1Database): Promise<EmailProviderRow | null> {
   return db
      .prepare('SELECT * FROM email_providers WHERE is_default = 1')
      .first<EmailProviderRow>();
}

export async function activeProviderId(db: D1Database): Promise<ProviderId> {
   const row = await db
      .prepare('SELECT provider FROM email_providers WHERE is_default = 1')
      .first<{ provider: string }>();
   return row === null ? 'cloudflare' : providerOf(row.provider);
}

export async function resolveSendingProvider(
   env: Env,
   provider?: ProviderId,
): Promise<ResolvedSendingProvider> {
   const row =
      provider === undefined
         ? await loadDefaultProviderRow(env.DB)
         : await loadProviderRow(env.DB, provider);

   if (row === null) {
      return {
         provider: provider ?? 'cloudflare',
         apiKey: null,
         webhookSecret: null,
         webhookToken: null,
         fromDomain: null,
         row: null,
      };
   }

   return {
      provider: providerOf(row.provider),
      apiKey:
         row.api_key_ciphertext === null ? null : await decryptSecret(env, row.api_key_ciphertext),
      webhookSecret:
         row.webhook_secret_ciphertext === null
            ? null
            : await decryptSecret(env, row.webhook_secret_ciphertext),
      webhookToken: row.webhook_token,
      fromDomain: row.from_domain,
      row,
   };
}

export async function resolveProviderByWebhookToken(
   env: Env,
   token: string,
): Promise<ResolvedSendingProvider | null> {
   const row = await env.DB.prepare('SELECT * FROM email_providers WHERE webhook_token = ?')
      .bind(token)
      .first<EmailProviderRow>();

   if (row === null) return null;

   return {
      provider: providerOf(row.provider),
      apiKey: null,
      webhookSecret:
         row.webhook_secret_ciphertext === null
            ? null
            : await decryptSecret(env, row.webhook_secret_ciphertext),
      webhookToken: row.webhook_token,
      fromDomain: row.from_domain,
      row,
   };
}

export async function sendingProviderState(
   env: Env,
   origin?: string,
): Promise<SendingProviderState> {
   const row = await loadDefaultProviderRow(env.DB);
   const provider = row === null ? 'cloudflare' : providerOf(row.provider);
   const descriptor = descriptorOf(provider);
   const base = origin ?? configuredAppOrigin(env);
   const stored: StoredProviderFields = {
      apiKey: row?.api_key_ciphertext != null,
      webhookSecret: row?.webhook_secret_ciphertext != null,
      fromDomain: row?.from_domain ?? null,
   };

   const configured = descriptor.fields
      .filter((field) => field.required)
      .every((field) => {
         if (field.key === 'apiKey') return stored.apiKey;
         if (field.key === 'webhookSecret') return stored.webhookSecret;
         return (stored.fromDomain ?? '').length > 0;
      });

   return {
      provider,
      label: row?.label ?? descriptor.label,
      configured,
      eventsConfigured:
         descriptor.webhook === null || descriptor.webhook.auth === 'token' || stored.webhookSecret,
      apiKeyLast4: row?.api_key_last4 ?? null,
      webhookUrl:
         descriptor.webhook !== null && row !== null && base !== null
            ? `${base}/api/email-events/${provider}/${row.webhook_token}`
            : null,
      fromDomain: stored.fromDomain,
      status: row?.status ?? (provider === 'cloudflare' ? 'ready' : 'unconfigured'),
      encryption: encryptionSource(env),
      stored,
      providers: PROVIDERS,
   };
}

export async function saveSendingProvider(env: Env, input: SendingProviderInput): Promise<void> {
   const descriptor = descriptorOf(input.provider);
   const existing = await loadProviderRow(env.DB, input.provider);
   const apiKey = input.apiKey?.trim() ?? '';
   const fromDomain = input.fromDomain?.trim() ?? existing?.from_domain ?? null;
   const webhookSecret = input.webhookSecret?.trim() ?? '';

   const hasApiKey = apiKey.length > 0 || existing?.api_key_ciphertext != null;
   const hasWebhookSecret = webhookSecret.length > 0 || existing?.webhook_secret_ciphertext != null;
   const hasFromDomain = (fromDomain ?? '').length > 0;

   for (const field of descriptor.fields) {
      if (!field.required) continue;
      const present =
         field.key === 'apiKey'
            ? hasApiKey
            : field.key === 'webhookSecret'
              ? hasWebhookSecret
              : hasFromDomain;
      if (!present) {
         throw new AppError(422, 'validation_error', `${field.label} is required`);
      }
   }

   const now = nowSeconds();
   const ciphertext =
      apiKey.length > 0 ? await encryptSecret(env, apiKey) : (existing?.api_key_ciphertext ?? null);
   const last4 = apiKey.length > 0 ? apiKey.slice(-4) : (existing?.api_key_last4 ?? null);
   const webhookCiphertext =
      webhookSecret.length > 0
         ? await encryptSecret(env, webhookSecret)
         : (existing?.webhook_secret_ciphertext ?? null);
   const label = input.label?.trim() ?? existing?.label ?? descriptor.label;
   const requiresDomain = descriptor.fields.some(
      (field) => field.key === 'fromDomain' && field.required,
   );
   const status =
      input.provider === 'cloudflare'
         ? 'ready'
         : hasApiKey && (!requiresDomain || hasFromDomain)
           ? 'configured'
           : 'unconfigured';

   await env.DB.batch([
      env.DB.prepare('UPDATE email_providers SET is_default = 0 WHERE is_default = 1'),
      env.DB.prepare(
         `INSERT INTO email_providers
           (id, provider, label, api_key_ciphertext, api_key_last4, webhook_secret_ciphertext,
            webhook_token, from_domain, status, is_default, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
          ON CONFLICT(provider) DO UPDATE SET
            label = excluded.label,
            api_key_ciphertext = excluded.api_key_ciphertext,
            api_key_last4 = excluded.api_key_last4,
            webhook_secret_ciphertext = excluded.webhook_secret_ciphertext,
            from_domain = excluded.from_domain,
            status = excluded.status,
            is_default = 1,
            updated_at = excluded.updated_at`,
      ).bind(
         existing?.id ?? createId('epv'),
         input.provider,
         label,
         ciphertext,
         last4,
         webhookCiphertext,
         existing?.webhook_token ?? randomToken(24),
         fromDomain,
         status,
         existing?.created_at ?? now,
         now,
      ),
   ]);
}
