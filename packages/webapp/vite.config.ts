import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import tailwindcss from '@tailwindcss/vite';

const preactEntry = (specifier: string) => fileURLToPath(import.meta.resolve(specifier));
const srcDir = fileURLToPath(new URL('./src', import.meta.url));
const API_TARGET = 'http://127.0.0.1:8787';

export default defineConfig({
   plugins: [preact({ reactAliasesEnabled: false }), tailwindcss()],
   base: '/',
   build: {
      outDir: 'dist/client',
      emptyOutDir: true,
   },
   server: {
      port: 5173,
      strictPort: true,
      proxy: {
         '/api': API_TARGET,
         '/media': API_TARGET,
         // Regex keys: a plain `/t` would also swallow `/tags`.
         '^/t/': API_TARGET,
         '^/u/': API_TARGET,
      },
   },
   define: {
      'process.env.IS_PREACT': JSON.stringify('true'),
   },
   resolve: {
      alias: [
         { find: '@', replacement: srcDir },
         { find: /^react$/, replacement: preactEntry('preact/compat') },
         { find: /^react-dom$/, replacement: preactEntry('preact/compat') },
         { find: /^react-dom\/client$/, replacement: preactEntry('preact/compat/client') },
         { find: /^react\/jsx-runtime$/, replacement: preactEntry('preact/jsx-runtime') },
         { find: /^react\/jsx-dev-runtime$/, replacement: preactEntry('preact/jsx-dev-runtime') },
      ],
   },
});
