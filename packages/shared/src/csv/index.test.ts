import { describe, expect, it } from 'vitest';
import { parseSubscriberCsv } from './index';

describe('parseSubscriberCsv', () => {
   it('parses a BOM-prefixed CRLF file and normalises emails and tags', () => {
      const text =
         '\uFEFFemail,first_name,last_name,tags\r\nAda@Example.com,Ada,Lovelace,Newsletter;vienna;;\r\n';

      expect(parseSubscriberCsv(text)).toEqual({
         rows: [
            {
               line: 2,
               email: 'ada@example.com',
               first_name: 'Ada',
               last_name: 'Lovelace',
               tags: ['newsletter', 'vienna'],
               metadata: {},
            },
         ],
         errors: [],
      });
   });

   it('accepts LF line endings', () => {
      const result = parseSubscriberCsv('email\nada@example.com\n');

      expect(result.rows).toEqual([
         {
            line: 2,
            email: 'ada@example.com',
            first_name: null,
            last_name: null,
            tags: [],
            metadata: {},
         },
      ]);
      expect(result.errors).toEqual([]);
   });

   it('keeps commas inside quoted fields', () => {
      const result = parseSubscriberCsv('email,first_name\nada@example.com,"Lovelace, Ada"\n');

      expect(result.rows[0]?.first_name).toBe('Lovelace, Ada');
   });

   it('unescapes doubled quotes', () => {
      const result = parseSubscriberCsv(
         'email,first_name\nada@example.com,"Ada ""The Countess"" Lovelace"\n',
      );

      expect(result.rows[0]?.first_name).toBe('Ada "The Countess" Lovelace');
   });

   it('keeps embedded newlines and counts following lines correctly', () => {
      const text =
         'email,first_name\r\nada@example.com,"Ada\r\nLovelace"\r\nbob@example.com,Bob\r\n';
      const result = parseSubscriberCsv(text);

      expect(result.rows).toHaveLength(2);
      expect(result.rows[0]).toMatchObject({ line: 2, first_name: 'Ada\r\nLovelace' });
      expect(result.rows[1]).toMatchObject({ line: 4, email: 'bob@example.com' });
   });

   it('accepts a case-insensitive trimmed header and the e-mail alias', () => {
      const result = parseSubscriberCsv(' E-Mail , FIRST_NAME ,notes\nada@example.com,Ada,x\n');

      expect(result.rows).toEqual([
         {
            line: 2,
            email: 'ada@example.com',
            first_name: 'Ada',
            last_name: null,
            tags: [],
            metadata: {},
         },
      ]);
      expect(result.errors).toEqual([]);
   });

   it('reports a missing email column and returns no rows', () => {
      const result = parseSubscriberCsv('first_name,last_name\nAda,Lovelace\n');

      expect(result.rows).toEqual([]);
      expect(result.errors).toEqual([
         { line: 1, message: expect.stringMatching(/email column/i), raw: 'first_name,last_name' },
      ]);
   });

   it('reports missing header for empty input', () => {
      const result = parseSubscriberCsv('');

      expect(result.rows).toEqual([]);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.line).toBe(1);
   });

   it('reports an invalid email and skips that row', () => {
      const result = parseSubscriberCsv('email\nnot-an-email\nada@example.com\n');

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]).toMatchObject({ line: 3, email: 'ada@example.com' });
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toMatchObject({ line: 2, raw: 'not-an-email' });
      expect(result.errors[0]?.message).toMatch(/invalid email/i);
   });

   it('keeps duplicate emails but flags the later row', () => {
      const result = parseSubscriberCsv('email\na@example.com\nA@Example.com\n');

      expect(result.rows.map((row) => row.email)).toEqual(['a@example.com', 'a@example.com']);
      expect(result.rows.map((row) => row.line)).toEqual([2, 3]);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toMatchObject({ line: 3, raw: 'A@Example.com' });
      expect(result.errors[0]?.message).toMatch(/duplicate email/i);
   });

   it('splits, trims, lowercases and dedupes tags', () => {
      const result = parseSubscriberCsv(
         'email,tags\nada@example.com," Newsletter ; VIP ; newsletter ; ; vienna "\n',
      );

      expect(result.rows[0]?.tags).toEqual(['newsletter', 'vip', 'vienna']);
   });

   it('skips blank lines anywhere in the file', () => {
      const result = parseSubscriberCsv('\nemail\n\nada@example.com\n\n');

      expect(result.rows).toEqual([
         {
            line: 4,
            email: 'ada@example.com',
            first_name: null,
            last_name: null,
            tags: [],
            metadata: {},
         },
      ]);
      expect(result.errors).toEqual([]);
   });

   it('treats missing optional columns as null and empty tags', () => {
      const result = parseSubscriberCsv('email\nada@example.com');

      expect(result.rows[0]).toEqual({
         line: 2,
         email: 'ada@example.com',
         first_name: null,
         last_name: null,
         tags: [],
         metadata: {},
      });
   });

   it('ignores unknown headers and extra columns', () => {
      const result = parseSubscriberCsv('email,notes\nada@example.com,ignored,extra\n');

      expect(result.rows[0]?.email).toBe('ada@example.com');
      expect(result.errors).toEqual([]);
   });

   it('uses the raw record for the error line when fields are quoted', () => {
      const result = parseSubscriberCsv('email\n"bad email"\n');

      expect(result.errors[0]).toMatchObject({ line: 2, raw: '"bad email"' });
   });

   it('parses semicolon-separated metadata key/value pairs', () => {
      const result = parseSubscriberCsv(
         'email,metadata\nada@example.com,"plan=pro;signup_source=landing page"\n',
      );

      expect(result.rows[0]?.metadata).toEqual({
         plan: 'pro',
         signup_source: 'landing page',
      });
      expect(result.errors).toEqual([]);
   });

   it('allows equals signs inside a metadata value', () => {
      const result = parseSubscriberCsv(
         'email,metadata\nada@example.com,referral=https://example.com/?a=1\n',
      );

      expect(result.rows[0]?.metadata).toEqual({ referral: 'https://example.com/?a=1' });
   });

   it('reports invalid metadata keys as row errors and skips the row', () => {
      const result = parseSubscriberCsv('email,metadata\nada@example.com,"Plan=pro"\n');

      expect(result.rows).toEqual([]);
      expect(result.errors[0]).toMatchObject({ line: 2 });
      expect(result.errors[0]?.message).toMatch(/invalid metadata key/i);
   });

   it('reports reserved metadata keys as row errors', () => {
      const result = parseSubscriberCsv(
         'email,metadata\nada@example.com,email=other@example.com\n',
      );

      expect(result.rows).toEqual([]);
      expect(result.errors[0]?.message).toMatch(/reserved/i);
   });

   it('reports a metadata entry without an equals sign', () => {
      const result = parseSubscriberCsv('email,metadata\nada@example.com,plan\n');

      expect(result.rows).toEqual([]);
      expect(result.errors[0]?.message).toMatch(/key=value/i);
   });

   it('reports oversized metadata values as row errors', () => {
      const value = 'a'.repeat(1025);
      const result = parseSubscriberCsv(`email,metadata\nada@example.com,plan=${value}\n`);

      expect(result.rows).toEqual([]);
      expect(result.errors[0]?.message).toMatch(/1024/);
   });
});
