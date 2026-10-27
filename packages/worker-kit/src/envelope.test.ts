import { describe, expect, it } from 'vitest';
import { fail, ok, paginated } from './envelope';

type Body = {
   data: unknown;
   error: { code: string; message: string; details?: unknown } | null;
   meta?: { requestId?: string; nextCursor?: string | null; hasMore?: boolean };
};

async function body(response: Response): Promise<Body> {
   return (await response.json()) as Body;
}

describe('ok', () => {
   it('wraps data in a success envelope', async () => {
      const response = ok({ id: 'sub_1' });

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8');
      expect(await body(response)).toEqual({ data: { id: 'sub_1' }, error: null });
   });

   it('supports an alternate status and a request id', async () => {
      const response = ok({ id: 'sub_1' }, { status: 201, requestId: 'req_1' });

      expect(response.status).toBe(201);
      expect(await body(response)).toEqual({
         data: { id: 'sub_1' },
         error: null,
         meta: { requestId: 'req_1' },
      });
   });

   it('omits meta when no request id is provided', async () => {
      const parsed = await body(ok(null));
      expect(parsed).not.toHaveProperty('meta');
   });
});

describe('paginated', () => {
   it('includes the cursor and hasMore meta', async () => {
      const response = paginated([{ id: 1 }], { nextCursor: 'abc', hasMore: true });

      expect(response.status).toBe(200);
      expect(await body(response)).toEqual({
         data: [{ id: 1 }],
         error: null,
         meta: { nextCursor: 'abc', hasMore: true },
      });
   });

   it('includes a request id when provided', async () => {
      const parsed = await body(
         paginated([], { nextCursor: null, hasMore: false, requestId: 'req_2' }),
      );

      expect(parsed.meta).toEqual({ nextCursor: null, hasMore: false, requestId: 'req_2' });
   });
});

describe('fail', () => {
   it('wraps an error in a failure envelope', async () => {
      const response = fail(404, 'not_found', 'No campaign');

      expect(response.status).toBe(404);
      expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8');
      expect(await body(response)).toEqual({
         data: null,
         error: { code: 'not_found', message: 'No campaign' },
      });
   });

   it('includes details and a request id when provided', async () => {
      const parsed = await body(
         fail(400, 'validation_error', 'Bad input', { field: 'email' }, 'req_3'),
      );

      expect(parsed).toEqual({
         data: null,
         error: { code: 'validation_error', message: 'Bad input', details: { field: 'email' } },
         meta: { requestId: 'req_3' },
      });
   });

   it('omits details when undefined', async () => {
      const parsed = await body(fail(500, 'internal_error', 'Oops', undefined));
      expect(parsed.error).not.toHaveProperty('details');
   });

   it('never throws on unserialisable details', async () => {
      const circular: Record<string, unknown> = {};
      circular.self = circular;

      const response = fail(400, 'validation_error', 'Bad input', circular);
      const parsed = await body(response);

      expect(response.status).toBe(500);
      expect(parsed.error?.code).toBe('internal_error');
   });

   it('does not throw for body-forbidden statuses', async () => {
      const response = ok(null, { status: 204 });

      expect(response.status).toBe(204);
      await expect(response.text()).resolves.toBe('');
   });
});
