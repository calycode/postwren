import { Hono } from 'hono';
import { ok } from '@postwren/worker-kit/envelope';
import { ConflictError, NotFoundError } from '@postwren/worker-kit/errors';
import type { AppEnv } from '../env';
import { dispatchCampaign, loadCampaign } from '../jobs/dispatch';
import { nowSeconds } from '../lib/time';

/**
 * `resume` is part of the campaign lifecycle exposed to agents but has no
 * counterpart in the legacy router. Keeping it here means the MCP layer still
 * has exactly one write path.
 */
export const agentCampaignRoutes = new Hono<AppEnv>();

agentCampaignRoutes.post('/:id/resume', async (c) => {
   const id = c.req.param('id');
   const campaign = await loadCampaign(c.env.DB, id);
   if (campaign === null) {
      throw new NotFoundError('Campaign not found');
   }

   if (campaign.status !== 'paused') {
      throw new ConflictError(`Cannot move campaign from ${campaign.status} to sending`);
   }

   const now = nowSeconds();
   const claimed = await c.env.DB.prepare(
      `UPDATE campaigns SET status = 'sending', updated_at = ?
       WHERE id = ? AND status = 'paused'`,
   )
      .bind(now, id)
      .run();

   if ((claimed.meta.changes ?? 0) !== 1) {
      throw new ConflictError('Campaign is no longer paused');
   }

   await dispatchCampaign(c.env, id, now);

   const updated = await loadCampaign(c.env.DB, id);
   return ok(updated);
});
