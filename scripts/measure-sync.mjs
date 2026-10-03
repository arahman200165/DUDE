// Measures Hub synchronization (Phase 31D, M661): push throughput, catch-up, conflict handling, DB/outbox growth,
// compaction and the record-size boundary. Baselines for trend-spotting on one machine; there is no pass/fail.
//
//   npm run hub:compile && npm run measure:sync
//
// The Hub is the compiled dist/hub/dude-hub.cjs, driven over HTTPS by simulated Ed25519 devices; the device-side store
// numbers use the real device-agent store modules. Both run inside one vitest process (scripts/measure-sync.measure.ts)
// because the packages are TypeScript. Results go to stdout (JSON) and dist/measurements/sync.json.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
if (!existsSync(path.join(root, 'dist', 'hub', 'dude-hub.cjs'))) throw new Error('dist/hub/dude-hub.cjs is missing; run `npm run hub:compile` first.');

const vitest = path.join(root, 'node_modules', 'vitest', 'vitest.mjs');
const run = spawnSync(process.execPath, [vitest, 'run', '--config', 'scripts/measure-sync.vitest.config.mts'], {
  cwd: root, stdio: ['ignore', 'ignore', 'inherit'], env: { ...process.env, NO_COLOR: '1' },
});
if (run.status !== 0) process.exit(run.status ?? 1);
process.stdout.write(readFileSync(path.join(root, 'dist', 'measurements', 'sync.json'), 'utf8'));
