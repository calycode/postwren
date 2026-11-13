import { readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { killPid, killPort } from './cleanup.mjs';

// Playwright checks the webServer URL before running the serve script, so a
// workerd left behind by an interrupted run must be cleared first. Runs from the
// npm scripts, before `playwright test`.
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const pidFile = path.join(rootDir, '.wrangler/e2e-server.pid');
const port = 8791;

try {
   const pid = Number(readFileSync(pidFile, 'utf8').trim());
   if (Number.isInteger(pid) && pid > 0) killPid(pid);
} catch {
   // No previous run.
}

rmSync(pidFile, { force: true });
killPort(port);
