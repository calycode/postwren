import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';

const root = path.resolve(process.argv[2] ?? 'packages/docs/dist');
const port = Number(process.env.PORT ?? process.argv[3] ?? 3031);
const base = (process.env.DOCS_BASE ?? '').replace(/\/$/, '');

const types = new Map([
   ['.html', 'text/html; charset=utf-8'],
   ['.css', 'text/css; charset=utf-8'],
   ['.js', 'text/javascript; charset=utf-8'],
   ['.json', 'application/json; charset=utf-8'],
   ['.md', 'text/markdown; charset=utf-8'],
   ['.svg', 'image/svg+xml'],
   ['.png', 'image/png'],
   ['.jpg', 'image/jpeg'],
   ['.jpeg', 'image/jpeg'],
   ['.webp', 'image/webp'],
   ['.xml', 'application/xml; charset=utf-8'],
   ['.txt', 'text/plain; charset=utf-8'],
]);

function resolveFile(urlPath) {
   let pathname = decodeURIComponent(urlPath.split('?')[0]);
   if (base && pathname.startsWith(base)) pathname = pathname.slice(base.length) || '/';
   if (pathname.endsWith('/')) pathname += 'index.html';
   const target = path.resolve(root, `.${pathname}`);
   if (!target.startsWith(root + path.sep) && target !== root) return null;
   if (existsSync(target) && statSync(target).isFile()) return target;
   if (!path.extname(target) && existsSync(`${target}.html`)) return `${target}.html`;
   if (existsSync(path.join(target, 'index.html'))) return path.join(target, 'index.html');
   return null;
}

createServer((request, response) => {
   const file = resolveFile(request.url ?? '/');
   if (!file) {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('Not found');
      return;
   }

   const type = types.get(path.extname(file).toLowerCase()) ?? 'application/octet-stream';
   response.writeHead(200, {
      'content-type': type,
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
   });
   createReadStream(file).pipe(response);
}).listen(port, () => {
   console.log(`Serving ${root} on http://localhost:${port}${base || '/'}`);
});
