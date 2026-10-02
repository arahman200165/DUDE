// Manual local benchmark for desktop cold-start (DUDE_PRD.md §21 Phase 25 Item 12) -- never wired
// into CI, consistent with the existing `perf/` corpus's "reported, not gating" posture (§18.2).
// Spawns the already-built `dist/electron/main.js` with DUDE_PERF_LOG set, parses the `PERF <label>
// <elapsedMs>` lines `apps/desktop/perf-log.ts` prints, and reports a before/after-style table of
// deltas between consecutive marks.
//
// Usage: run `npm run electron:start`'s build step once, then:
//   node scripts/measure-desktop-startup.mjs
// (a plain `npm run measure:desktop-startup` does the build + compile + measure in one step)

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import electronPath from 'electron';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const MAIN_JS = path.join(ROOT, 'dist/electron/main.js');
const FINAL_MARK = 'load-url-done';
const TIMEOUT_MS = 30_000;

async function main() {
  const marks = [];

  const child = spawn(electronPath, [MAIN_JS], {
    cwd: ROOT,
    env: { ...process.env, DUDE_PERF_LOG: '1' },
    stdio: ['ignore', 'pipe', 'inherit'],
  });

  const timeout = setTimeout(() => {
    console.error(`Timed out after ${TIMEOUT_MS}ms waiting for "${FINAL_MARK}" -- killing the process.`);
    child.kill();
    process.exitCode = 1;
  }, TIMEOUT_MS);

  child.stdout.setEncoding('utf8');
  let buffer = '';
  child.stdout.on('data', (chunk) => {
    buffer += chunk;
    let newlineIndex;
    while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      const match = /^PERF (\S+) (\d+(?:\.\d+)?)$/.exec(line);
      if (!match) continue;
      const [, label, elapsedMs] = match;
      marks.push({ label, elapsedMs: Number(elapsedMs) });
      if (label === FINAL_MARK) {
        clearTimeout(timeout);
        child.kill();
      }
    }
  });

  await new Promise((resolve) => child.on('close', resolve));

  if (marks.length === 0) {
    console.error('No PERF marks were captured -- did dist/electron/main.js get built with electron:compile first?');
    process.exit(1);
  }

  console.log('\nDesktop cold-start marks:\n');
  console.log('Label'.padEnd(24), 'At (ms)'.padStart(10), 'Delta (ms)'.padStart(12));
  let previous = 0;
  for (const { label, elapsedMs } of marks) {
    console.log(label.padEnd(24), elapsedMs.toFixed(1).padStart(10), (elapsedMs - previous).toFixed(1).padStart(12));
    previous = elapsedMs;
  }
  console.log(`\nTotal (app-ready -> ${FINAL_MARK}): ${previous.toFixed(1)}ms\n`);
}

await main();
