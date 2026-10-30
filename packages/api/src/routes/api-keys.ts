import { Hono } from 'hono';
import { z } from 'zod';
import { createId } from '@mailer/worker-kit/ids';
import { ok } from '@mailer/worker-kit/envelope';
import { AppError, NotFoundError } from '@mailer/worker-kit/errors';
import type { AppEnv } from '../env';
import { readJson } from '../lib/validation';
import { nowSeconds } from '../lib/time';
import { generateApiKey, apiKeyHash } from '../auth/api-key';
import { parseScopes, scopeListSchema, serialiseScopes } from '../auth/scopes';

type ApiKeyRow = {
   id: string;
   name: string;
   prefix: string;
   scopes: string;
   created_at: number;
   last_used_at: number | null;
   expires_at: number | null;
   revoked_at: number | null;
};

const createInput = z
   .object({
      name: z.string().trim().min(1).max(100),
      scopes: scopeListSchema,
      expiresAt: z.number().int().positive().optional(),
   })
   .strict();

const COLUMNS = 'id, name, prefix, scopes, created_at, last_used_at, expires_at, revoked_at';

function present(row: ApiKeyRow): Omit<ApiKeyRow, 'scopes'> & { scopes: string[] } {
   return { ...row, scopes: parseScopes(row.scopes) };
}

async function findKey(db: D1Database, id: string): Promise<ApiKeyRow | null> {
   return db.prepare(`SELECT ${COLUMNS} FROM api_keys WHERE id = ?`).bind(id).first<ApiKeyRow>();
}

export const apiKeyRoutes = new Hono<AppEnv>();

apiKeyRoutes.use('*', async (c, next) => {
   if (c.get('authKind') !== 'session') {
      throw new AppError(403, 'forbidden', 'API keys can only be managed from a signed-in session');
   }
   c.header('cache-control', 'no-store');
   await next();
});

apiKeyRoutes.get('/', async (c) => {
   const rows = await c.env.DB.prepare(
      `SELECT ${COLUMNS} FROM api_keys ORDER BY created_at DESC, id DESC`,
   ).all<ApiKeyRow>();

   return ok(rows.results.map(present), { requestId: c.get('requestId') });
});

apiKeyRoutes.post('/', async (c) => {
   const body = createInput.parse(await readJson(c));
   const now = nowSeconds();

   if (body.expiresAt !== undefined && body.expiresAt <= now) {
      throw new AppError(422, 'validation_error', 'expiresAt must be in the future');
   }

   const { raw, prefix } = generateApiKey();
   const hash = await apiKeyHash(raw);
   const id = createId('key');

   await c.env.DB.prepare(
      `INSERT INTO api_keys (id, name, prefix, key_hash, scopes, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
   )
      .bind(id, body.name, prefix, hash, serialiseScopes(body.scopes), now, body.expiresAt ?? null)
      .run();

   const row = await findKey(c.env.DB, id);
   if (row === null) {
      throw new NotFoundError('API key not found');
   }

   return ok({ ...present(row), key: raw }, { status: 201, requestId: c.get('requestId') });
});

apiKeyRoutes.delete('/:id', async (c) => {
   const id = c.req.param('id');
   const row = await findKey(c.env.DB, id);
   if (row === null) {
      throw new NotFoundError('API key not found');
   }

   const now = nowSeconds();
   await c.env.DB.prepare('UPDATE api_keys SET revoked_at = COALESCE(revoked_at, ?) WHERE id = ?')
      .bind(now, id)
      .run();

   const updated = await findKey(c.env.DB, id);
   return ok({ id, revoked: true, revoked_at: updated?.revoked_at ?? now });
});

apiKeyRoutes.post('/:id/revoke', async (c) => {
   const id = c.req.param('id');
   const row = await findKey(c.env.DB, id);
   if (row === null) {
      throw new NotFoundError('API key not found');
   }

   const now = nowSeconds();
   await c.env.DB.prepare('UPDATE api_keys SET revoked_at = COALESCE(revoked_at, ?) WHERE id = ?')
      .bind(now, id)
      .run();

   return ok({ id, revoked: true });
});
