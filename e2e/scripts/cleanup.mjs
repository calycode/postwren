import { spawnSync } from 'node:child_process';

export function killPid(pid) {
   if (process.platform === 'win32') {
      spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
      return;
   }

   try {
      process.kill(pid, 'SIGTERM');
   } catch {
      // Already gone.
   }
}

/** Kills whatever listens on a TCP port. Used only for the dedicated e2e port. */
export function killPort(port) {
   if (process.platform === 'win32') {
      // Get-NetTCPConnection also sees bound sockets that netstat omits.
      const powershell = spawnSync(
         'powershell.exe',
         [
            '-NoProfile',
            '-NonInteractive',
            '-Command',
            `(Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue).OwningProcess | Sort-Object -Unique`,
         ],
         { encoding: 'utf8' },
      );

      const pids = (powershell.stdout ?? '').split(/\s+/).filter((pid) => /^\d+$/.test(pid));
      if (pids.length > 0) {
         for (const pid of pids) killPid(Number(pid));
         return;
      }

      const netstat = spawnSync('netstat', ['-ano', '-p', 'tcp'], { encoding: 'utf8' });
      for (const line of (netstat.stdout ?? '').split('\n')) {
         if (!line.includes(`:${port} `) || !line.includes('LISTENING')) continue;
         const pid = line.trim().split(/\s+/).pop();
         if (pid !== undefined && /^\d+$/.test(pid)) killPid(Number(pid));
      }
      return;
   }

   const lsof = spawnSync('lsof', ['-ti', `tcp:${port}`, '-sTCP:LISTEN'], { encoding: 'utf8' });
   for (const pid of (lsof.stdout ?? '').split('\n')) {
      if (pid.trim().length === 0) continue;
      try {
         process.kill(Number(pid.trim()), 'SIGKILL');
      } catch {
         // Already gone.
      }
   }
}
