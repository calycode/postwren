import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { fail, ok } from '@mailer/worker-kit/envelope';
import type { AppEnv, Env } from './env';
import { requestContext } from './middleware/context';
import { onErrorHandler } from './middleware/error';
import { requireAuth, requireCsrf } from './middleware/auth';
import { enforceScopes } from './middleware/scopes';
import { authRoutes } from './routes/auth';
import { apiKeyRoutes } from './routes/api-keys';
import { subscriberRoutes } from './routes/subscribers';
import { tagRoutes } from './routes/tags';
import { templateRoutes } from './routes/templates';
import { campaignRoutes } from './routes/campaigns';
import { agentCampaignRoutes } from './routes/agent-campaigns';
import { audienceRoutes } from './routes/audience';
import { settingsRoutes } from './routes/settings';
import { trackingRoutes } from './routes/tracking';
import { mediaUploadRoutes, mediaServeRoutes } from './routes/media';
import { publicRoutes } from './routes/public';
import { subscribeKeyRoutes } from './routes/subscribe-keys';
import { oauthDiscoveryRoutes } from './oauth/discovery';
import { oauthRoutes } from './oauth/routes';
import { mcpRoutes } from './mcp/server';

const ALLOWED_ORIGINS = new Set(['http://localhost:5173', 'http://127.0.0.1:5173']);

export function createApp(env: Env): Hono<AppEnv> {
   const app = new Hono<AppEnv>();

   app.use('*', requestContext);
   app.route('/', publicRoutes);
   app.use(
      '*',
      cors({
         origin: (origin) => (ALLOWED_ORIGINS.has(origin) ? origin : undefined),
         credentials: true,
         allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
         allowHeaders: ['content-type', 'x-csrf-token'],
         maxAge: 600,
      }),
   );

   app.onError(onErrorHandler);

   app.get('/api/health', async (c) => {
      try {
         await c.env.DB.prepare('SELECT 1').first();
      } catch {
         return fail(503, 'unavailable', 'Database unavailable', undefined, c.get('requestId'));
      }

      return ok(
         { status: 'ok', time: Math.floor(Date.now() / 1000) },
         { requestId: c.get('requestId') },
      );
   });

   app.use('/api/auth/session', requireAuth);
   app.use('/api/auth/logout', requireCsrf);
   app.route('/api/auth', authRoutes);

   app.use('/api/v1/*', requireAuth);
   app.use('/api/v1/*', requireCsrf);
   app.use('/api/v1/*', enforceScopes);
   app.route('/api/v1/settings/api-keys', apiKeyRoutes);
   app.route('/api/v1/subscribers', subscriberRoutes);
   app.route('/api/v1/tags', tagRoutes);
   app.route('/api/v1/templates', templateRoutes);
   app.route('/api/v1/campaigns', agentCampaignRoutes);
   app.route('/api/v1/campaigns', campaignRoutes);
   app.route('/api/v1/audience', audienceRoutes);
   app.route('/api/v1/settings', settingsRoutes);
   app.route('/api/v1/subscribe-keys', subscribeKeyRoutes);
   app.route('/api/v1/media', mediaUploadRoutes);

   app.route('/', oauthDiscoveryRoutes);
   app.route('/oauth', oauthRoutes);
   app.route('/', mcpRoutes);

   app.route('/', trackingRoutes);
   app.route('/', mediaServeRoutes);

   app.notFound((c) => {
      if (c.req.path.startsWith('/api')) {
         return fail(404, 'not_found', 'Not found', undefined, c.get('requestId'));
      }
      return env.ASSETS.fetch(c.req.raw);
   });

   return app;
}
