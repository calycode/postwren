import { PluginRouteError } from 'emdash';
import { SIGNUP_SOURCE } from './index';

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export interface SubscribeSettings {
   workerUrl: string;
   siteKey: string;
   /** Host fixed by `postwrenPlugin({ workerUrl })`; EmDash refuses any other host. */
   allowedHost: string;
   defaultTags: string[];
}

export interface SubscribeDeps {
   settings: SubscribeSettings;
   fetch: FetchLike;
}

export interface SignupInput {
   email?: unknown;
   firstName?: unknown;
   lastName?: unknown;
   tags?: unknown;
   metadata?: unknown;
   sourceUrl?: unknown;
   website?: unknown;
}

export interface SubscribeResult {
   subscribed: true;
}

export interface ConnectionResult {
   ok: boolean;
   status: number;
   message?: string;
}

const FORWARD_TIMEOUT_MS = 8000;
const MAX_EMAIL_LENGTH = 254;
const MAX_NAME_LENGTH = 100;
const MAX_TAGS = 20;
const MAX_TAG_LENGTH = 64;
const MAX_METADATA_KEYS = 50;
const MAX_METADATA_VALUE_LENGTH = 1024;
const MAX_SOURCE_URL_LENGTH = 2048;
const METADATA_KEY_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;
const RESERVED_METADATA_KEYS = new Set([
   'id',
   'email',
   'first_name',
   'last_name',
   'status',
   'tags',
]);
const EMAIL_PATTERN = /^[^\s@"<>]+@[^\s@"<>]+\.[^\s@"<>]{2,}$/;

const NOT_CONFIGURED = 'Newsletter signup is not configured for this site.';

function isRecord(value: unknown): value is Record<string, unknown> {
   return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function timeoutSignal(): AbortSignal | undefined {
   return typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
      ? AbortSignal.timeout(FORWARD_TIMEOUT_MS)
      : undefined;
}

export function normaliseEmail(value: unknown): string {
   if (typeof value !== 'string') {
      throw new PluginRouteError('INVALID_EMAIL', 'Enter a valid email address.', 422);
   }

   const email = value.trim().toLowerCase();
   if (email.length === 0 || email.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(email)) {
      throw new PluginRouteError('INVALID_EMAIL', 'Enter a valid email address.', 422);
   }

   return email;
}

export function mergeTags(defaultTags: readonly string[], submitted: unknown): string[] {
   const candidates = [...defaultTags, ...(Array.isArray(submitted) ? submitted : [])];
   const merged = new Map<string, string>();

   for (const candidate of candidates) {
      if (typeof candidate !== 'string') continue;
      const tag = candidate.trim();
      if (tag.length === 0 || tag.length > MAX_TAG_LENGTH) continue;
      const key = tag.toLowerCase();
      if (!merged.has(key)) merged.set(key, tag);
      if (merged.size === MAX_TAGS) break;
   }

   return [...merged.values()];
}

/** Keep only entries that would pass the Worker's own metadata rules, so a bad payload
 *  can never turn into a misleading 422 for a visitor who cannot fix it. */
export function readMetadata(value: unknown): Record<string, string> | undefined {
   if (!isRecord(value)) return undefined;

   const metadata: Record<string, string> = {};
   for (const [key, entry] of Object.entries(value)) {
      if (Object.keys(metadata).length === MAX_METADATA_KEYS) break;
      if (typeof entry !== 'string') continue;
      if (!METADATA_KEY_PATTERN.test(key) || RESERVED_METADATA_KEYS.has(key)) continue;
      if (entry.length > MAX_METADATA_VALUE_LENGTH) continue;
      metadata[key] = entry;
   }

   return metadata;
}

function readName(value: unknown): string | undefined {
   if (typeof value !== 'string') return undefined;
   const name = value.trim();
   if (name.length === 0 || name.length > MAX_NAME_LENGTH) return undefined;
   return name;
}

function readSourceUrl(value: unknown): string | undefined {
   if (typeof value !== 'string') return undefined;
   const candidate = value.trim();
   if (candidate.length === 0 || candidate.length > MAX_SOURCE_URL_LENGTH) return undefined;

   try {
      const url = new URL(candidate);
      return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : undefined;
   } catch {
      return undefined;
   }
}

export function isHoneypotTripped(input: SignupInput): boolean {
   return typeof input.website === 'string' && input.website.trim().length > 0;
}

/** Throws `WORKER_NOT_CONFIGURED` when the settings form and the build-time host disagree. */
export function requireReachableWorker(settings: SubscribeSettings): string {
   if (settings.workerUrl.length === 0 || settings.siteKey.length === 0) {
      throw new PluginRouteError('WORKER_NOT_CONFIGURED', NOT_CONFIGURED, 502);
   }

   let host: string;
   try {
      host = new URL(settings.workerUrl).host;
   } catch {
      throw new PluginRouteError('WORKER_NOT_CONFIGURED', NOT_CONFIGURED, 502);
   }

   if (host !== settings.allowedHost) {
      throw new PluginRouteError('WORKER_NOT_CONFIGURED', NOT_CONFIGURED, 502);
   }

   return settings.workerUrl;
}

export function buildSubscribeBody(
   input: SignupInput,
   defaultTags: string[],
): Record<string, unknown> {
   const body: Record<string, unknown> = {
      email: normaliseEmail(input.email),
      source: SIGNUP_SOURCE,
   };

   const firstName = readName(input.firstName);
   const lastName = readName(input.lastName);
   if (firstName !== undefined) body.firstName = firstName;
   if (lastName !== undefined) body.lastName = lastName;

   const tags = mergeTags(defaultTags, input.tags);
   if (tags.length > 0) body.tags = tags;

   const metadata = readMetadata(input.metadata);
   if (metadata !== undefined && Object.keys(metadata).length > 0) body.metadata = metadata;

   const sourceUrl = readSourceUrl(input.sourceUrl);
   if (sourceUrl !== undefined) body.sourceUrl = sourceUrl;

   return body;
}

function upstreamFailure(status: number): PluginRouteError {
   if (status === 429) {
      return new PluginRouteError(
         'RATE_LIMITED',
         'Too many signups right now. Please try again in a minute.',
         429,
      );
   }

   if (status === 401 || status === 403) {
      return new PluginRouteError('WORKER_NOT_CONFIGURED', NOT_CONFIGURED, 502);
   }

   if (status === 422) {
      return new PluginRouteError('INVALID_EMAIL', 'Enter a valid email address.', 422);
   }

   return new PluginRouteError(
      'SUBSCRIBE_FAILED',
      'The newsletter service is unavailable. Please try again later.',
      502,
   );
}

export async function subscribe(deps: SubscribeDeps, input: SignupInput): Promise<SubscribeResult> {
   // A bot that fills the honeypot gets the same answer as a person, and we spend no request.
   if (isHoneypotTripped(input)) return { subscribed: true };

   const workerUrl = requireReachableWorker(deps.settings);
   const body = buildSubscribeBody(input, deps.settings.defaultTags);

   let response: Response;
   try {
      response = await deps.fetch(`${workerUrl}/api/public/subscribe`, {
         method: 'POST',
         headers: {
            authorization: `Bearer ${deps.settings.siteKey}`,
            'content-type': 'application/json',
            accept: 'application/json',
         },
         body: JSON.stringify(body),
         signal: timeoutSignal(),
      });
   } catch {
      throw new PluginRouteError(
         'SUBSCRIBE_FAILED',
         'The newsletter service is unavailable. Please try again later.',
         502,
      );
   }

   if (response.status >= 200 && response.status < 300) return { subscribed: true };

   throw upstreamFailure(response.status);
}

export async function checkConnection(deps: SubscribeDeps): Promise<ConnectionResult> {
   let workerUrl: string;
   try {
      workerUrl = requireReachableWorker(deps.settings);
   } catch {
      return {
         ok: false,
         status: 0,
         message: 'Set the Postwren Worker URL and subscribe key first.',
      };
   }

   try {
      const response = await deps.fetch(`${workerUrl}/api/health`, {
         method: 'GET',
         headers: { accept: 'application/json' },
         signal: timeoutSignal(),
      });

      if (response.status >= 200 && response.status < 300)
         return { ok: true, status: response.status };

      return {
         ok: false,
         status: response.status,
         message: `The Postwren Worker answered with status ${response.status}.`,
      };
   } catch (error) {
      const timedOut = error instanceof Error && error.name === 'TimeoutError';
      return {
         ok: false,
         status: 0,
         message: timedOut
            ? 'The Postwren Worker did not answer in time.'
            : 'Could not reach the Postwren Worker. Check the URL and that the Worker is deployed.',
      };
   }
}
