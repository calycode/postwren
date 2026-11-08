import { describe, expect, it } from 'vitest';
import { documentIssues } from '@postwren/email/ir';
import { STARTERS } from './starters';

describe('template starters', () => {
   it('builds a valid document for every starter', () => {
      for (const starter of STARTERS) {
         expect(documentIssues(starter.build())).toEqual([]);
      }
   });

   it('gives every starter a name and subject', () => {
      for (const starter of STARTERS) {
         expect(starter.name.trim().length).toBeGreaterThan(0);
         expect(starter.subject.trim().length).toBeGreaterThan(0);
      }
   });
});
