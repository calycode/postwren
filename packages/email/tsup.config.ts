import { defineConfig } from 'tsup';

export default defineConfig({
   entry: ['src/index.ts', 'src/ir/index.ts', 'src/render/index.ts', 'src/template/index.ts'],
   format: ['esm'],
   dts: true,
   clean: true,
   target: 'es2022',
   external: ['zod'],
});
