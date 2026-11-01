import { Hono } from 'hono';
import { ok } from '@postwren/worker-kit/envelope';
import { AppError, NotFoundError } from '@postwren/worker-kit/errors';
import type { AppEnv } from '../env';
import { appOrigin } from '../lib/app-url';

const MAX_BYTES = 5 * 1024 * 1024;

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

   await c.env.MEDIA.put(key, buffer, {
      httpMetadata: { contentType: kind.contentType },
   });

   return ok(
      { url: `${appOrigin(c)}/media/${key}`, key },
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
