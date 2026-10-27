import { describe, expect, it } from 'vitest';
import { parseEnvelope } from './envelope';

describe('parseEnvelope', () => {
   it('unwraps data and keeps pagination meta', () => {
      const result = parseEnvelope<{ id: string }>(
         {
            data: { id: 'sub_1' },
            error: null,
            meta: { nextCursor: 'abc', hasMore: true, requestId: 'req_1' },
         },
         200,
      );

      expect(result).toEqual({
         ok: true,
         data: { id: 'sub_1' },
         meta: { nextCursor: 'abc', hasMore: true, requestId: 'req_1' },
      });
   });

   it('defaults meta when the response is not paginated', () => {
      const result = parseEnvelope<string[]>({ data: ['a'], error: null }, 200);

      expect(result).toEqual({
         ok: true,
         data: ['a'],
         meta: { nextCursor: null, hasMore: false },
      });
   });

   it('maps an error envelope to a failure with status, code, message and details', () => {
      const result = parseEnvelope(
         {
            data: null,
            error: {
               code: 'validation_error',
               message: 'Email is invalid',
               details: { fields: { email: 'Enter a valid email' } },
            },
         },
         422,
      );

      expect(result).toEqual({
         ok: false,
         status: 422,
         error: {
            code: 'validation_error',
            message: 'Email is invalid',
            details: { fields: { email: 'Enter a valid email' } },
         },
      });
   });

   it('rejects a success envelope with no data key', () => {
      const result = parseEnvelope({ error: null }, 200);

      expect(result).toEqual({
         ok: false,
         status: 200,
         error: { code: 'invalid_response', message: 'Response envelope is missing data' },
      });
   });

   it('rejects payloads that are not objects', () => {
      expect(parseEnvelope('nope', 500)).toEqual({
         ok: false,
         status: 500,
         error: { code: 'invalid_response', message: 'Unexpected response from the server' },
      });
   });

   it('rejects a malformed error envelope', () => {
      expect(parseEnvelope({ data: null, error: 'bad' }, 500)).toEqual({
         ok: false,
         status: 500,
         error: { code: 'invalid_response', message: 'Unexpected error envelope from the server' },
      });
   });
});
