import { PluginRouteError } from 'emdash';
import { describe, expect, it } from 'vitest';
import { checkConnection, mergeTags, subscribe } from '../src/signup';
import type { FetchLike, SubscribeSettings } from '../src/signup';

const SETTINGS: SubscribeSettings = {
   workerUrl: 'https://mail.example.com',
   siteKey: 'pk_live_test_0123456789',
   allowedHost: 'mail.example.com',
   defaultTags: ['newsletter'],
};

type RecordedCall = { url: string; init: RequestInit };

function recorder(status = 200, body = '{"data":{"subscribed":true},"error":null}'): {
   calls: RecordedCall[];
   fetch: FetchLike;
} {
   const calls: RecordedCall[] = [];
   const fetch: FetchLike = async (url, init) => {
      calls.push({ url, init: init ?? {} });
      return new Response(body, { status });
   };

   return { calls, fetch };
}

function failingFetch(message = 'not found'): FetchLike {
   return async () => {
      throw new TypeError(message);
   };
}

async function captureError(run: () => Promise<unknown>): Promise<PluginRouteError> {
   try {
      await run();
   } catch (error) {
      if (error instanceof PluginRouteError) return error;
      throw error;
   }

   throw new Error('Expected the call to fail');
}

async function sentBody(call: RecordedCall): Promise<Record<string, unknown>> {
   return JSON.parse(String(call.init.body)) as Record<string, unknown>;
}

function headersOf(call: RecordedCall): Record<string, string> {
   return call.init.headers as Record<string, string>;
}
describe('subscribe', () => {
   it('forwards a signup to the Worker with the key in an authorization header', async () => {
      const { calls, fetch } = recorder();

      await subscribe({ settings: SETTINGS, fetch }, { email: 'ada@example.com' });

      expect(calls).toHaveLength(1);
      expect(calls[0]?.url).toBe('https://mail.example.com/api/public/subscribe');
      expect(calls[0]?.init.method).toBe('POST');
      expect(headersOf(calls[0]!)).toMatchObject({
         authorization: `Bearer ${SETTINGS.siteKey}`,
         'content-type': 'application/json',
      });
      expect(headersOf(calls[0]!).authorization).not.toBe(SETTINGS.siteKey);
   });

   it('normalises the email before forwarding it', async () => {
      const { calls, fetch } = recorder();

      await subscribe({ settings: SETTINGS, fetch }, { email: '  Ada@Example.COM  ' });

      expect((await sentBody(calls[0]!)).email).toBe('ada@example.com');
   });

   it('marks the signup as coming from EmDash', async () => {
      const { calls, fetch } = recorder();

      await subscribe({ settings: SETTINGS, fetch }, { email: 'ada@example.com' });

      expect((await sentBody(calls[0]!)).source).toBe('emdash');
   });

   it('serves a valid signup without exposing whether the subscriber already existed', async () => {
      const { fetch } = recorder(200, '{"data":{"subscribed":true,"created":false},"error":null}');

      await expect(subscribe({ settings: SETTINGS, fetch }, { email: 'ada@example.com' })).resolves.toEqual(
         { subscribed: true },
      );
   });

   it('merges default and submitted tags without duplicates', async () => {
      const { calls, fetch } = recorder();

      await subscribe(
         { settings: SETTINGS, fetch },
         { email: 'ada@example.com', tags: ['newsletter', 'VIP', 'vip', ' site '] },
      );

      expect((await sentBody(calls[0]!)).tags).toEqual(['newsletter', 'VIP', 'site']);
   });

   it('keeps default tags when the form submits none', async () => {
      const { calls, fetch } = recorder();

      await subscribe({ settings: SETTINGS, fetch }, { email: 'ada@example.com' });

      expect((await sentBody(calls[0]!)).tags).toEqual(['newsletter']);
   });

   it('passes metadata through unchanged', async () => {
      const { calls, fetch } = recorder();
      const metadata = { signup_source: 'emdash-form', plan: 'free' };

      await subscribe({ settings: SETTINGS, fetch }, { email: 'ada@example.com', metadata });

      expect((await sentBody(calls[0]!)).metadata).toEqual(metadata);
   });

   it('drops metadata entries the Worker would reject instead of failing the signup', async () => {
      const { calls, fetch } = recorder();

      await subscribe(
         { settings: SETTINGS, fetch },
         { email: 'ada@example.com', metadata: { ok_key: 'yes', 'Bad-Key': 'no', email: 'reserved' } },
      );

      expect((await sentBody(calls[0]!)).metadata).toEqual({ ok_key: 'yes' });
   });

   it('forwards a valid sourceUrl and ignores an invalid one', async () => {
      const valid = recorder();
      await subscribe(
         { settings: SETTINGS, fetch: valid.fetch },
         { email: 'ada@example.com', sourceUrl: 'https://example.com/newsletter?x=1' },
      );
      expect((await sentBody(valid.calls[0]!)).sourceUrl).toBe(
         'https://example.com/newsletter?x=1',
      );

      const invalid = recorder();
      await subscribe(
         { settings: SETTINGS, fetch: invalid.fetch },
         { email: 'ada@example.com', sourceUrl: 'javascript:alert(1)' },
      );
      expect(await sentBody(invalid.calls[0]!)).not.toHaveProperty('sourceUrl');
   });

   it('answers a filled honeypot with success and sends nothing', async () => {
      const { calls, fetch } = recorder();

      const result = await subscribe(
         { settings: SETTINGS, fetch },
         { email: 'bot@example.com', website: 'https://spam.example' },
      );

      expect(result).toEqual({ subscribed: true });
      expect(calls).toHaveLength(0);
   });

   it('rejects a malformed email without calling the Worker', async () => {
      const { calls, fetch } = recorder();

      const error = await captureError(() =>
         subscribe({ settings: SETTINGS, fetch }, { email: 'not-an-email' }),
      );

      expect(error.status).toBe(422);
      expect(error.code).toBe('INVALID_EMAIL');
      expect(calls).toHaveLength(0);
   });

   it('refuses to run before a key is configured', async () => {
      const { calls, fetch } = recorder();

      const error = await captureError(() =>
         subscribe({ settings: { ...SETTINGS, siteKey: '' }, fetch }, { email: 'ada@example.com' }),
      );

      expect(error.status).toBe(502);
      expect(error.code).toBe('WORKER_NOT_CONFIGURED');
      expect(calls).toHaveLength(0);
   });

   it('refuses a settings URL whose host the plugin is not allowed to reach', async () => {
      const { calls, fetch } = recorder();

      const error = await captureError(() =>
         subscribe(
            { settings: { ...SETTINGS, workerUrl: 'https://other.example.com' }, fetch },
            { email: 'ada@example.com' },
         ),
      );

      expect(error.code).toBe('WORKER_NOT_CONFIGURED');
      expect(calls).toHaveLength(0);
   });

   it.each<[number, string, number]>([
      [429, 'RATE_LIMITED', 429],
      [401, 'WORKER_NOT_CONFIGURED', 502],
      [403, 'WORKER_NOT_CONFIGURED', 502],
      [422, 'INVALID_EMAIL', 422],
      [500, 'SUBSCRIBE_FAILED', 502],
      [503, 'SUBSCRIBE_FAILED', 502],
   ])('maps an upstream %i to %s/%i', async (status, code, expectedStatus) => {
      const { fetch } = recorder(status, '{"data":null,"error":{"message":"upstream detail"}}');

      const error = await captureError(() =>
         subscribe({ settings: SETTINGS, fetch }, { email: 'ada@example.com' }),
      );

      expect(error.code).toBe(code);
      expect(error.status).toBe(expectedStatus);
   });

   it('maps a network failure to a retryable failure', async () => {
      const error = await captureError(() =>
         subscribe({ settings: SETTINGS, fetch: failingFetch() }, { email: 'ada@example.com' }),
      );

      expect(error.code).toBe('SUBSCRIBE_FAILED');
      expect(error.status).toBe(502);
   });

   it('never leaks the key or the upstream body in an error', async () => {
      for (const status of [401, 403, 422, 429, 500]) {
         const { fetch } = recorder(status, `{"error":{"message":"${SETTINGS.siteKey}"}}`);

         const error = await captureError(() =>
            subscribe({ settings: SETTINGS, fetch }, { email: 'ada@example.com' }),
         );

         expect(error.message).not.toContain(SETTINGS.siteKey);
         expect(error.message).not.toContain('pk_live');
         expect(error.message).not.toContain('subscribed');
      }
   });
});

describe('checkConnection', () => {
   it('reports the Worker health status', async () => {
      const { calls, fetch } = recorder(200, '{"data":{"status":"ok"},"error":null}');

      await expect(checkConnection({ settings: SETTINGS, fetch })).resolves.toEqual({
         ok: true,
         status: 200,
      });
      expect(calls[0]?.url).toBe('https://mail.example.com/api/health');
   });

   it('reports a non-2xx answer without throwing', async () => {
      const { fetch } = recorder(503, '{"data":null,"error":{"message":"unavailable"}}');

      await expect(checkConnection({ settings: SETTINGS, fetch })).resolves.toMatchObject({
         ok: false,
         status: 503,
      });
   });

   it('explains a network failure', async () => {
      const result = await checkConnection({ settings: SETTINGS, fetch: failingFetch() });

      expect(result.ok).toBe(false);
      expect(result.status).toBe(0);
      expect(result.message).toContain('Could not reach');
   });

   it('asks for configuration instead of calling the Worker', async () => {
      const { calls, fetch } = recorder();

      const result = await checkConnection({ settings: { ...SETTINGS, siteKey: '' }, fetch });

      expect(result.ok).toBe(false);
      expect(calls).toHaveLength(0);
   });
});

describe('mergeTags', () => {
   it('drops tags that the Worker would reject', () => {
      const long = 'x'.repeat(65);

      expect(mergeTags(['a'], ['', '  ', long, 'b'])).toEqual(['a', 'b']);
   });

   it('caps the tag list at twenty entries', () => {
      const submitted = Array.from({ length: 30 }, (_value, index) => `tag-${index}`);

      expect(mergeTags([], submitted)).toHaveLength(20);
   });
});
