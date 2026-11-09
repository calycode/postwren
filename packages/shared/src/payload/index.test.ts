import { describe, expect, it } from 'vitest';
import { PAYLOAD_MAX_ITEMS, parsePayload, parsePayloadJson } from './index';

describe('campaign payload', () => {
   it('accepts named lists of flat objects', () => {
      expect(
         parsePayload({
            posts: [
               { title: 'First', url: 'https://example.com/first', published: 1767225600 },
               { title: 'Second', draft: false, note: null },
            ],
         }),
      ).toEqual({
         ok: true,
         data: {
            posts: [
               { title: 'First', url: 'https://example.com/first', published: 1767225600 },
               { title: 'Second', draft: false, note: null },
            ],
         },
      });
   });

   it('rejects a root array', () => {
      expect(parsePayload([{ title: 'First' }])).toEqual({
         ok: false,
         errors: ['Data must be a JSON object'],
      });
   });

   it('rejects nested objects and arrays in an item', () => {
      const result = parsePayload({
         posts: [{ title: 'Bad', detail: { nested: true }, tags: ['a'] }],
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
         expect(result.errors).toEqual(
            expect.arrayContaining([
               expect.stringContaining('detail'),
               expect.stringContaining('tags'),
            ]),
         );
      }
   });

   it('caps item count and key grammar', () => {
      const many = parsePayload({
         posts: Array.from({ length: PAYLOAD_MAX_ITEMS + 1 }, () => ({ title: 'Post' })),
      });
      expect(many.ok).toBe(false);
      if (!many.ok) expect(many.errors[0]).toContain('at most');

      const badKey = parsePayload({ 'Bad-Key': [] });
      expect(badKey.ok).toBe(false);
   });

   it('treats corrupt stored JSON as empty data', () => {
      expect(parsePayloadJson('{')).toEqual({});
      expect(parsePayloadJson('')).toEqual({});
      expect(parsePayloadJson('{"posts":[{"title":"First"}]}')).toEqual({
         posts: [{ title: 'First' }],
      });
   });
});
