import { describe, expect, it } from 'vitest';
import {
   clampNumber,
   clampSpacing,
   distributeColumnWidths,
   hrefIssue,
   imageSrcIssue,
   insertAtCaret,
   isHexColor,
   isHttpsUrlValue,
   mergeTagInsertion,
   normaliseHex,
   parseNumber,
   unsubscribeInsertion,
} from './controls';

describe('colour controls', () => {
   it('accepts only six digit hex colours', () => {
      expect(isHexColor('#a1b2c3')).toBe(true);
      expect(isHexColor('#AABBCC')).toBe(true);
      expect(isHexColor('#fff')).toBe(false);
      expect(isHexColor('rgb(0, 0, 0)')).toBe(false);
      expect(isHexColor('oklch(0.5 0.1 20)')).toBe(false);
      expect(isHexColor('#12345')).toBe(false);
      expect(isHexColor('')).toBe(false);
   });

   it('falls back when a colour is invalid', () => {
      expect(normaliseHex('  #a1b2c3 ', '#000000')).toBe('#a1b2c3');
      expect(normaliseHex('#fff', '#000000')).toBe('#000000');
      expect(normaliseHex('rgb(0,0,0)', '#000000')).toBe('#000000');
   });
});

describe('number controls', () => {
   it('clamps numbers to the IR bounds and rounds them', () => {
      expect(clampNumber(100, 8, 72)).toBe(72);
      expect(clampNumber(1, 8, 72)).toBe(8);
      expect(clampNumber(16.6, 8, 72)).toBe(17);
   });

   it('uses the fallback for non-finite values', () => {
      expect(clampNumber(Number.NaN, 0, 96, 24)).toBe(24);
      expect(clampNumber(Number.POSITIVE_INFINITY, 0, 96, 24)).toBe(24);
   });

   it('parses number input strings with clamping', () => {
      expect(parseNumber('100', 8, 72)).toBe(72);
      expect(parseNumber('', 8, 72, 16)).toBe(16);
      expect(parseNumber('not a number', 8, 72, 16)).toBe(16);
   });

   it('clamps all four spacing sides', () => {
      expect(clampSpacing({ top: -1, right: 120, bottom: 12.4, left: 96 })).toEqual({
         top: 0,
         right: 96,
         bottom: 12,
         left: 96,
      });
   });
});

describe('column width controls', () => {
   it('preserves the edited width and lets one other column absorb the difference', () => {
      const result = distributeColumnWidths(
         [
            { widthPercent: 50, blocks: [] },
            { widthPercent: 50, blocks: [] },
         ],
         0,
         70,
      );

      expect(result.map((column) => column.widthPercent)).toEqual([70, 30]);
   });

   it('lets both other columns absorb the difference when editing the middle of three', () => {
      const result = distributeColumnWidths(
         [
            { widthPercent: 40, blocks: [] },
            { widthPercent: 30, blocks: [] },
            { widthPercent: 30, blocks: [] },
         ],
         1,
         20,
      );

      expect(result.map((column) => column.widthPercent)).toEqual([40, 20, 40]);
      expect(result.reduce((sum, column) => sum + column.widthPercent, 0)).toBe(100);
   });

   it('clamps an edited width so every other column keeps at least one percent', () => {
      const result = distributeColumnWidths(
         [
            { widthPercent: 33, blocks: [] },
            { widthPercent: 33, blocks: [] },
            { widthPercent: 34, blocks: [] },
         ],
         0,
         100,
      );

      expect(result.map((column) => column.widthPercent)).toEqual([98, 1, 1]);
      expect(result.reduce((sum, column) => sum + column.widthPercent, 0)).toBe(100);
   });
});

describe('link controls', () => {
   it('accepts https, mailto and valid merge tagged hrefs', () => {
      expect(hrefIssue('https://example.com/a?b=1')).toBeUndefined();
      expect(hrefIssue('mailto:hi@example.com')).toBeUndefined();
      expect(hrefIssue('{{ links.unsubscribe }}')).toBeUndefined();
      expect(hrefIssue('https://example.com/{{ subscriber.id }}')).toBeUndefined();
      expect(hrefIssue('{{ subscriber.meta.referral_url }}')).toBeUndefined();
   });

   it('rejects missing, relative and unsafe hrefs', () => {
      expect(hrefIssue('')).toBe('Link is required');
      expect(hrefIssue('/relative')).toBeDefined();
      expect(hrefIssue('javascript:alert(1)')).toBeDefined();
      expect(hrefIssue('http://example.com')).toBeDefined();
      expect(hrefIssue('{{ subscriber.unknown }}')).toBeDefined();
      expect(hrefIssue('{{ subscriber.meta.Bad }}')).toBeDefined();
      expect(hrefIssue('http://example.com/{{ campaign.meta.slug }}')).toBeDefined();
   });

   it('requires an absolute https image URL', () => {
      expect(imageSrcIssue('https://example.com/a.png')).toBeUndefined();
      expect(imageSrcIssue('')).toBe('Image URL is required');
      expect(imageSrcIssue('http://example.com/a.png')).toBe('Use an absolute https URL');
      expect(imageSrcIssue('/a.png')).toBe('Use an absolute https URL');
   });

   it('accepts media served over http by the local dev API', () => {
      expect(imageSrcIssue('http://localhost:8787/media/a.png')).toBeUndefined();
      expect(imageSrcIssue('http://localhost/a.png')).toBeUndefined();
      expect(imageSrcIssue('http://127.0.0.1:8787/media/a.png')).toBeUndefined();
      expect(imageSrcIssue('http://127.0.0.1/a.png')).toBeUndefined();
   });

   it('previews locally served media the same way it validates it', () => {
      expect(isHttpsUrlValue('http://localhost:8787/media/a.png')).toBe(true);
      expect(isHttpsUrlValue('https://example.com/a.png')).toBe(true);
      expect(isHttpsUrlValue('http://example.com/a.png')).toBe(false);
   });

   it('rejects http URLs that are not on the local dev host', () => {
      expect(imageSrcIssue('http://localhost.evil.test/a.png')).toBeDefined();
      expect(imageSrcIssue('http://127.0.0.2:8787/a.png')).toBeDefined();
      expect(imageSrcIssue('//localhost/a.png')).toBeDefined();
      expect(imageSrcIssue('file:///a.png')).toBeDefined();
   });
});

describe('caret insertion', () => {
   it('inserts at the caret and places the caret after the insertion', () => {
      expect(insertAtCaret('Hello world', '{{ subscriber.first_name }}', 6, 6)).toEqual({
         value: 'Hello {{ subscriber.first_name }}world',
         caret: 33,
      });
   });

   it('replaces the current selection', () => {
      expect(insertAtCaret('Hello world', 'there', 6, 11)).toEqual({
         value: 'Hello there',
         caret: 11,
      });
   });

   it('clamps out of range caret positions', () => {
      expect(insertAtCaret('Hi', '!', 99, 120)).toEqual({ value: 'Hi!', caret: 3 });
      expect(insertAtCaret('Hi', '!', -2, -1)).toEqual({ value: '!Hi', caret: 1 });
   });
});

describe('merge tag insertion', () => {
   it('wraps an allowed path as a merge tag', () => {
      expect(mergeTagInsertion('subscriber.first_name')).toBe('{{ subscriber.first_name }}');
      expect(mergeTagInsertion('links.unsubscribe')).toBe('{{ links.unsubscribe }}');
   });

   it('inserts a markdown unsubscribe link into text fields', () => {
      expect(unsubscribeInsertion('text')).toBe('[Unsubscribe]({{ links.unsubscribe }})');
   });

   it('inserts a bare unsubscribe merge tag into href fields', () => {
      expect(unsubscribeInsertion('href')).toBe('{{ links.unsubscribe }}');
   });
});
