// Measures the Hub-served web (Hub web build behind a real compiled Hub, driven by headless Chromium): build sizes,
// cold/warm load, boot snapshot latency, realtime latency and static serving. Baselines for trend-spotting on one
// machine; there is no pass/fail.
//
//   npm run measure:hub-web      (builds dist/hub-web and dist/hub first when missing)
//
// Runs inside one vitest process (scripts/measure-hub-web.measure.ts) because the Hub client packages are TypeScript.
// The web root is precompressed first, as packaging does. The Hub runs with DUDE_HUB_TEST_RELAX_RATE_LIMITS=1 so the repeated loads are not throttled. Results go to stdout
// (JSON) and dist/measurements/hub-web.json.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const build = (script) => {
  const r = spawnSync(npm, ['run', script], { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) process.exit(r.status ?? 1);
};
if (!existsSync(path.join(root, 'dist', 'hub-web', 'browser', 'index.html'))) build('build:hub-web');
if (!existsSync(path.join(root, 'dist', 'hub', 'dude-hub.cjs'))) build('hub:compile');
// Packaged Hubs serve precompressed variants (hub:stage, hub:sea and the Docker image run compress-static); measure
// the same representation. Idempotent: existing .br/.gz files are kept.
const compress = spawnSync(process.execPath, ['scripts/compress-static.mjs', 'dist/hub-web/browser'], { cwd: root, stdio: 'inherit' });
if (compress.status !== 0) process.exit(compress.status ?? 1);

const vitest = path.join(root, 'node_modules', 'vitest', 'vitest.mjs');
const run = spawnSync(process.execPath, [vitest, 'run', '--config', 'scripts/measure-hub-web.vitest.config.mts'], {
  cwd: root, stdio: ['ignore', 'ignore', 'inherit'], env: { ...process.env, NO_COLOR: '1' },
});
if (run.status !== 0) process.exit(run.status ?? 1);
process.stdout.write(readFileSync(path.join(root, 'dist', 'measurements', 'hub-web.json'), 'utf8'));
