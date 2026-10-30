import { z } from 'zod';
import { SUPPORTED_GRANT_TYPES, SUPPORTED_RESPONSE_TYPES } from './config';

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

export const registerInput = z
   .object({
      client_name: z.string().trim().min(1).max(100).optional(),
      redirect_uris: z.array(z.string().trim().min(1).max(2048)).min(1).max(10),
      token_endpoint_auth_method: z.string().trim().optional(),
      grant_types: z.array(z.string().trim()).min(1).optional(),
      response_types: z.array(z.string().trim()).min(1).optional(),
      scope: z.string().trim().max(2000).optional(),
   })
   .passthrough();

export type RegisterInput = z.infer<typeof registerInput>;

export class ClientMetadataError extends Error {
   constructor(message: string) {
      super(message);
      this.name = 'ClientMetadataError';
   }
}

export function assertRedirectUri(value: string): string {
   let url: URL;
   try {
      url = new URL(value);
   } catch {
      throw new ClientMetadataError(`Invalid redirect URI: ${value}`);
   }

   if (url.username.length > 0 || url.password.length > 0) {
      throw new ClientMetadataError('Redirect URIs must not contain credentials');
   }

   if (url.hash.length > 0) {
      throw new ClientMetadataError('Redirect URIs must not contain a fragment');
   }

   if (url.protocol === 'https:') {
      return url.toString();
   }

   if (url.protocol === 'http:' && LOCAL_HOSTNAMES.has(url.hostname)) {
      return url.toString();
   }

   throw new ClientMetadataError('Redirect URIs must use https, except for localhost');
}

export function normaliseRedirectUris(values: string[]): string[] {
   return values.map(assertRedirectUri);
}

export function assertGrantTypes(values: string[] | undefined): string[] {
   if (values === undefined) {
      return [...SUPPORTED_GRANT_TYPES];
   }

   for (const value of values) {
      if (!(SUPPORTED_GRANT_TYPES as readonly string[]).includes(value)) {
         throw new ClientMetadataError(`Unsupported grant type: ${value}`);
      }
   }

   return values;
}

export function assertResponseTypes(values: string[] | undefined): string[] {
   if (values === undefined) {
      return [...SUPPORTED_RESPONSE_TYPES];
   }

   for (const value of values) {
      if (!(SUPPORTED_RESPONSE_TYPES as readonly string[]).includes(value)) {
         throw new ClientMetadataError(`Unsupported response type: ${value}`);
      }
   }

   return values;
}

export function assertPublicClient(authMethod: string | undefined): void {
   if (authMethod !== undefined && authMethod !== 'none') {
      throw new ClientMetadataError(
         'Only public clients (token_endpoint_auth_method "none") are supported',
      );
   }
}
