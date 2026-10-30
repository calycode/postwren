import { PluginRouteError, definePlugin } from 'emdash';
import type { PluginContext } from 'emdash';
import { SETTINGS_SCHEMA, normaliseWorkerUrl, readSettings } from './index';
import type { MailerPluginOptions } from './index';
import { signupFormFragments } from './form';
import { checkConnection, subscribe } from './signup';
import type { FetchLike, SignupInput, SubscribeSettings } from './signup';

function isRecord(value: unknown): value is Record<string, unknown> {
   return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fetchFor(ctx: PluginContext): FetchLike {
   const http = ctx.http;
   if (http === undefined) {
      throw new PluginRouteError(
         'NETWORK_UNAVAILABLE',
         'The mailer plugin needs the network:request capability.',
         500,
      );
   }

   return (url, init) => http.fetch(url, init);
}

function subscribeSettings(
   settings: Awaited<ReturnType<typeof readSettings>>,
   options: MailerPluginOptions,
): SubscribeSettings {
   return {
      workerUrl: settings.workerUrl,
      siteKey: settings.siteKey,
      allowedHost: new URL(normaliseWorkerUrl(options.workerUrl)).host,
      defaultTags: settings.defaultTags,
   };
}

export function createPlugin(input: MailerPluginOptions) {
   const options: MailerPluginOptions = {
      workerUrl: normaliseWorkerUrl(input.workerUrl),
      defaultTags: input.defaultTags ?? [],
   };

   const loadSettings = (ctx: PluginContext) =>
      readSettings(ctx.settings, {
         workerUrl: options.workerUrl,
         defaultTags: options.defaultTags ?? [],
      });

   return definePlugin({
      id: 'mailer',
      version: '0.1.0',
      capabilities: ['network:request', 'hooks.page-fragments:register'],
      allowedHosts: [new URL(options.workerUrl).host],
      admin: { settingsSchema: SETTINGS_SCHEMA },
      routes: {
        /**
         * Public signup. The browser talks to this route so the publishable key stays
         * on the server and the Worker sees a stable server-to-server request.
         */
         signup: {
            public: true,
            methods: ['POST'],
            request: { body: 'json', maxBytes: 8 * 1024 },
            handler: async (ctx) => {
               const settings = await loadSettings(ctx);
               const body: SignupInput = isRecord(ctx.input) ? ctx.input : {};

               return subscribe(
                  { settings: subscribeSettings(settings, options), fetch: fetchFor(ctx) },
                  body,
               );
            },
         },

         /** Status for the settings page and scripts. Never returns the key. */
         overview: {
            permission: 'plugins:read',
            methods: ['GET'],
            handler: async (ctx) => {
               const settings = await loadSettings(ctx);

               return {
                  workerUrl: settings.workerUrl,
                  configured: settings.workerUrl.length > 0 && settings.siteKey.length > 0,
                  defaultTags: settings.defaultTags,
               };
            },
         },

         testConnection: {
            permission: 'plugins:manage',
            methods: ['POST'],
            handler: async (ctx) => {
               const settings = await loadSettings(ctx);

               return checkConnection({
                  settings: subscribeSettings(settings, options),
                  fetch: fetchFor(ctx),
               });
            },
         },
      },
      hooks: {
         /** Opt-in footer form. Templates must render <EmDashBodyEnd /> for this to appear. */
         'page:fragments': {
            // A form must never take a public page down with it.
            errorPolicy: 'continue',
            timeout: 2000,
            handler: async (_event, ctx) => {
               const settings = await loadSettings(ctx);
               if (!settings.signupFormEnabled) return null;

               return signupFormFragments({ heading: settings.signupFormHeading });
            },
         },
      },
   });
}

export default createPlugin;
