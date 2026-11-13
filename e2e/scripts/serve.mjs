import { rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { killPid } from './cleanup.mjs';

// Plain Node so this can run before Playwright loads TypeScript. Kept in sync
// with e2e/support/paths.ts by hand; both are two lines.
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const port = 8791;
const persistDir = path.join(rootDir, '.wrangler/e2e');
const pidFile = path.join(rootDir, '.wrangler/e2e-server.pid');
const config = path.join(rootDir, 'e2e/wrangler.jsonc');
const wrangler = path.join(rootDir, 'node_modules/wrangler/bin/wrangler.js');

rmSync(persistDir, { recursive: true, force: true });
// wrangler writes its dev bundle next to the config; start from an empty one.
rmSync(path.join(rootDir, 'e2e/.wrangler'), { recursive: true, force: true });

const migrate = spawnSync(
   process.execPath,
   [
      wrangler,
      'd1',
      'migrations',
      'apply',
      'DB',
      '--local',
      '--config',
      config,
      '--persist-to',
      persistDir,
   ],
   { cwd: rootDir, stdio: 'inherit' },
);

if (migrate.status !== 0) {
   process.exit(migrate.status ?? 1);
}

const server = spawn(
   process.execPath,
   [
      wrangler,
      'dev',
      '--config',
      config,
      '--port',
      String(port),
      '--persist-to',
      persistDir,
      '--test-scheduled',
      '--show-interactive-dev-session=false',
   ],
   { cwd: rootDir, stdio: 'inherit' },
);

// Recorded so the next run can kill wrangler and its workerd child even when
// Playwright force-kills this process.
if (server.pid !== undefined) {
   writeFileSync(pidFile, String(server.pid));
}

function shutdown() {
   if (server.pid !== undefined) {
      killPid(server.pid);
      rmSync(pidFile, { force: true });
   }
}

process.once('SIGINT', () => {
   shutdown();
   process.exit(0);
});
process.once('SIGTERM', () => {
   shutdown();
   process.exit(0);
});
process.once('exit', shutdown);

server.on('exit', (code, signal) => {
   process.exit(code ?? (signal === null ? 0 : 1));
});

console.log(`e2e worker starting on http://localhost:${port} (persist: ${persistDir})`);
