import type { SettingsAccess } from 'emdash';
import { describe, expect, it } from 'vitest';
import {
   SETTINGS_SCHEMA,
   mailerPlugin,
   normaliseWorkerUrl,
   parseTags,
   readSettings,
} from '../src/index';

describe('mailerPlugin', () => {
   it('describes a native plugin that EmDash can load from its entrypoint', () => {
      const descriptor = mailerPlugin({ workerUrl: 'https://mail.example.com/' });

      expect(descriptor.id).toBe('mailer');
      expect(descriptor.format).toBe('native');
      expect(descriptor.entrypoint).toBe('@mailer/emdash/plugin');
      expect(descriptor.version).toMatch(/^\d+\.\d+\.\d+/);
   });

   it('asks only for the network and page-fragment capabilities', () => {
      const descriptor = mailerPlugin({ workerUrl: 'https://mail.example.com' });

      expect(descriptor.capabilities).toEqual([
         'network:request',
         'hooks.page-fragments:register',
      ]);
   });

   it('restricts network access to the Worker host', () => {
      const descriptor = mailerPlugin({ workerUrl: 'https://mail.example.com' });

      expect(descriptor.allowedHosts).toEqual(['mail.example.com']);
   });

   it('registers settings and no admin page, so EmDash renders the form itself', () => {
      const descriptor = mailerPlugin({ workerUrl: 'https://mail.example.com' });

      expect(Object.keys(descriptor.settingsSchema ?? {})).toEqual([
         'workerUrl',
         'siteKey',
         'defaultTags',
         'signupFormEnabled',
         'signupFormHeading',
      ]);
      expect(descriptor.adminEntry).toBeUndefined();
      expect(descriptor.adminPages).toBeUndefined();
   });

   it('keeps the subscribe key out of the schema defaults', () => {
      const defaults = Object.values(SETTINGS_SCHEMA)
         .map((field) => ('default' in field ? String(field.default) : ''))
         .join(' ');

      expect(defaults).not.toContain('pk_');
      expect(SETTINGS_SCHEMA.siteKey).not.toHaveProperty('default');
      expect(SETTINGS_SCHEMA.siteKey?.type).toBe('secret');
   });

   it('refuses a missing or non-http worker URL', () => {
      expect(() => mailerPlugin({ workerUrl: '   ' })).toThrow(/requires a workerUrl/);
      expect(() => mailerPlugin({ workerUrl: 'not a url' })).toThrow(/invalid workerUrl/);
      expect(() => mailerPlugin({ workerUrl: 'ftp://mail.example.com' })).toThrow(/http or https/);
   });
});

describe('normaliseWorkerUrl', () => {
   it('trims trailing slashes so route paths never double up', () => {
      expect(normaliseWorkerUrl(' https://mail.example.com// ')).toBe('https://mail.example.com');
   });
});

describe('parseTags', () => {
   it('reads a comma-separated settings value', () => {
      expect(parseTags(' newsletter, site ,, ')).toEqual(['newsletter', 'site']);
   });
});

describe('readSettings', () => {
   function settingsWith(values: Record<string, unknown>): SettingsAccess {
      return {
         async get<T>(key: string): Promise<T | null> {
            return key in values ? (values[key] as T) : null;
         },
      } as unknown as SettingsAccess;
   }

   const options = { workerUrl: 'https://mail.example.com', defaultTags: ['newsletter'] };

   it('applies descriptor defaults for settings nobody saved', async () => {
      const settings = await readSettings(settingsWith({}), options);

      expect(settings.workerUrl).toBe('https://mail.example.com');
      expect(settings.defaultTags).toEqual(['newsletter']);
      expect(settings.signupFormEnabled).toBe(false);
      expect(settings.signupFormHeading).toBe('Newsletter');
      expect(settings.siteKey).toBe('');
   });

   it('lets a saved value override the descriptor default', async () => {
      const settings = await readSettings(
         settingsWith({
            workerUrl: 'https://other.example.com',
            defaultTags: 'site',
            signupFormEnabled: true,
            signupFormHeading: 'Weekly digest',
         }),
         options,
      );

      expect(settings.workerUrl).toBe('https://other.example.com');
      expect(settings.defaultTags).toEqual(['site']);
      expect(settings.signupFormEnabled).toBe(true);
      expect(settings.signupFormHeading).toBe('Weekly digest');
   });

   it('honours a deliberately emptied tag list', async () => {
      const settings = await readSettings(settingsWith({ defaultTags: '' }), options);

      expect(settings.defaultTags).toEqual([]);
   });

   it('falls back instead of throwing on a half-typed URL', async () => {
      const settings = await readSettings(settingsWith({ workerUrl: 'mail.example' }), options);

      expect(settings.workerUrl).toBe('https://mail.example.com');
   });
});
