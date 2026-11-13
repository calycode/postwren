import type { APIRequestContext } from '@playwright/test';

/**
 * wrangler dev exposes miniflare's scheduled trigger on this path when started
 * with --test-scheduled. Cron does not tick on its own locally.
 */
export async function runScheduledTasks(request: APIRequestContext): Promise<void> {
   const response = await request.get('/cdn-cgi/local/scheduled');
   if (!response.ok()) {
      throw new Error(
         `Scheduled trigger failed with ${response.status()}: ${await response.text()}`,
      );
   }
}
