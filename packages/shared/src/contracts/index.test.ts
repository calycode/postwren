import { describe, expect, it } from 'vitest';
import {
   RATE_LIMITS,
   campaignInput,
   paginationQuery,
   publicSubscribeInput,
   subscriberInput,
   subscriberPatch,
   subscribeKeyInput,
   tagInput,
   templateInput,
   templateUpdateInput,
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

   it('accepts metadata key/value pairs', () => {
      expect(
         subscriberInput.parse({
            email: 'ada@example.com',
            metadata: { plan: 'pro', signup_source: 'landing page' },
         }),
      ).toEqual({
         email: 'ada@example.com',
         metadata: { plan: 'pro', signup_source: 'landing page' },
      });
   });

   it('rejects reserved, malformed and oversized metadata', () => {
      expect(
         subscriberInput.safeParse({ email: 'a@example.com', metadata: { email: 'x' } }).success,
      ).toBe(false);
      expect(
         subscriberInput.safeParse({ email: 'a@example.com', metadata: { Plan: 'pro' } }).success,
      ).toBe(false);
      expect(
         subscriberInput.safeParse({ email: 'a@example.com', metadata: { plan: 'a'.repeat(1025) } })
            .success,
      ).toBe(false);
   });

   it('rejects more than 50 metadata keys', () => {
      const metadata = Object.fromEntries(
         Array.from({ length: 51 }, (_, index) => [`key_${index}`, 'value']),
      );

      expect(subscriberInput.safeParse({ email: 'a@example.com', metadata }).success).toBe(false);
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

   it('accepts an empty name as a request to clear it', () => {
      expect(subscriberPatch.parse({ firstName: '', lastName: '' })).toEqual({
         firstName: '',
         lastName: '',
      });
   });

   it('accepts null metadata values so a key can be deleted', () => {
      expect(subscriberPatch.parse({ metadata: { plan: null, tier: 'gold' } })).toEqual({
         metadata: { plan: null, tier: 'gold' },
      });
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

   it('accepts campaign metadata', () => {
      expect(campaignInput.parse({ ...base, metadata: { edition: 'october' } }).metadata).toEqual({
         edition: 'october',
      });
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

describe('templateUpdateInput', () => {
   it('parses a content-only payload without bumpRevision', () => {
      const irJson = { version: 1, settings: {}, children: [] };

      expect(templateUpdateInput.parse({ subject: 'Hi', irJson })).toEqual({
         subject: 'Hi',
         irJson,
      });
   });

   it('keeps bumpRevision false so autosave does not pin a new revision', () => {
      const parsed = templateUpdateInput.parse({ irJson: {}, bumpRevision: false });

      expect(parsed).toEqual({ irJson: {}, bumpRevision: false });
      expect(parsed.bumpRevision).toBe(false);
   });

   it('keeps bumpRevision true for an explicit save', () => {
      expect(templateUpdateInput.parse({ name: 'Welcome', bumpRevision: true })).toEqual({
         name: 'Welcome',
         bumpRevision: true,
      });
   });

   it('accepts an empty payload', () => {
      expect(templateUpdateInput.parse({})).toEqual({});
   });

   it('rejects a non-boolean bumpRevision', () => {
      expect(templateUpdateInput.safeParse({ bumpRevision: 'no' }).success).toBe(false);
   });

   it('rejects unknown keys', () => {
      expect(templateUpdateInput.safeParse({ irJson: {}, revision: 7 }).success).toBe(false);
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

describe('publicSubscribeInput', () => {
   it('accepts the public form payload and lowercases the email', () => {
      expect(
         publicSubscribeInput.parse({
            email: ' Ada@Example.com ',
            firstName: 'Ada',
            tags: ['newsletter'],
            metadata: { signup_source: 'emdash' },
            source: 'emdash',
            sourceUrl: 'https://example.com/newsletter',
            website: '',
         }),
      ).toEqual({
         email: 'ada@example.com',
         firstName: 'Ada',
         tags: ['newsletter'],
         metadata: { signup_source: 'emdash' },
         source: 'emdash',
         sourceUrl: 'https://example.com/newsletter',
         website: '',
      });
   });

   it('rejects a non-absolute sourceUrl', () => {
      expect(
         publicSubscribeInput.safeParse({
            email: 'ada@example.com',
            sourceUrl: 'not-a-url',
         }).success,
      ).toBe(false);
   });
});

describe('subscribeKeyInput', () => {
   it('accepts allowed origins and default tags', () => {
      expect(
         subscribeKeyInput.parse({
            name: 'Marketing site',
            allowedOrigins: ['https://example.com'],
            defaultTags: ['newsletter'],
         }),
      ).toEqual({
         name: 'Marketing site',
         allowedOrigins: ['https://example.com'],
         defaultTags: ['newsletter'],
      });
   });

   it('rejects a non-http origin', () => {
      expect(
         subscribeKeyInput.safeParse({
            name: 'Marketing site',
            allowedOrigins: ['ftp://example.com'],
         }).success,
      ).toBe(false);
   });
});
