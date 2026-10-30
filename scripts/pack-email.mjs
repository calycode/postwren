import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';

mkdirSync('artifacts', { recursive: true });
execSync('pnpm --filter @postwren/email build', { stdio: 'inherit' });
execSync('pnpm --filter @postwren/email exec npm pack --pack-destination ../../artifacts', {
   stdio: 'inherit',
});
