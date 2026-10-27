import { describe, expect, it } from 'vitest';
import {
   RATE_LIMITS,
   campaignInput,
   paginationQuery,
   subscriberInput,
   subscriberPatch,
   tagInput,
   templateInput,
} from './index';

describe('paginationQuery', () => {
   it('defaults limit to 50', () => {
      expect(paginationQuery.parse({})).toEqual({ limit: 50 });
   });

   it('coerces a query-string limit', () => {
      expect(paginationQuery.parse({ limit: '25' })).toEqual({ limit: 25 });
   });

   it('accepts a cursor', () => {
      expect(paginationQuery.parse({ cursor: 'abc', limit: '1' })).toEqual({
         cursor: 'abc',
         limit: 1,
      });
   });

   it.each([0, 101, 1.5])('rejects limit %s', (limit) => {
      expect(paginationQuery.safeParse({ limit }).success).toBe(false);
   });
});

describe('subscriberInput', () => {
   it('trims and lowercases the email and trims names', () => {
      expect(
         subscriberInput.parse({
            email: ' Ada@Example.COM ',
            firstName: ' Ada ',
            lastName: ' Lovelace ',
         }),
      ).toEqual({ email: 'ada@example.com', firstName: 'Ada', lastName: 'Lovelace' });
   });

   it('accepts a subscriber without names', () => {
      expect(subscriberInput.parse({ email: 'ada@example.com' })).toEqual({
         email: 'ada@example.com',
      });
   });

   it('rejects an invalid email', () => {
      expect(subscriberInput.safeParse({ email: 'not-an-email' }).success).toBe(false);
   });

   it('rejects unknown keys', () => {
      expect(subscriberInput.safeParse({ email: 'ada@example.com', role: 'admin' }).success).toBe(
         false,
      );
   });
});

describe('subscriberPatch', () => {
   it('accepts an empty patch', () => {
      expect(subscriberPatch.parse({})).toEqual({});
   });

   it('accepts a subset of fields', () => {
      expect(subscriberPatch.parse({ firstName: 'Grace' })).toEqual({ firstName: 'Grace' });
   });

   it('still validates an email when present', () => {
      expect(subscriberPatch.safeParse({ email: 'bad' }).success).toBe(false);
   });
});

describe('tagInput', () => {
   it('trims the name', () => {
      expect(tagInput.parse({ name: '  Newsletter  ' })).toEqual({ name: 'Newsletter' });
   });

   it('rejects a blank name', () => {
      expect(tagInput.safeParse({ name: '   ' }).success).toBe(false);
   });

   it('rejects names longer than 64 characters', () => {
      expect(tagInput.safeParse({ name: 'a'.repeat(65) }).success).toBe(false);
   });
});

describe('campaignInput', () => {
   const base = {
      name: 'October newsletter',
      templateId: 'tpl_1',
      subject: 'Hello',
      fromName: 'Caly',
      fromEmail: 'HELLO@Example.com',
      audienceQuery: 'tag:newsletter -tag:test',
   };

   it('parses a complete campaign and lowercases sender emails', () => {
      expect(
         campaignInput.parse({
            ...base,
            replyTo: 'Reply@Example.com',
            scheduledAt: 1_700_000_000,
            utmSource: 'newsletter',
         }),
      ).toEqual({
         ...base,
         fromEmail: 'hello@example.com',
         replyTo: 'reply@example.com',
         scheduledAt: 1_700_000_000,
         utmSource: 'newsletter',
      });
   });

   it('allows an empty audience query', () => {
      expect(campaignInput.safeParse({ ...base, audienceQuery: '' }).success).toBe(true);
   });

   it('rejects an invalid sender email', () => {
      expect(campaignInput.safeParse({ ...base, fromEmail: 'nope' }).success).toBe(false);
   });

   it('rejects a missing subject', () => {
      const { subject: _subject, ...withoutSubject } = base;
      expect(campaignInput.safeParse(withoutSubject).success).toBe(false);
   });

   it.each([-1, 1.5, Number.NaN])('rejects scheduledAt %s', (scheduledAt) => {
      expect(campaignInput.safeParse({ ...base, scheduledAt }).success).toBe(false);
   });

   it('rejects unknown keys', () => {
      expect(campaignInput.safeParse({ ...base, status: 'sent' }).success).toBe(false);
   });
});

describe('templateInput', () => {
   it('accepts an opaque IR document', () => {
      const irJson = { version: 1, settings: {}, children: [] };

      expect(templateInput.parse({ name: 'Welcome', subject: 'Hi', irJson })).toEqual({
         name: 'Welcome',
         subject: 'Hi',
         irJson,
      });
   });

   it('rejects a missing name', () => {
      expect(templateInput.safeParse({ subject: 'Hi', irJson: {} }).success).toBe(false);
   });

   it('rejects unknown keys', () => {
      expect(
         templateInput.safeParse({ name: 'Welcome', subject: 'Hi', irJson: {}, extra: true })
            .success,
      ).toBe(false);
   });
});

describe('RATE_LIMITS', () => {
   it('declares positive windows and maxima', () => {
      for (const limit of Object.values(RATE_LIMITS)) {
         expect(limit.windowSeconds).toBeGreaterThan(0);
         expect(limit.max).toBeGreaterThan(0);
      }
   });
});
