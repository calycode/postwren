import { Hono } from 'hono';
import { z } from 'zod';
import { ok } from '@postwren/worker-kit/envelope';
import { AppError, NotFoundError } from '@postwren/worker-kit/errors';
import type { AppEnv } from '../env';
import { appOrigin } from '../lib/app-url';

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_NAME_LENGTH = 120;

type ImageKind = { ext: string; contentType: string };

function startsWith(bytes: Uint8Array, signature: number[], offset = 0): boolean {
   return signature.every((value, index) => bytes[offset + index] === value);
}

function sniff(bytes: Uint8Array): ImageKind | null {
   if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
      return { ext: 'png', contentType: 'image/png' };
   }
   if (startsWith(bytes, [0xff, 0xd8, 0xff])) {
      return { ext: 'jpg', contentType: 'image/jpeg' };
   }
   if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) {
      return { ext: 'gif', contentType: 'image/gif' };
   }
   if (
      startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
      startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)
   ) {
      return { ext: 'webp', contentType: 'image/webp' };
   }
   return null;
}

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
   const digest = await crypto.subtle.digest('SHA-256', bytes);
   let hex = '';
   for (const byte of new Uint8Array(digest)) {
      hex += byte.toString(16).padStart(2, '0');
   }
   return hex;
}

export const mediaUploadRoutes = new Hono<AppEnv>();

const mediaListQuery = z.object({
   offset: z.coerce.number().int().min(0).max(10_000).optional(),
   limit: z.coerce.number().int().min(1).max(100).optional(),
});

type MediaRow = {
   key: string;
   name: string;
   content_type: string;
   size: number;
   created_at: number;
};

function mediaUrl(origin: string, key: string): string {
   return `${origin}/media/${key}`;
}

mediaUploadRoutes.get('/', async (c) => {
   const query = mediaListQuery.parse(c.req.query());
   const origin = appOrigin(c);
   const rows = await c.env.DB.prepare(
      `SELECT key, name, content_type, size, created_at
       FROM media_assets ORDER BY created_at DESC`,
   ).all<MediaRow>();

   // Objects uploaded before the registry existed still show up, named by key.
   const known = new Set(rows.results.map((row) => row.key));
   const stored = await c.env.MEDIA.list({ prefix: 'media/', limit: 1000 });
   const extras = stored.objects
      .filter((object) => !known.has(object.key))
      .map((object) => ({
         key: object.key,
         name: object.key.slice('media/'.length),
         content_type: object.httpMetadata?.contentType ?? 'application/octet-stream',
         size: object.size,
         created_at: Math.floor(object.uploaded.getTime() / 1000),
      }));

   const items = [...rows.results, ...extras]
      .sort((a, b) => b.created_at - a.created_at)
      .map((row) => ({
         key: row.key,
         url: mediaUrl(origin, row.key),
         name: row.name,
         contentType: row.content_type,
         size: row.size,
         uploadedAt: new Date(row.created_at * 1000).toISOString(),
      }));

   const offset = query.offset ?? 0;
   const limit = query.limit ?? 100;

   return ok(
      {
         items: items.slice(offset, offset + limit),
         cursor: offset + limit < items.length ? String(offset + limit) : null,
      },
      { requestId: c.get('requestId') },
   );
});

mediaUploadRoutes.delete('/', async (c) => {
   const key = c.req.query('key')?.trim() ?? '';
   if (!key.startsWith('media/') || key.includes('..')) {
      throw new AppError(422, 'validation_error', 'Expected a media key');
   }

   const object = await c.env.MEDIA.head(key);
   if (object === null) {
      throw new NotFoundError('Image not found');
   }

   await c.env.MEDIA.delete(key);
   await c.env.DB.prepare('DELETE FROM media_assets WHERE key = ?').bind(key).run();
   return ok({ key, deleted: true }, { requestId: c.get('requestId') });
});

mediaUploadRoutes.post('/', async (c) => {
   const body = await c.req.parseBody();
   const file = body['file'];

   if (typeof file === 'string' || file === undefined || file === null) {
      throw new AppError(422, 'validation_error', 'Expected a file upload named "file"');
   }

   if (file.size > MAX_BYTES) {
      throw new AppError(413, 'payload_too_large', 'Images must be 5 MB or smaller');
   }

   const buffer = await file.arrayBuffer();
   const kind = sniff(new Uint8Array(buffer));
   if (kind === null) {
      throw new AppError(422, 'validation_error', 'Unsupported image type');
   }

   const hash = await sha256Hex(buffer);
   const key = `media/${hash}.${kind.ext}`;
   const name = file.name.trim().slice(0, MAX_NAME_LENGTH) || key.slice('media/'.length);
   const now = Math.floor(Date.now() / 1000);

   await c.env.MEDIA.put(key, buffer, {
      httpMetadata: { contentType: kind.contentType },
      customMetadata: { name },
   });

   await c.env.DB.prepare(
      `INSERT INTO media_assets (key, name, content_type, size, created_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET name = excluded.name`,
   )
      .bind(key, name, kind.contentType, buffer.byteLength, now)
      .run();

   return ok(
      {
         url: mediaUrl(appOrigin(c), key),
         key,
         name,
         contentType: kind.contentType,
         size: buffer.byteLength,
         uploadedAt: new Date(now * 1000).toISOString(),
      },
      { status: 201, requestId: c.get('requestId') },
   );
});

export const mediaServeRoutes = new Hono<AppEnv>();

mediaServeRoutes.get('/media/*', async (c) => {
   const path = c.req.path;
   const key = path.slice('/media/'.length);

   if (key.length === 0) {
      throw new NotFoundError();
   }

   const object = await c.env.MEDIA.get(key);
   if (object === null) {
      throw new NotFoundError();
   }

   return new Response(object.body, {
      status: 200,
      headers: {
         'content-type': object.httpMetadata?.contentType ?? 'application/octet-stream',
         'cache-control': 'public, max-age=31536000, immutable',
      },
   });
});
