import { describe, expect, it } from 'vitest';
import { parseSubscriberCsv } from '@postwren/shared/csv';
import { SUBSCRIBER_CSV_TEMPLATE } from './subscriber-csv';

describe('subscriber CSV template', () => {
   it('parses cleanly with the subscriber importer', () => {
      const result = parseSubscriberCsv(SUBSCRIBER_CSV_TEMPLATE);

      expect(result.errors).toEqual([]);
      expect(result.rows).toHaveLength(2);
      expect(result.rows[0]).toMatchObject({
         email: 'ada@example.com',
         first_name: 'Ada',
         last_name: 'Lovelace',
         tags: ['newsletter', 'vip'],
         metadata: { plan: 'pro', signup_source: 'landing page' },
      });
   });
});
