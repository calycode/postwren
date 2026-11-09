import { Hono } from 'hono';
import { createId, randomToken, sha256Hex } from '@postwren/worker-kit/ids';
import { ok } from '@postwren/worker-kit/envelope';
import { NotFoundError } from '@postwren/worker-kit/errors';
import { subscribeKeyInput } from '@postwren/shared/contracts';
import type { AppEnv } from '../env';
import { readJson } from '../lib/validation';
import { nowSeconds } from '../lib/time';

type SubscribeKeyRow = {
   id: string;
   name: string;
   prefix: string;
   key_hash: string;
   allowed_origins: string;
   default_tags: string;
   require_confirmation: number;
   turnstile_site_key: string | null;
   created_at: number;
   revoked_at: number | null;
};

export type SubscribeKeyResource = {
   id: string;
   name: string;
   prefix: string;
   allowed_origins: string[];
   default_tags: string[];
   require_confirmation: boolean;
   turnstile_site_key: string | null;
   created_at: number;
   revoked_at: number | null;
};

export const subscribeKeyRoutes = new Hono<AppEnv>();

function stringArray(value: string): string[] {
   try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed)
         ? parsed.filter((item): item is string => typeof item === 'string')
         : [];
   } catch {
      return [];
   }
}

function toResource(row: SubscribeKeyRow): SubscribeKeyResource {
   return {
      id: row.id,
      name: row.name,
      prefix: row.prefix,
      allowed_origins: stringArray(row.allowed_origins),
      default_tags: stringArray(row.default_tags),
      require_confirmation: row.require_confirmation === 1,
      turnstile_site_key: row.turnstile_site_key,
      created_at: row.created_at,
      revoked_at: row.revoked_at,
   };
}

function normaliseTags(tags: string[]): string[] {
   return [...new Set(tags.map((tag) => tag.trim().toLowerCase()).filter((tag) => tag.length > 0))];
}

subscribeKeyRoutes.get('/', async (c) => {
   const rows = await c.env.DB.prepare(
      `SELECT id, name, prefix, allowed_origins, default_tags, require_confirmation,
              turnstile_site_key, created_at, revoked_at
       FROM subscribe_keys
       ORDER BY created_at DESC, id DESC`,
   ).all<SubscribeKeyRow>();

   return ok(rows.results.map(toResource), { requestId: c.get('requestId') });
});

subscribeKeyRoutes.post('/', async (c) => {
   const body = subscribeKeyInput.parse(await readJson(c));
   const secret = `pk_live_${randomToken(24)}`;
   const keyHash = await sha256Hex(secret);
   const id = createId('sk');
   const now = nowSeconds();

   await c.env.DB.prepare(
      `INSERT INTO subscribe_keys
       (id, name, prefix, key_hash, allowed_origins, default_tags, require_confirmation,
        turnstile_site_key, created_at, revoked_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
   )
      .bind(
         id,
         body.name,
         secret.slice(0, 16),
         keyHash,
         JSON.stringify(body.allowedOrigins ?? []),
         JSON.stringify(normaliseTags(body.defaultTags ?? [])),
         body.requireConfirmation === true ? 1 : 0,
         body.turnstileSiteKey === undefined || body.turnstileSiteKey.length === 0
            ? null
            : body.turnstileSiteKey,
         now,
      )
      .run();

   return ok(
      {
         id,
         name: body.name,
         prefix: secret.slice(0, 16),
         key: secret,
         allowed_origins: body.allowedOrigins ?? [],
         default_tags: normaliseTags(body.defaultTags ?? []),
         require_confirmation: body.requireConfirmation === true,
         turnstile_site_key:
            body.turnstileSiteKey === undefined || body.turnstileSiteKey.length === 0
               ? null
               : body.turnstileSiteKey,
         created_at: now,
         revoked_at: null,
      },
      { status: 201, requestId: c.get('requestId') },
   );
});

subscribeKeyRoutes.delete('/:id', async (c) => {
   const id = c.req.param('id');
   const existing = await c.env.DB.prepare('SELECT id, revoked_at FROM subscribe_keys WHERE id = ?')
      .bind(id)
      .first<{ id: string; revoked_at: number | null }>();

   if (existing === null) {
      throw new NotFoundError('Subscribe key not found');
   }

   // Same contract as API keys: revoke first, delete for good only once revoked.
   if (existing.revoked_at !== null) {
      await c.env.DB.prepare('DELETE FROM subscribe_keys WHERE id = ?').bind(id).run();
      return ok({ id, deleted: true });
   }

   await c.env.DB.prepare('UPDATE subscribe_keys SET revoked_at = ? WHERE id = ?')
      .bind(nowSeconds(), id)
      .run();

   return ok({ id, revoked: true });
});
