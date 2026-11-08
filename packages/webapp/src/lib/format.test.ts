import { describe, expect, it } from 'vitest';
import {
   csvFilename,
   formatDate,
   formatDateTime,
   formatDuration,
   formatNumber,
   pluralise,
   relativeTime,
   titleCase,
} from './format';

describe('formatDate', () => {
   it('formats unix seconds as a readable date', () => {
      const seconds = new Date(2025, 2, 12).getTime() / 1000;
      expect(formatDate(seconds)).toBe('12 Mar 2025');
   });

   it('returns a dash for missing values', () => {
      expect(formatDate(null)).toBe('—');
      expect(formatDate(undefined)).toBe('—');
   });
});

describe('formatDateTime', () => {
   it('includes the time in 24-hour form', () => {
      const seconds = new Date(2025, 2, 12, 14, 5).getTime() / 1000;
      expect(formatDateTime(seconds)).toBe('12 Mar 2025, 14:05');
   });
});

describe('formatDuration', () => {
   it('scales from milliseconds to hours', () => {
      expect(formatDuration(0)).toBe('0ms');
      expect(formatDuration(850)).toBe('850ms');
      expect(formatDuration(4200)).toBe('4.2s');
      expect(formatDuration(42_000)).toBe('42s');
      expect(formatDuration(130_000)).toBe('2m 10s');
      expect(formatDuration(11_100_000)).toBe('3h 5m');
   });

   it('returns a dash for missing values', () => {
      expect(formatDuration(null)).toBe('—');
      expect(formatDuration(undefined)).toBe('—');
      expect(formatDuration(Number.NaN)).toBe('—');
   });
});

describe('relativeTime', () => {
   const now = Date.UTC(2025, 0, 1);

   it('calls a value under a minute old just now', () => {
      expect(relativeTime(now / 1000, now)).toBe('just now');
   });

   it('describes past hours', () => {
      expect(relativeTime(now / 1000 - 3600, now)).toBe('1 hour ago');
   });

   it('describes past days', () => {
      expect(relativeTime(now / 1000 - 3 * 86_400, now)).toBe('3 days ago');
   });

   it('describes past months', () => {
      expect(relativeTime(now / 1000 - 40 * 86_400, now)).toBe('1 month ago');
   });

   it('describes past years', () => {
      expect(relativeTime(now / 1000 - 2 * 365 * 86_400, now)).toBe('2 years ago');
   });

   it('describes future values', () => {
      expect(relativeTime(now / 1000 + 2 * 86_400, now)).toBe('2 days from now');
   });

   it('returns a dash for missing values', () => {
      expect(relativeTime(null, now)).toBe('—');
   });
});

describe('pluralise', () => {
   it('uses the singular for one', () => {
      expect(pluralise(1, 'subscriber')).toBe('1 subscriber');
   });

   it('uses the plural otherwise', () => {
      expect(pluralise(0, 'subscriber')).toBe('0 subscribers');
      expect(pluralise(2, 'subscriber')).toBe('2 subscribers');
   });

   it('accepts an irregular plural', () => {
      expect(pluralise(2, 'person', 'people')).toBe('2 people');
   });
});

describe('csvFilename', () => {
   it('stamps the export with the UTC date', () => {
      expect(csvFilename('subscribers', new Date('2025-03-09T23:00:00Z'))).toBe(
         'subscribers-2025-03-09.csv',
      );
   });

   it('cleans the prefix and falls back when it is empty', () => {
      expect(csvFilename('My Export!', new Date('2025-03-09T12:00:00Z'))).toBe(
         'my-export-2025-03-09.csv',
      );
      expect(csvFilename('  ', new Date('2025-03-09T12:00:00Z'))).toBe('export-2025-03-09.csv');
   });
});

describe('formatNumber', () => {
   it('groups thousands', () => {
      expect(formatNumber(12345)).toBe('12,345');
   });
});

describe('titleCase', () => {
   it('turns snake and kebab case into words', () => {
      expect(titleCase('unsubscribed')).toBe('Unsubscribed');
      expect(titleCase('hard_bounce')).toBe('Hard Bounce');
   });
});
