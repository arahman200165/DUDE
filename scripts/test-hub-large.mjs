// The over-512 MiB exit run for backup scale (32-SS1, Milestone 854): the REAL Hub engine and restore, with bounded resident memory, over about
// 590 MiB of generated blobs (`apps/hub/src/backup/backup-large.spec.ts`, enabled by DUDE_TEST_BIG=1), after the format-level run of
// `npm run test:backup-scale` (600 MiB through `@dude/hub-backup` with deterministic memory counters). About 2 GiB of temporary disk and a
// minute or two. Usage: npm run test:hub:large
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const result = spawnSync(
  process.execPath,
  [path.join(root, 'node_modules/vitest/vitest.mjs'), 'run', '--config', 'vitest.hub.config.mts', 'apps/hub/src/backup/backup-large.spec.ts'],
  { cwd: root, stdio: 'inherit', env: { ...process.env, DUDE_TEST_BIG: '1' } },
);
process.exit(result.status ?? 1);
