import { Hono } from 'hono';
import { z } from 'zod';
import { createId } from '@postwren/worker-kit/ids';
import { ok } from '@postwren/worker-kit/envelope';
import { ValidationError } from '@postwren/worker-kit/errors';
import { API_EVENT_NAME_PATTERN } from '@postwren/shared/automation';
import { RATE_LIMITS } from '@postwren/shared/contracts';
import type { AppEnv } from '../env';
import { enrollAutomations } from '../jobs/automation';
import { consumeRateLimit } from '../lib/rate-limit';
import { nowSeconds } from '../lib/time';
import { readJson } from '../lib/validation';

const eventInput = z
   .object({
      email: z
         .string()
         .trim()
         .email()
         .transform((value) => value.toLowerCase()),
      event: z
         .string()
         .trim()
         .toLowerCase()
         .regex(
            API_EVENT_NAME_PATTERN,
            'Event names use lowercase letters, digits, dots, dashes or underscores',
         ),
      properties: z.record(z.string(), z.unknown()).optional(),
      idempotencyKey: z.string().trim().min(1).max(200).optional(),
   })
   .strict();

function propertiesJson(properties: Record<string, unknown> | undefined): string {
   if (properties === undefined) return '{}';
   const json = JSON.stringify(properties);
   if (json.length > 16_384) {
      throw new ValidationError('Event properties are limited to 16 KB');
   }
   return json;
}

export const eventRoutes = new Hono<AppEnv>();

/**
 * Named events for scripts. The response never reveals whether the address is
 * on the list, and a failed enrolment never turns a valid event into an error.
 */
eventRoutes.post('/', async (c) => {
   const body = eventInput.parse(await readJson(c));
   const credential = c.get('credentialId') ?? c.get('userId') ?? 'session';
   const now = nowSeconds();

   await consumeRateLimit(c.env.DB, `events:${credential}`, RATE_LIMITS.apiEvents, now);
   await consumeRateLimit(
      c.env.DB,
      `events:email:${body.email}`,
      RATE_LIMITS.apiEventsPerEmail,
      now,
   );

   const subscriber = await c.env.DB.prepare(
      'SELECT id FROM subscribers WHERE email = ? AND deleted_at IS NULL',
   )
      .bind(body.email)
      .first<{ id: string }>();

   const eventId = createId('evt');
   const inserted = await c.env.DB.prepare(
      `INSERT OR IGNORE INTO automation_events
        (id, name, email, subscriber_id, properties_json, credential_id, idempotency_key, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
   )
      .bind(
         eventId,
         body.event,
         body.email,
         subscriber?.id ?? null,
         propertiesJson(body.properties),
         credential,
         body.idempotencyKey ?? null,
         now,
      )
      .run();

   // A repeated idempotency key is the same event. Do not enrol it twice.
   if ((inserted.meta.changes ?? 0) > 0 && subscriber !== null) {
      try {
         await enrollAutomations(
            c.env,
            {
               kind: 'api.event',
               subscriberId: subscriber.id,
               name: body.event,
               eventId,
               ...(body.properties === undefined ? {} : { properties: body.properties }),
            },
            now,
         );
      } catch (error) {
         console.error('api_event_enrollment_failed', {
            eventId,
            subscriberId: subscriber.id,
            message: error instanceof Error ? error.message : String(error),
         });
      }
   }

   return ok({ accepted: true }, { status: 202, requestId: c.get('requestId') });
});
