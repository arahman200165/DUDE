// Runs the backup v2 generated-scale spec at its full size (about 600 MiB, above the v1 512 MiB ceiling) with
// bounded-memory assertions. The normal package suite runs the same spec at 64 MiB; the Phase 32-SS1 exit suite
// (Milestone 854) runs this one. Usage: npm run test:backup-scale
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const result = spawnSync(
  process.execPath,
  [path.join(root, 'node_modules/vitest/vitest.mjs'), 'run', '--config', 'vitest.packages.config.mts', 'packages/hub-backup/src/backup-v2-scale.spec.ts'],
  { cwd: root, stdio: 'inherit', env: { ...process.env, DUDE_TEST_BIG: '1' } },
);
process.exit(result.status ?? 1);
