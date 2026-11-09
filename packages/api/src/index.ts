import {
   OAuthProvider,
   type OAuthResourceContext,
   type ResolveExternalTokenInput,
   type ResolveExternalTokenResult,
} from '@cloudflare/workers-oauth-provider';
import { createApp } from './app';
import { authenticateApiKey } from './auth/bearer';
import { SCOPES } from './auth/scopes';
import type { CampaignJob, EmailSendingEvent, Env } from './env';
import { handleEmailEventQueue } from './jobs/email-events';
import { handleQueue } from './jobs/send';
import { handleScheduled } from './jobs/dispatch';
import { configuredAppOrigin, resolveAppOrigin } from './lib/app-url';
import { handleMcpRequest } from './mcp/server';
import { mcpResource, ACCESS_TOKEN_TTL_SECONDS, REFRESH_TOKEN_TTL_SECONDS } from './oauth/config';

type McpProps = {
   kind?: 'api_key';
   scopes?: string[];
   keyId?: string;
   prefix?: string;
   userId?: string;
   email?: string;
};

const appHandler = {
   fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> | Response {
      return createApp(env).fetch(request, env, ctx);
   },
};

const mcpApiHandler = {
   fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
      const resourceContext = ctx as OAuthResourceContext<McpProps>;
      const scopes =
         resourceContext.props.kind === 'api_key'
            ? (resourceContext.props.scopes ?? [])
            : resourceContext.auth.scope;
      return handleMcpRequest(request, env, { scopes });
   },
};

const providers = new Map<string, OAuthProvider<Env>>();

/**
 * Only used by the scheduled purge, which never serves a request. Expired
 * OAuth data lives in KV, so the origin on this provider is never exposed.
 */
const PURGE_ORIGIN = 'https://postwren.invalid';

function providerFor(env: Env, origin: string): OAuthProvider<Env> {
   const existing = providers.get(origin);
   if (existing !== undefined) {
      return existing;
   }

   const provider = new OAuthProvider<Env>({
      apiRoute: '/mcp',
      apiHandler: mcpApiHandler,
      defaultHandler: appHandler,
      authorizeEndpoint: '/oauth/authorize',
      tokenEndpoint: '/oauth/token',
      clientRegistrationEndpoint: '/oauth/register',
      accessTokenTTL: ACCESS_TOKEN_TTL_SECONDS,
      refreshTokenTTL: REFRESH_TOKEN_TTL_SECONDS,
      scopesSupported: [...SCOPES],
      clientIdMetadataDocumentEnabled: true,
      resourceMetadata: {
         resource: `${origin}/mcp`,
         authorization_servers: [origin],
         bearer_methods_supported: ['header'],
         resource_name: 'Postwren',
      },
      resolveExternalToken: async ({
         token,
         env: callbackEnv,
      }: ResolveExternalTokenInput<Env>): Promise<ResolveExternalTokenResult | null> => {
         if (!token.startsWith('pwr_')) {
            return null;
         }

         const credential = await authenticateApiKey(callbackEnv, token);
         if (credential === null) {
            return null;
         }

         return {
            props: {
               kind: 'api_key',
               scopes: credential.scopes,
               keyId: credential.id,
               prefix: credential.prefix,
            },
            audience: mcpResource(origin),
         };
      },
   });

   providers.set(origin, provider);
   return provider;
}

export default {
   fetch(request: Request, env: Env, ctx: ExecutionContext) {
      return providerFor(env, resolveAppOrigin(request.url, env)).fetch(request, env, ctx);
   },
   async queue(batch: MessageBatch<CampaignJob | EmailSendingEvent>, env: Env): Promise<void> {
      if (batch.queue.includes('email-events')) {
         await handleEmailEventQueue(batch as MessageBatch<EmailSendingEvent>, env);
         return;
      }
      await handleQueue(batch as MessageBatch<CampaignJob>, env);
   },
   async scheduled(
      controller: ScheduledController,
      env: Env,
      ctx: ExecutionContext,
   ): Promise<void> {
      await handleScheduled(controller, env, ctx);
      const purgeOrigin = configuredAppOrigin(env) ?? PURGE_ORIGIN;
      ctx.waitUntil(providerFor(env, purgeOrigin).purgeExpiredData(env));
   },
} satisfies ExportedHandler<Env, CampaignJob | EmailSendingEvent>;
