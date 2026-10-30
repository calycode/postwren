import type { PluginContext, RouteContext, SettingsAccess } from 'emdash';
import { describe, expect, it } from 'vitest';
import { createPlugin } from '../src/plugin';
import type { FetchLike } from '../src/signup';

type RecordedCall = { url: string; init: RequestInit };

function fakeSettings(values: Record<string, unknown>): SettingsAccess {
   return {
      async get<T>(key: string): Promise<T | null> {
         return key in values ? (values[key] as T) : null;
      },
      async getVersioned() {
         return null;
      },
      async compareAndSet() {
         return { applied: false } as const;
      },
      async compareAndDelete() {
         return { applied: false };
      },
      async set() {
         return undefined;
      },
      async delete() {
         return false;
      },
      async list() {
         return [];
      },
   };
}

function fakeContext(
   values: Record<string, unknown>,
   input: unknown,
   calls: RecordedCall[],
   status = 200,
): RouteContext {
   const fetch: FetchLike = async (url, init) => {
      calls.push({ url, init: init ?? {} });
      return new Response('{"data":{"subscribed":true},"error":null}', { status });
   };

   return {
      input,
      settings: fakeSettings(values),
      http: { fetch },
      log: { debug() {}, info() {}, warn() {}, error() {} },
   } as unknown as RouteContext;
}

const BASE = { workerUrl: 'https://mail.example.com', siteKey: 'pk_live_from_settings' };

describe('createPlugin', () => {
   it('resolves a definition EmDash accepts', () => {
      const plugin = createPlugin({ workerUrl: 'https://mail.example.com' });

      expect(plugin.id).toBe('mailer');
      expect(plugin.capabilities).toContain('network:request');
      expect(plugin.capabilities).toContain('hooks.page-fragments:register');
      expect(plugin.allowedHosts).toEqual(['mail.example.com']);
      expect(Object.keys(plugin.routes)).toEqual(['signup', 'overview', 'testConnection']);
      expect(plugin.hooks['page:fragments']?.handler).toBeTypeOf('function');
   });

   it('declares the settings form on the definition, where EmDash reads it', () => {
      const plugin = createPlugin({ workerUrl: 'https://mail.example.com' });

      expect(plugin.admin.settingsSchema?.siteKey?.type).toBe('secret');
   });

   it('exposes the signup route as a public POST with a bounded JSON body', () => {
      const plugin = createPlugin({ workerUrl: 'https://mail.example.com' });
      const route = plugin.routes.signup;

      expect(route?.public).toBe(true);
      expect(route?.methods).toEqual(['POST']);
      expect(route?.request).toEqual({ body: 'json', maxBytes: 8 * 1024 });
   });

   it('requires an EmDash permission for the status routes', () => {
      const plugin = createPlugin({ workerUrl: 'https://mail.example.com' });

      expect(plugin.routes.overview?.permission).toBe('plugins:read');
      expect(plugin.routes.testConnection?.permission).toBe('plugins:manage');
   });
});

describe('signup route', () => {
   it('forwards with the key from settings, not from the request body', async () => {
      const plugin = createPlugin({ workerUrl: 'https://mail.example.com' });
      const calls: RecordedCall[] = [];
      const ctx = fakeContext(
         { ...BASE, defaultTags: 'newsletter, site' },
         { email: 'ada@example.com', tags: ['vip'], siteKey: 'sk_attacker' },
         calls,
      );

      await expect(plugin.routes.signup!.handler(ctx)).resolves.toEqual({ subscribed: true });

      expect(calls).toHaveLength(1);
      expect((calls[0]?.init.headers as Record<string, string>).authorization).toBe(
         'Bearer pk_live_from_settings',
      );
      const body = JSON.parse(String(calls[0]?.init.body)) as Record<string, unknown>;
      expect(body).not.toHaveProperty('siteKey');
      expect(body.tags).toEqual(['newsletter', 'site', 'vip']);
   });

   it('falls back to the descriptor workerUrl when the setting is empty', async () => {
      const plugin = createPlugin({ workerUrl: 'https://mail.example.com' });
      const calls: RecordedCall[] = [];
      const ctx = fakeContext({ siteKey: 'pk_live_from_settings' }, { email: 'ada@example.com' }, calls);

      await plugin.routes.signup!.handler(ctx);

      expect(calls[0]?.url).toBe('https://mail.example.com/api/public/subscribe');
   });

   it('treats a non-object body as an empty signup instead of throwing a 500', async () => {
      const plugin = createPlugin({ workerUrl: 'https://mail.example.com' });
      const calls: RecordedCall[] = [];
      const ctx = fakeContext(BASE, 'not-an-object', calls);

      await expect(plugin.routes.signup!.handler(ctx)).rejects.toMatchObject({
         code: 'INVALID_EMAIL',
         status: 422,
      });
      expect(calls).toHaveLength(0);
   });
});

describe('overview route', () => {
   it('reports configuration without the key', async () => {
      const plugin = createPlugin({ workerUrl: 'https://mail.example.com' });
      const ctx = fakeContext({ ...BASE, defaultTags: 'newsletter' }, undefined, []);

      await expect(plugin.routes.overview!.handler(ctx)).resolves.toEqual({
         workerUrl: 'https://mail.example.com',
         configured: true,
         defaultTags: ['newsletter'],
      });
   });

   it('reports an unconfigured site', async () => {
      const plugin = createPlugin({ workerUrl: 'https://mail.example.com' });
      const ctx = fakeContext({}, undefined, []);

      await expect(plugin.routes.overview!.handler(ctx)).resolves.toMatchObject({
         configured: false,
      });
   });
});

describe('page:fragments hook', () => {
   function hookContext(values: Record<string, unknown>): PluginContext {
      return { settings: fakeSettings(values) } as unknown as PluginContext;
   }

   it('injects nothing until the form is enabled', async () => {
      const plugin = createPlugin({ workerUrl: 'https://mail.example.com' });
      const handler = plugin.hooks['page:fragments']!.handler;

      await expect(handler({ page: {} } as never, hookContext({}))).resolves.toBeNull();
   });

   it('injects the form with the configured heading', async () => {
      const plugin = createPlugin({ workerUrl: 'https://mail.example.com' });
      const handler = plugin.hooks['page:fragments']!.handler;

      const fragments = await handler(
         { page: {} } as never,
         hookContext({ signupFormEnabled: true, signupFormHeading: 'Weekly digest' }),
      );

      expect(Array.isArray(fragments)).toBe(true);
      expect(JSON.stringify(fragments)).toContain('Weekly digest');
   });
});
