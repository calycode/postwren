import { defineConfig } from 'vitest/config';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers';

const migrations = await readD1Migrations('../../migrations');

export default defineConfig({
   plugins: [
      cloudflareTest({
         wrangler: { configPath: '../../wrangler.dev.jsonc' },
         miniflare: {
            compatibilityDate: '2026-08-22',
            compatibilityFlags: ['nodejs_compat', 'global_fetch_strictly_public'],
            bindings: { TEST_MIGRATIONS: migrations },
         },
      }),
   ],
   test: {
      include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
      setupFiles: ['./test/apply-migrations.ts'],
   },
});
