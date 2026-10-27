import type { MergeContext } from '@mailer/email/template';

export const SAMPLE_UNSUBSCRIBE_URL = 'https://example.com/unsubscribe';

export function sampleMergeContext(
   overrides: Partial<MergeContext['campaign']> = {},
): MergeContext {
   return {
      subscriber: {
         id: 'sub_sample',
         email: 'sample@example.com',
         first_name: 'Ada',
         last_name: 'Lovelace',
         tags: ['sample'],
      },
      campaign: {
         id: 'cmp_sample',
         subject: 'Sample subject',
         utm_campaign: 'sample',
         ...overrides,
      },
      links: {
         unsubscribe: SAMPLE_UNSUBSCRIBE_URL,
      },
   };
}
