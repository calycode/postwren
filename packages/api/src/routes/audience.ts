import { Hono } from 'hono';
import { z } from 'zod';
import { ok } from '@mailer/worker-kit/envelope';
import type { AppEnv } from '../env';
import { countAudience } from '../lib/audience';

const previewQuery = z.object({ q: z.string().trim().min(1) });

export const audienceRoutes = new Hono<AppEnv>();

audienceRoutes.get('/preview', async (c) => {
   const query = previewQuery.parse(c.req.query());
   const count = await countAudience(c.env.DB, query.q);

   return ok({ count, query: query.q }, { requestId: c.get('requestId') });
});
