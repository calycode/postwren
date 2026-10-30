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

describe('metadata audience terms', () => {
   const META_EXISTS =
      'EXISTS (SELECT 1 FROM subscriber_metadata sm WHERE sm.subscriber_id = s.id AND sm.key = ? AND sm.value = ?)';
   const META_NOT_EXISTS =
      'NOT EXISTS (SELECT 1 FROM subscriber_metadata sm WHERE sm.subscriber_id = s.id AND sm.key = ? AND sm.value = ?)';

   it('compiles an exact metadata match to a parameterised EXISTS', () => {
      const { sql, params } = compileAudience('meta:plan=pro');

      expect(sql).toBe(`${SUPPRESSION} AND ${META_EXISTS}`);
      expect(params).toEqual(['plan', 'pro']);
   });

   it('compiles a negated metadata term to NOT EXISTS', () => {
      const { sql, params } = compileAudience('-meta:plan=pro');

      expect(sql).toBe(`${SUPPRESSION} AND ${META_NOT_EXISTS}`);
      expect(params).toEqual(['plan', 'pro']);
   });

   it('keeps tag behaviour and binds parameters in placeholder order', () => {
      const { sql, params } = compileAudience(
         'tag:newsletter meta:plan=pro -tag:test -meta:plan=free',
      );

      expect(sql).toContain('EXISTS (SELECT 1 FROM subscriber_tags');
      expect(sql).toContain('NOT EXISTS (SELECT 1 FROM subscriber_tags');
      expect(sql).toContain(META_EXISTS);
      expect(sql).toContain(META_NOT_EXISTS);
      expect(sql.match(/\?/g)).toHaveLength(6);
      expect(params).toEqual(['newsletter', 'plan', 'pro', 'test', 'plan', 'free']);
   });

   it('accepts an equals sign and url characters inside the value', () => {
      const { params } = compileAudience('meta:referral=https://example.com/?a=1&b=2');
      expect(params).toEqual(['referral', 'https://example.com/?a=1&b=2']);
   });

   it('rejects duplicate metadata terms', () => {
      expect(() => compileAudience('meta:plan=pro meta:plan=pro')).toThrow(AudienceError);
      expect(() => compileAudience('meta:plan=pro -meta:plan=pro')).toThrow(AudienceError);
   });

   it('rejects a missing key or value', () => {
      expect(() => compileAudience('meta:=pro')).toThrow(AudienceError);
      expect(() => compileAudience('meta:plan=')).toThrow(AudienceError);
      expect(() => compileAudience('meta:plan')).toThrow(AudienceError);
   });

   it('rejects invalid metadata keys', () => {
      expect(() => compileAudience('meta:Plan=pro')).toThrow(AudienceError);
      expect(() => compileAudience('meta:1plan=pro')).toThrow(AudienceError);
      expect(() => compileAudience('meta:plan-name=pro')).toThrow(AudienceError);
   });

   it('rejects values longer than 1024 characters', () => {
      expect(() => compileAudience(`meta:plan=${'a'.repeat(1025)}`)).toThrow(AudienceError);
      expect(compileAudience(`meta:plan=${'a'.repeat(1024)}`).params).toHaveLength(2);
   });

   it('binds injection attempts instead of interpolating them', () => {
      const payload = "pro') OR 1=1 --";
      const { sql, params } = compileAudience(`meta:plan=${payload.replace(/\s+/g, '')}`);

      expect(sql).not.toContain('OR 1=1');
      expect(sql.match(/\?/g)).toHaveLength(2);
      expect(params[1]).toBe(payload.replace(/\s+/g, ''));

      expect(() => compileAudience(`meta:plan=${payload}`)).toThrow(AudienceError);
   });

   it('rejects more than ten metadata terms per side', () => {
      const include = Array.from({ length: 11 }, (_, i) => `meta:k${i}=v`).join(' ');
      const exclude = Array.from({ length: 11 }, (_, i) => `-meta:k${i}=v`).join(' ');

      expect(() => compileAudience(include)).toThrow(AudienceError);
      expect(() => compileAudience(exclude)).toThrow(AudienceError);
   });
});

describe('parseAudienceQuery', () => {
   it('returns normalised include and exclude names for UI chips', () => {
      expect(parseAudienceQuery('TAG:NewsLetter  -TAG:VIENNA')).toEqual({
         include: ['newsletter'],
         exclude: ['vienna'],
         metaInclude: [],
         metaExclude: [],
      });
   });

   it('returns empty arrays for an empty query', () => {
      expect(parseAudienceQuery('')).toEqual({
         include: [],
         exclude: [],
         metaInclude: [],
         metaExclude: [],
      });
   });

   it('throws AudienceError on invalid input', () => {
      expect(() => parseAudienceQuery('category:news')).toThrow(AudienceError);
   });
});
