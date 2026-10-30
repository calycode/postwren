import { Hono } from 'hono';
import { SCOPES } from '../auth/scopes';
import type { AppEnv } from '../env';
import {
   SUPPORTED_CODE_CHALLENGE_METHODS,
   SUPPORTED_GRANT_TYPES,
   SUPPORTED_RESPONSE_TYPES,
   issuer,
   mcpResource,
} from './config';

const CACHE = 'public, max-age=300';

export const oauthDiscoveryRoutes = new Hono<AppEnv>();

oauthDiscoveryRoutes.get('/.well-known/oauth-protected-resource', async (c) => {
   return c.json(
      {
         resource: mcpResource(c.env),
         authorization_servers: [issuer(c.env)],
         scopes_supported: [...SCOPES],
         bearer_methods_supported: ['header'],
      },
      200,
      {
         'cache-control': CACHE,
         'content-type': 'application/json; charset=utf-8',
      },
   );
});

/** Path-insertion alias from RFC 9728 for clients that key metadata to /mcp. */
oauthDiscoveryRoutes.get('/.well-known/oauth-protected-resource/mcp', async (c) => {
   return c.json(
      {
         resource: mcpResource(c.env),
         authorization_servers: [issuer(c.env)],
         scopes_supported: [...SCOPES],
         bearer_methods_supported: ['header'],
      },
      200,
      {
         'cache-control': CACHE,
         'content-type': 'application/json; charset=utf-8',
      },
   );
});

oauthDiscoveryRoutes.get('/.well-known/oauth-authorization-server', async (c) => {
   return c.json(
      {
         issuer: issuer(c.env),
         authorization_endpoint: `${issuer(c.env)}/oauth/authorize`,
         token_endpoint: `${issuer(c.env)}/oauth/token`,
         registration_endpoint: `${issuer(c.env)}/oauth/register`,
         response_types_supported: [...SUPPORTED_RESPONSE_TYPES],
         grant_types_supported: [...SUPPORTED_GRANT_TYPES],
         code_challenge_methods_supported: [...SUPPORTED_CODE_CHALLENGE_METHODS],
         token_endpoint_auth_methods_supported: ['none'],
         scopes_supported: [...SCOPES],
      },
      200,
      {
         'cache-control': CACHE,
         'content-type': 'application/json; charset=utf-8',
      },
   );
});
