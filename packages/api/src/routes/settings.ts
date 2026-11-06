import { Hono } from 'hono';
import { z } from 'zod';
import { createId } from '@postwren/worker-kit/ids';
import { ok } from '@postwren/worker-kit/envelope';
import { AppError, ConflictError, NotFoundError } from '@postwren/worker-kit/errors';
import type { AppEnv } from '../env';
import { isUniqueViolation, readJson } from '../lib/validation';
import { nowSeconds } from '../lib/time';
import { domainOf, seedSenderAddress, senderEmailFrom } from '../lib/senders';
import type { SenderAddressRow } from '../lib/senders';
import {
   MAX_EMBED_ORIGINS,
   MAX_EMBED_ORIGIN_LENGTH,
   loadEmbedOrigins,
   normaliseEmbedOrigin,
   replaceEmbedOrigins,
} from '../lib/embed-origins';

const emailField = z
   .string()
   .trim()
   .email()
   .transform((value) => value.toLowerCase());

const senderCreateInput = z
   .object({
      email: emailField,
      name: z.string().trim().max(100).optional(),
   })
   .strict();

const senderPatchInput = z
   .object({
      name: z.string().trim().max(100).optional(),
      verified: z.boolean().optional(),
      isDefault: z.boolean().optional(),
   })
   .strict();

const embedOriginsInput = z
   .object({
      origins: z.array(z.string().max(MAX_EMBED_ORIGIN_LENGTH)).max(MAX_EMBED_ORIGINS),
   })
   .strict();

export const settingsRoutes = new Hono<AppEnv>();

async function listAddresses(db: D1Database): Promise<SenderAddressRow[]> {
   const rows = await db
      .prepare(
         `SELECT id, email, name, domain, verified_at, is_default, created_at
          FROM sender_addresses
          ORDER BY is_default DESC, domain ASC, email ASC`,
      )
      .all<SenderAddressRow>();
   return rows.results;
}

async function findAddress(db: D1Database, id: string): Promise<SenderAddressRow | null> {
   return db
      .prepare(
         `SELECT id, email, name, domain, verified_at, is_default, created_at
          FROM sender_addresses WHERE id = ?`,
      )
      .bind(id)
      .first<SenderAddressRow>();
}

settingsRoutes.get('/senders', async (c) => {
   await seedSenderAddress(c.env.DB, c.env.EMAIL_FROM, nowSeconds());

   const addresses = await listAddresses(c.env.DB);
   const domains = [...new Set(addresses.map((address) => address.domain))].sort();
   const defaultAddress = addresses.find((address) => address.is_default === 1);

   return ok({
      addresses,
      domains,
      defaultFrom: defaultAddress?.email ?? senderEmailFrom(c.env.EMAIL_FROM),
   });
});

settingsRoutes.post('/senders', async (c) => {
   const body = senderCreateInput.parse(await readJson(c));
   const now = nowSeconds();
   const id = createId('snd');

   await seedSenderAddress(c.env.DB, c.env.EMAIL_FROM, now);

   try {
      await c.env.DB.prepare(
         `INSERT INTO sender_addresses (id, email, name, domain, verified_at, is_default, created_at)
          VALUES (?, ?, ?, ?, NULL, 0, ?)`,
      )
         .bind(id, body.email, body.name ?? '', domainOf(body.email), now)
         .run();
   } catch (error) {
      if (isUniqueViolation(error)) {
         throw new ConflictError('A sender address with that email already exists');
      }
      throw error;
   }

   const row = await findAddress(c.env.DB, id);
   if (row === null) {
      throw new NotFoundError('Sender address not found');
   }

   return ok(row, { status: 201, requestId: c.get('requestId') });
});

settingsRoutes.patch('/senders/:id', async (c) => {
   const id = c.req.param('id');
   const body = senderPatchInput.parse(await readJson(c));
   const existing = await findAddress(c.env.DB, id);
   if (existing === null) {
      throw new NotFoundError('Sender address not found');
   }

   if (body.isDefault === false && existing.is_default === 1) {
      throw new AppError(
         422,
         'validation_error',
         'A default sender address is required. Choose another address first.',
      );
   }

   const statements: D1PreparedStatement[] = [];

   if (body.name !== undefined) {
      statements.push(
         c.env.DB.prepare('UPDATE sender_addresses SET name = ? WHERE id = ?').bind(body.name, id),
      );
   }

   if (body.verified !== undefined) {
      statements.push(
         c.env.DB.prepare('UPDATE sender_addresses SET verified_at = ? WHERE id = ?').bind(
            body.verified ? nowSeconds() : null,
            id,
         ),
      );
   }

   if (body.isDefault === true && existing.is_default !== 1) {
      statements.push(
         c.env.DB.prepare(
            'UPDATE sender_addresses SET is_default = CASE WHEN id = ? THEN 1 ELSE 0 END',
         ).bind(id),
      );
   }

   if (statements.length > 0) {
      await c.env.DB.batch(statements);
   }

   const row = await findAddress(c.env.DB, id);
   if (row === null) {
      throw new NotFoundError('Sender address not found');
   }

   return ok(row);
});

settingsRoutes.delete('/senders/:id', async (c) => {
   const id = c.req.param('id');
   const existing = await findAddress(c.env.DB, id);
   if (existing === null) {
      throw new NotFoundError('Sender address not found');
   }

   if (existing.is_default === 1) {
      throw new ConflictError('Cannot delete the default sender address');
   }

   const total = await c.env.DB.prepare('SELECT COUNT(*) AS count FROM sender_addresses').first<{
      count: number;
   }>();
   if ((total?.count ?? 0) <= 1) {
      throw new ConflictError('Cannot delete the last sender address');
   }

   await c.env.DB.prepare('DELETE FROM sender_addresses WHERE id = ?').bind(id).run();

   return ok({ id, deleted: true });
});

settingsRoutes.get('/embed-origins', async (c) => {
   return ok({ origins: await loadEmbedOrigins(c.env.DB) });
});

settingsRoutes.put('/embed-origins', async (c) => {
   const body = embedOriginsInput.parse(await readJson(c));
   const origins: string[] = [];

   for (const raw of body.origins) {
      const origin = normaliseEmbedOrigin(raw);
      if (origin === null) {
         throw new AppError(
            422,
            'validation_error',
            `"${raw}" is not an exact origin. Use a scheme, host and optional port only, for example https://cms.example.com.`,
            { origin: raw },
         );
      }

      if (!origins.includes(origin)) origins.push(origin);
   }

   await replaceEmbedOrigins(c.env.DB, origins, nowSeconds());

   console.info(
      JSON.stringify({
         level: 'info',
         event: 'embed_origins_updated',
         requestId: c.get('requestId'),
         userId: c.get('userId'),
         origins,
      }),
   );

   return ok({ origins });
});
