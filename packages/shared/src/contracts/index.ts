import { z } from 'zod';

const emailField = z
   .string()
   .trim()
   .email()
   .transform((value) => value.toLowerCase());

export const paginationQuery = z.object({
   cursor: z.string().trim().min(1).optional(),
   limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const subscriberInput = z
   .object({
      email: emailField,
      firstName: z.string().trim().min(1).max(100).optional(),
      lastName: z.string().trim().min(1).max(100).optional(),
   })
   .strict();

export const subscriberPatch = subscriberInput.partial();

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
   })
   .strict();

export const templateInput = z
   .object({
      name: z.string().trim().min(1).max(200),
      subject: z.string().trim().min(1).max(998),
      irJson: z.unknown(),
   })
   .strict();

export const RATE_LIMITS = {
   publicSubscribe: { windowSeconds: 60, max: 10 },
   publicUnsubscribe: { windowSeconds: 60, max: 20 },
   apiRead: { windowSeconds: 60, max: 120 },
   apiWrite: { windowSeconds: 60, max: 60 },
   send: { windowSeconds: 60, max: 1000 },
} as const;

export type PaginationQuery = z.infer<typeof paginationQuery>;
export type SubscriberInput = z.infer<typeof subscriberInput>;
export type SubscriberPatch = z.infer<typeof subscriberPatch>;
export type TagInput = z.infer<typeof tagInput>;
export type CampaignInput = z.infer<typeof campaignInput>;
export type TemplateInput = z.infer<typeof templateInput>;
