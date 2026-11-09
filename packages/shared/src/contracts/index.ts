import { z } from 'zod';
import { metadataPatch, metadataRecord } from '../metadata/index';
import { WEBHOOK_EVENTS } from '../webhooks/index';

const emailField = z
   .string()
   .trim()
   .email()
   .transform((value) => value.toLowerCase());

const originField = z
   .string()
   .trim()
   .max(500)
   .url()
   .refine((value) => {
      try {
         const url = new URL(value);
         return url.protocol === 'https:' || url.protocol === 'http:';
      } catch {
         return false;
      }
   }, 'Origins must be absolute http or https URLs');

const tagNameField = z.string().trim().min(1).max(64);

export const paginationQuery = z.object({
   cursor: z.string().trim().min(1).optional(),
   limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const subscriberInput = z
   .object({
      email: emailField,
      firstName: z.string().trim().min(1).max(100).optional(),
      lastName: z.string().trim().min(1).max(100).optional(),
      metadata: metadataRecord.optional(),
   })
   .strict();

export const subscriberPatch = subscriberInput
   .partial()
   .extend({ metadata: metadataPatch.optional() });

export const tagInput = z
   .object({
      name: z.string().trim().min(1).max(64),
   })
   .strict();

export const campaignInput = z
   .object({
      name: z.string().trim().min(1).max(200),
      templateId: z.string().trim().min(1).max(100),
      subject: z.string().trim().min(1).max(998),
      fromName: z.string().trim().min(1).max(100),
      fromEmail: emailField,
      replyTo: emailField.optional(),
      audienceQuery: z.string().trim().max(2000),
      scheduledAt: z.number().int().nonnegative().optional(),
      utmSource: z.string().trim().min(1).max(100).optional(),
      utmMedium: z.string().trim().min(1).max(100).optional(),
      utmCampaign: z.string().trim().min(1).max(191).optional(),
      metadata: metadataRecord.optional(),
      data: z.unknown().optional(),
   })
   .strict();

export const templateInput = z
   .object({
      name: z.string().trim().min(1).max(200),
      subject: z.string().trim().min(1).max(998),
      irJson: z.unknown(),
   })
   .strict();

export const templateUpdateInput = templateInput
   .partial()
   .extend({ bumpRevision: z.boolean().optional() });

export const publicSubscribeInput = z
   .object({
      email: emailField,
      firstName: z.string().trim().min(1).max(100).optional(),
      lastName: z.string().trim().min(1).max(100).optional(),
      tags: z.array(tagNameField).max(20).optional(),
      metadata: metadataRecord.optional(),
      source: z.string().trim().min(1).max(100).optional(),
      sourceUrl: z.string().trim().max(2048).url().optional(),
      website: z.string().max(500).optional(),
      turnstileToken: z.string().trim().max(4096).optional(),
   })
   .strict();

export const subscribeKeyInput = z
   .object({
      name: z.string().trim().min(1).max(100),
      allowedOrigins: z.array(originField).max(20).optional(),
      defaultTags: z.array(tagNameField).max(20).optional(),
      requireConfirmation: z.boolean().optional(),
      turnstileSiteKey: z.string().trim().max(100).optional(),
   })
   .strict();

const webhookUrlField = z
   .string()
   .trim()
   .max(2000)
   .url()
   .refine((value) => {
      const url = new URL(value);
      return url.protocol === 'https:';
   }, 'Webhook URLs must use https');

const webhookEventField = z.enum(WEBHOOK_EVENTS);

export const webhookEndpointInput = z
   .object({
      url: webhookUrlField,
      description: z.string().trim().max(200).optional(),
      events: z.array(webhookEventField).min(1).max(WEBHOOK_EVENTS.length),
   })
   .strict();

export const webhookEndpointPatch = z
   .object({
      url: webhookUrlField.optional(),
      description: z.string().trim().max(200).optional(),
      events: z.array(webhookEventField).min(1).max(WEBHOOK_EVENTS.length).optional(),
      enabled: z.boolean().optional(),
   })
   .strict();

export const RATE_LIMITS = {
   publicSubscribe: { windowSeconds: 60, max: 10 },
   publicUnsubscribe: { windowSeconds: 60, max: 20 },
   apiRead: { windowSeconds: 60, max: 120 },
   apiWrite: { windowSeconds: 60, max: 60 },
   apiEvents: { windowSeconds: 60, max: 120 },
   apiEventsPerEmail: { windowSeconds: 60, max: 30 },
   send: { windowSeconds: 60, max: 1000 },
} as const;

export type PaginationQuery = z.infer<typeof paginationQuery>;
export type SubscriberInput = z.infer<typeof subscriberInput>;
export type SubscriberPatch = z.infer<typeof subscriberPatch>;
export type TagInput = z.infer<typeof tagInput>;
export type CampaignInput = z.infer<typeof campaignInput>;
export type TemplateInput = z.infer<typeof templateInput>;
export type TemplateUpdateInput = z.infer<typeof templateUpdateInput>;
export type PublicSubscribeInput = z.infer<typeof publicSubscribeInput>;
export type SubscribeKeyInput = z.infer<typeof subscribeKeyInput>;
