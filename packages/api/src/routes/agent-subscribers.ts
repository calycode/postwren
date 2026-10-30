import { Hono } from 'hono';
import { ok } from '@mailer/worker-kit/envelope';
import { NotFoundError } from '@mailer/worker-kit/errors';
import type { AppEnv } from '../env';

type SubscriberRow = {
   id: string;
   email: string;
   first_name: string | null;
   last_name: string | null;
   status: string;
   source: string | null;
   created_at: number;
   unsubscribed_at: number | null;
   deleted_at: number | null;
};

type TagRow = { id: string; name: string };

/**
 * The legacy subscriber router exposes list, patch and delete but no single
 * read. MCP needs `get_subscriber`, so this additive route fills the gap without
 * editing the router another thread owns.
 */
export const agentSubscriberRoutes = new Hono<AppEnv>();

agentSubscriberRoutes.get('/:id', async (c) => {
   const id = c.req.param('id');
   const row = await c.env.DB.prepare(
      `SELECT id, email, first_name, last_name, status, source, created_at,
              unsubscribed_at, deleted_at
       FROM subscribers WHERE id = ? AND deleted_at IS NULL`,
   )
      .bind(id)
      .first<SubscriberRow>();

   if (row === null) {
      throw new NotFoundError('Subscriber not found');
   }

   const tags = await c.env.DB.prepare(
      `SELECT t.id, t.name
       FROM subscriber_tags st JOIN tags t ON t.id = st.tag_id
       WHERE st.subscriber_id = ?
       ORDER BY t.name`,
   )
      .bind(id)
      .all<TagRow>();

   return ok({ ...row, tags: tags.results }, { requestId: c.get('requestId') });
});
