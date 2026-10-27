import { describe, expect, it } from 'vitest';
import { AudienceError, compileAudience, parseAudienceQuery } from './index';

const SUPPRESSION = "s.status = 'subscribed' AND s.deleted_at IS NULL";

describe('compileAudience', () => {
   it('suppresses unsubscribed and deleted subscribers when the query is empty', () => {
      expect(compileAudience('')).toEqual({ sql: SUPPRESSION, params: [] });
   });

   it('treats a whitespace-only query as empty', () => {
      expect(compileAudience('   \t  ')).toEqual({ sql: SUPPRESSION, params: [] });
   });

   it('compiles an include tag to EXISTS with a bound parameter', () => {
      const { sql, params } = compileAudience('tag:newsletter');

      expect(sql).toBe(
         `${SUPPRESSION} AND EXISTS (SELECT 1 FROM subscriber_tags st JOIN tags t ON t.id = st.tag_id WHERE st.subscriber_id = s.id AND t.name = ?)`,
      );
      expect(params).toEqual(['newsletter']);
   });

   it('compiles an exclusion to NOT EXISTS with a bound parameter', () => {
      const { sql, params } = compileAudience('-tag:test');

      expect(sql).toBe(
         `${SUPPRESSION} AND NOT EXISTS (SELECT 1 FROM subscriber_tags st JOIN tags t ON t.id = st.tag_id WHERE st.subscriber_id = s.id AND t.name = ?)`,
      );
      expect(params).toEqual(['test']);
   });

   it('ands positive terms and appends exclusions with params in placeholder order', () => {
      const { sql, params } = compileAudience('tag:newsletter tag:vienna -tag:test');

      expect(sql.startsWith(`${SUPPRESSION} AND`)).toBe(true);
      expect(sql).toContain(
         'EXISTS (SELECT 1 FROM subscriber_tags st JOIN tags t ON t.id = st.tag_id WHERE st.subscriber_id = s.id AND t.name = ?)',
      );
      expect(sql).toContain(
         'AND NOT EXISTS (SELECT 1 FROM subscriber_tags st JOIN tags t ON t.id = st.tag_id WHERE st.subscriber_id = s.id AND t.name = ?)',
      );
      expect(sql.match(/\?/g)).toHaveLength(3);
      expect(params).toEqual(['newsletter', 'vienna', 'test']);
   });

   it('normalises tag names before binding', () => {
      const { params } = compileAudience('  TAG:NewsLetter   -TAG:Vienna ');
      expect(params).toEqual(['newsletter', 'vienna']);
   });

   it('rejects injection attempts instead of interpolating them', () => {
      expect(() => compileAudience("tag:newsletter') OR 1=1 --")).toThrow(AudienceError);
      expect(() => compileAudience("tag:newsletter')OR1=1--")).toThrow(AudienceError);
   });

   it('rejects unknown operators', () => {
      expect(() => compileAudience('foo:bar')).toThrow(AudienceError);
   });

   it('rejects bare words', () => {
      expect(() => compileAudience('newsletter')).toThrow(AudienceError);
   });

   it('rejects tag with no value', () => {
      expect(() => compileAudience('tag:')).toThrow(AudienceError);
   });

   it('rejects duplicate tags', () => {
      expect(() => compileAudience('tag:newsletter tag:NewsLetter')).toThrow(AudienceError);
      expect(() => compileAudience('tag:newsletter -tag:newsletter')).toThrow(AudienceError);
   });

   it('rejects more than ten include terms', () => {
      const query = Array.from({ length: 11 }, (_, i) => `tag:t${i}`).join(' ');
      expect(() => compileAudience(query)).toThrow(AudienceError);
   });

   it('accepts ten include terms', () => {
      const query = Array.from({ length: 10 }, (_, i) => `tag:t${i}`).join(' ');
      expect(compileAudience(query).params).toHaveLength(10);
   });

   it('rejects more than ten exclude terms', () => {
      const query = Array.from({ length: 11 }, (_, i) => `-tag:t${i}`).join(' ');
      expect(() => compileAudience(query)).toThrow(AudienceError);
   });

   it('rejects tags longer than 64 characters', () => {
      expect(() => compileAudience(`tag:${'a'.repeat(65)}`)).toThrow(AudienceError);
   });

   it('rejects characters outside the tag alphabet', () => {
      expect(() => compileAudience('tag:news@letter')).toThrow(AudienceError);
      expect(() => compileAudience('tag:news%letter')).toThrow(AudienceError);
      expect(() => compileAudience('tag:news/letter')).toThrow(AudienceError);
   });
});

describe('parseAudienceQuery', () => {
   it('returns normalised include and exclude names for UI chips', () => {
      expect(parseAudienceQuery('TAG:NewsLetter  -TAG:VIENNA')).toEqual({
         include: ['newsletter'],
         exclude: ['vienna'],
      });
   });

   it('returns empty arrays for an empty query', () => {
      expect(parseAudienceQuery('')).toEqual({ include: [], exclude: [] });
   });

   it('throws AudienceError on invalid input', () => {
      expect(() => parseAudienceQuery('category:news')).toThrow(AudienceError);
   });
});
