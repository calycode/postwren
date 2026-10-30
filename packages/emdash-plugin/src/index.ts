import type { PluginDescriptor, SettingField, SettingsAccess } from 'emdash';

/** Where EmDash mounts this plugin's API routes. */
export const ROUTE_BASE = '/_emdash/api/plugins/mailer';

/** Provenance label sent to the Worker so signups can be told apart from other sources. */
export const SIGNUP_SOURCE = 'emdash';

export interface MailerPluginOptions {
   /** Public origin of the Mailer Worker, e.g. `https://mail.example.com`. Also the only allowed host. */
   workerUrl: string;
   /** Fallback tags applied to every signup. The Settings value overrides this. */
   defaultTags?: string[];
}

export interface MailerSettings {
   workerUrl: string;
   siteKey: string;
   defaultTags: string[];
   signupFormEnabled: boolean;
   signupFormHeading: string;
}

export const SETTING_DEFAULTS = {
   workerUrl: '',
   siteKey: '',
   defaultTags: '',
   signupFormEnabled: false,
   signupFormHeading: 'Newsletter',
} as const;

export const SETTINGS_SCHEMA: Record<string, SettingField> = {
   workerUrl: {
      type: 'url',
      label: 'Mailer Worker URL',
      description:
         'Public origin of the Mailer Worker. Must match the workerUrl passed to mailerPlugin() in astro.config.mjs, because that value fixes the plugin network allowlist.',
      placeholder: 'https://mail.example.com',
   },
   siteKey: {
      type: 'secret',
      label: 'Publishable subscribe key',
      description:
         'A pk_live_ key from the Mailer admin: Settings → Public subscribe keys. Stored encrypted by EmDash and never sent to the browser.',
   },
   defaultTags: {
      type: 'string',
      label: 'Default tags',
      description: 'Comma-separated tags added to every signup, e.g. "newsletter, site".',
   },
   signupFormEnabled: {
      type: 'boolean',
      label: 'Inject the signup form',
      description:
         'Adds a signup form to the end of every public page at render time. Templates must render <EmDashBodyEnd />.',
      default: SETTING_DEFAULTS.signupFormEnabled,
   },
   signupFormHeading: {
      type: 'string',
      label: 'Signup form heading',
      default: SETTING_DEFAULTS.signupFormHeading,
   },
};

export function normaliseWorkerUrl(value: string): string {
   const trimmed = value.trim().replace(/\/+$/, '');
   if (trimmed.length === 0) throw new Error('mailerPlugin() requires a workerUrl.');
   let url: URL;
   try {
      url = new URL(trimmed);
   } catch {
      throw new Error(`mailerPlugin() received an invalid workerUrl: "${value}".`);
   }
   if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      throw new Error('mailerPlugin() requires an http or https workerUrl.');
   }
   return trimmed;
}

export function parseTags(value: string): string[] {
   return value
      .split(',')
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);
}

/**
 * Read settings with descriptor defaults applied. EmDash does not materialise
 * `settingsSchema` defaults, so every read must fall back explicitly.
 */
export async function readSettings(
   settings: SettingsAccess,
   options: { workerUrl: string; defaultTags: string[] },
): Promise<MailerSettings> {
   const [workerUrl, siteKey, defaultTags, signupFormEnabled, signupFormHeading] = await Promise.all([
      settings.get<string>('workerUrl'),
      settings.get<string>('siteKey'),
      settings.get<string>('defaultTags'),
      settings.get<boolean>('signupFormEnabled'),
      settings.get<string>('signupFormHeading'),
   ]);

   const tags = defaultTags === null ? options.defaultTags : parseTags(defaultTags);

   return {
      workerUrl: safeWorkerUrl(workerUrl, options.workerUrl),
      siteKey: typeof siteKey === 'string' ? siteKey.trim() : '',
      defaultTags: tags,
      signupFormEnabled: signupFormEnabled === true,
      signupFormHeading:
         typeof signupFormHeading === 'string' && signupFormHeading.trim().length > 0
            ? signupFormHeading.trim()
            : SETTING_DEFAULTS.signupFormHeading,
   };
}

/** A half-typed URL in the settings form must not break page rendering. */
function safeWorkerUrl(value: string | null, fallback: string): string {
   if (value === null || value.trim().length === 0) return fallback;

   try {
      return normaliseWorkerUrl(value);
   } catch {
      return fallback;
   }
}

/**
 * Phase 1 registers no admin page and no admin entry: EmDash renders the
 * settings form from `settingsSchema`, and `overview` answers status calls.
 */
export function mailerPlugin(options: MailerPluginOptions): PluginDescriptor<MailerPluginOptions> {
   const workerUrl = normaliseWorkerUrl(options.workerUrl);
   const resolved: MailerPluginOptions = {
      workerUrl,
      defaultTags: options.defaultTags ?? [],
   };

   return {
      id: 'mailer',
      version: '0.1.0',
      format: 'native',
      entrypoint: '@mailer/emdash/plugin',
      options: resolved,
      capabilities: ['network:request', 'hooks.page-fragments:register'],
      allowedHosts: [new URL(workerUrl).host],
      settingsSchema: SETTINGS_SCHEMA,
   };
}
