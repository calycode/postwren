import type { MergeContext } from '@mailer/email/template';

export const SAMPLE_UNSUBSCRIBE_URL = 'https://example.com/unsubscribe';

type SampleOverrides = Partial<Omit<MergeContext['campaign'], 'meta'>> & {
   meta?: Record<string, string>;
};

export function sampleMergeContext(overrides: SampleOverrides = {}): MergeContext {
   const { meta, ...campaign } = overrides;

   return {
      subscriber: {
         id: 'sub_sample',
         email: 'sample@example.com',
         first_name: 'Ada',
         last_name: 'Lovelace',
         tags: ['sample'],
         meta: {},
      },
      campaign: {
         id: 'cmp_sample',
         subject: 'Sample subject',
         utm_campaign: 'sample',
         ...campaign,
         meta: meta ?? {},
      },
      links: {
         unsubscribe: SAMPLE_UNSUBSCRIBE_URL,
      },
   };
}
