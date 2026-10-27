import { describe, expect, it } from 'vitest';
import { issuesFromDetails } from './server-issues';

describe('issuesFromDetails', () => {
   it('reads string issues from a document validation failure', () => {
      expect(issuesFromDetails({ issues: ['children.0: Expected an https URL'] })).toEqual([
         'children.0: Expected an https URL',
      ]);
   });

   it('formats zod issue objects with their path', () => {
      expect(issuesFromDetails({ issues: [{ path: ['name'], message: 'Required' }] })).toEqual([
         'name: Required',
      ]);
   });

   it('reads field error maps and removes duplicates', () => {
      expect(
         issuesFromDetails({
            name: ['Required'],
            issues: [{ path: ['name'], message: 'Required' }],
         }),
      ).toEqual(['name: Required']);
   });

   it('returns nothing for unknown details', () => {
      expect(issuesFromDetails(undefined)).toEqual([]);
      expect(issuesFromDetails('not an object')).toEqual([]);
   });
});
