import type { Api } from './api';

export type SeededTemplate = {
   id: string;
   name: string;
   subject: string;
};

export type SeededSubscriber = {
   id: string;
   email: string;
};

export type SeededCampaign = {
   id: string;
   name: string;
   status: string;
};

export type DefaultSender = {
   id: string;
   email: string;
};

const DEFAULT_BODY = 'Body copy written by the e2e suite.';

/** A valid document with one text block, so seeded templates render and open in the editor. */
export function e2eDocument(text = DEFAULT_BODY) {
   return {
      version: 1,
      settings: {
         width: 600,
         backgroundColor: '#f4f4f5',
         contentColor: '#ffffff',
         textColor: '#18181b',
         linkColor: '#0f766e',
         fontFamily: 'HELVETICA',
      },
      children: [
         {
            id: 'e2e-text',
            type: 'text',
            text,
            align: 'left',
            fontSize: 16,
            lineHeight: 24,
            padding: { top: 16, right: 24, bottom: 8, left: 24 },
         },
      ],
   };
}

export function createTemplate(
   api: Api,
   name: string,
   options: { subject?: string; text?: string } = {},
): Promise<SeededTemplate> {
   return api.post<SeededTemplate>('/api/v1/templates', {
      name,
      subject: options.subject ?? `${name} subject`,
      irJson: e2eDocument(options.text),
   });
}

export function createSubscriber(
   api: Api,
   input: { email: string; firstName?: string; lastName?: string },
): Promise<SeededSubscriber> {
   return api.post('/api/v1/subscribers', input);
}

export function createTag(api: Api, name: string): Promise<{ id: string; name: string }> {
   return api.post('/api/v1/tags', { name });
}

export function attachTag(api: Api, subscriberId: string, tagId: string): Promise<void> {
   return api.post(`/api/v1/subscribers/${subscriberId}/tags`, { tagId });
}

/**
 * Campaigns only accept a verified sender. The local workspace seeds EMAIL_FROM
 * as the default address without a verification mark, so tests verify it
 * explicitly instead of depending on Cloudflare.
 */
export async function verifyDefaultSender(api: Api): Promise<DefaultSender> {
   const settings = await api.get<{
      addresses: { id: string; email: string }[];
   }>('/api/v1/settings/senders');
   const address = settings.addresses[0];
   if (address === undefined) throw new Error('No sender address was seeded');

   await api.patch(`/api/v1/settings/senders/${address.id}`, { verified: true });
   return { id: address.id, email: address.email };
}

export function createCampaign(
   api: Api,
   input: {
      name: string;
      templateId: string;
      subject: string;
      fromName: string;
      fromEmail: string;
      audienceQuery?: string;
   },
): Promise<SeededCampaign> {
   return api.post<SeededCampaign>('/api/v1/campaigns', {
      ...input,
      audienceQuery: input.audienceQuery ?? '',
   });
}
