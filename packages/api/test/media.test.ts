import { beforeEach, describe, expect, it } from 'vitest';
import { authHeaders, baseEnv, createAppForTest, json, resetDb, seedOwner } from './helpers';

const app = createAppForTest();

// A PNG signature is all the upload sniffer needs; the body is never decoded.
const TINY_PNG = new Uint8Array([
   0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]);

beforeEach(async () => {
   await resetDb();
   const env = baseEnv();
   const listed = await env.MEDIA.list({ prefix: 'media/' });
   for (const object of listed.objects) {
      await env.MEDIA.delete(object.key);
   }
});

describe('media library', () => {
   it('uploads, lists and deletes an image', async () => {
      const auth = await seedOwner(baseEnv());

      const form = new FormData();
      form.set('file', new File([TINY_PNG], 'Tiny shot.png', { type: 'image/png' }));

      const uploaded = await app.request('/api/v1/media', {
         method: 'POST',
         headers: { cookie: auth.cookie, 'x-csrf-token': auth.csrf },
         body: form,
      });
      expect(uploaded.status).toBe(201);
      const asset = (await json(uploaded)).data as {
         key: string;
         url: string;
         name: string;
         size: number;
      };
      expect(asset.key.startsWith('media/')).toBe(true);
      expect(asset.url).toContain(`/media/${asset.key}`);
      expect(asset.name).toBe('Tiny shot.png');
      expect(asset.size).toBe(TINY_PNG.byteLength);

      const listed = await app.request('/api/v1/media', {
         headers: { cookie: auth.cookie },
      });
      expect(listed.status).toBe(200);
      const body = (await json(listed)).data as {
         items: { key: string; name: string; contentType: string }[];
         cursor: string | null;
      };
      expect(body.items).toHaveLength(1);
      expect(body.items[0]).toMatchObject({
         key: asset.key,
         name: 'Tiny shot.png',
         contentType: 'image/png',
      });

      const deleted = await app.request(`/api/v1/media?key=${encodeURIComponent(asset.key)}`, {
         method: 'DELETE',
         headers: authHeaders(auth),
      });
      expect(deleted.status).toBe(200);

      const after = await app.request('/api/v1/media', {
         headers: { cookie: auth.cookie },
      });
      expect(((await json(after)).data as { items: unknown[] }).items).toHaveLength(0);
   });

   it('rejects a key outside the media prefix', async () => {
      const auth = await seedOwner(baseEnv());

      const response = await app.request('/api/v1/media?key=secrets/private.png', {
         method: 'DELETE',
         headers: authHeaders(auth),
      });
      expect(response.status).toBe(422);
   });
});
