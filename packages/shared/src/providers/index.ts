export const PROVIDER_IDS = ['cloudflare', 'resend', 'postmark', 'sendgrid', 'mailgun'] as const;

export type ProviderId = (typeof PROVIDER_IDS)[number];

export type ProviderFieldKey = 'apiKey' | 'webhookSecret' | 'fromDomain';

export type ProviderField = {
   key: ProviderFieldKey;
   label: string;
   type: 'password' | 'text';
   required: boolean;
   placeholder: string;
   hint: string;
};

export type ProviderWebhook = {
   auth: 'signature' | 'token';
   hint: string;
};

export type ProviderDescriptor = {
   id: ProviderId;
   label: string;
   description: string;
   fields: ProviderField[];
   /** Upper bound the provider accepts in one request. 1 means no batch API. */
   batchSize: number;
   /** Conservative default used for pacing. null leaves the queue consumer unpaced. */
   ratePerSecond: number | null;
   webhook: ProviderWebhook | null;
   /** Whether the adapter can read current plan usage from the provider. */
   usage: boolean;
};

export const PROVIDERS: readonly ProviderDescriptor[] = [
   {
      id: 'cloudflare',
      label: 'Cloudflare Email Service',
      description:
         'Bundled binding, no API key. Throughput follows the Cloudflare plan and sending domain reputation.',
      fields: [],
      batchSize: 1,
      ratePerSecond: null,
      webhook: null,
      usage: false,
   },
   {
      id: 'resend',
      label: 'Resend',
      description: 'Higher volume over HTTP. Needs an API key and a domain verified in Resend.',
      fields: [
         {
            key: 'apiKey',
            label: 'Resend API key',
            type: 'password',
            required: true,
            placeholder: 're_...',
            hint: 'Create a sending key in Resend. It is stored encrypted and never shown again.',
         },
         {
            key: 'webhookSecret',
            label: 'Webhook signing secret',
            type: 'password',
            required: false,
            placeholder: 'whsec_...',
            hint: 'From the Resend webhook. Required for bounce and complaint suppression.',
         },
      ],
      batchSize: 100,
      ratePerSecond: 10,
      webhook: {
         auth: 'signature',
         hint: 'Add the URL in Resend under Webhooks and subscribe to delivered, bounced and complained events.',
      },
      usage: true,
   },
   {
      id: 'postmark',
      label: 'Postmark',
      description: 'Transactional and broadcast mail with a dedicated server token.',
      fields: [
         {
            key: 'apiKey',
            label: 'Server API token',
            type: 'password',
            required: true,
            placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
            hint: 'The Server API token from the Postmark server you send from.',
         },
      ],
      batchSize: 100,
      ratePerSecond: 8,
      webhook: {
         auth: 'token',
         hint: 'Add the URL as a Postmark webhook for Delivery, Bounce and SpamComplaint. The token in the URL authenticates the call.',
      },
      usage: false,
   },
   {
      id: 'sendgrid',
      label: 'SendGrid',
      description: 'High volume HTTP sending with a scoped API key.',
      fields: [
         {
            key: 'apiKey',
            label: 'SendGrid API key',
            type: 'password',
            required: true,
            placeholder: 'SG...',
            hint: 'Use a key with Mail Send permission. It is stored encrypted and never shown again.',
         },
      ],
      batchSize: 1,
      ratePerSecond: null,
      webhook: {
         auth: 'token',
         hint: 'Add the URL as a SendGrid Event Webhook. The token in the URL authenticates the call; SendGrid signatures are not verified yet.',
      },
      usage: false,
   },
   {
      id: 'mailgun',
      label: 'Mailgun',
      description: 'Sending domain based HTTP API with signed webhooks.',
      fields: [
         {
            key: 'apiKey',
            label: 'Mailgun API key',
            type: 'password',
            required: true,
            placeholder: 'key-...',
            hint: 'A private API key from Mailgun. It is stored encrypted and never shown again.',
         },
         {
            key: 'fromDomain',
            label: 'Sending domain',
            type: 'text',
            required: true,
            placeholder: 'mg.example.com',
            hint: 'The Mailgun domain used in the send URL and in the From address.',
         },
         {
            key: 'webhookSecret',
            label: 'Webhook signing key',
            type: 'password',
            required: false,
            placeholder: 'From Settings, Webhooks',
            hint: 'Mailgun signs webhooks with this key. Required for bounce and complaint suppression.',
         },
      ],
      batchSize: 1,
      ratePerSecond: null,
      webhook: {
         auth: 'signature',
         hint: 'Add the URL as a Mailgun webhook for delivered, permanent fail and complaint events.',
      },
      usage: false,
   },
];

export function providerById(id: string): ProviderDescriptor | null {
   return PROVIDERS.find((provider) => provider.id === id) ?? null;
}

export function isProviderId(value: string): value is ProviderId {
   return PROVIDER_IDS.includes(value as ProviderId);
}

export function providerFields(id: ProviderId): ProviderField[] {
   return providerById(id)?.fields ?? [];
}
