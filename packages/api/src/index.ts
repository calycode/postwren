import type { CampaignJob, Env } from './env';
import { createApp } from './app';
import { handleQueue } from './jobs/send';
import { handleScheduled } from './jobs/dispatch';

export default {
   fetch(request: Request, env: Env, ctx: ExecutionContext) {
      return createApp(env).fetch(request, env, ctx);
   },
   async queue(batch: MessageBatch<CampaignJob>, env: Env): Promise<void> {
      await handleQueue(batch, env);
   },
   async scheduled(
      controller: ScheduledController,
      env: Env,
      ctx: ExecutionContext,
   ): Promise<void> {
      await handleScheduled(controller, env, ctx);
   },
} satisfies ExportedHandler<Env, CampaignJob>;
