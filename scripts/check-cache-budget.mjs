// Measures the offline Cache Storage footprint the Angular service worker will actually
// populate, broken down by asset group (DUDE_PRD.md §21 Phase 22 Item 8) — the CLI's
// angular.json budgets only cover individual build artifacts, never the aggregate PWA cache,
// so a large WASM/vendor addition (pyodide, sql.js, xmllint-wasm) could grow the offline
// footprint substantially without ever tripping a bundle budget.
//
// Enforces a hard limit only on the "app" group (installMode: prefetch — downloaded on
// every first visit before the page is even interactive); every lazy group is reported for
// visibility, not capped, since large-but-lazy WASM runtimes are a deliberate, already-lazy
// design choice (ngsw-config.json), not something that should fail a build.
//
// Usage: node scripts/check-cache-budget.mjs (run as a postbuild step)

import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const BROWSER_DIR = path.join(ROOT, 'dist/dude/browser');
const NGSW_PATH = path.join(BROWSER_DIR, 'ngsw.json');

// The one group this fails the build over: everything downloaded unconditionally before the
// app is even interactive. Today's actual total is ~640kB (main bundle + styles + shell
// assets) — this leaves meaningful headroom while still catching a real regression (e.g. an
// eager import accidentally pulling a heavy library into the prefetched shell).
const PREFETCH_GROUP_NAME = 'app';
const PREFETCH_BUDGET_BYTES = 800 * 1024;

function formatBytes(bytes) {
  return `${(bytes / 1024).toFixed(1)} kB`;
}

if (!statSync(NGSW_PATH, { throwIfNoEntry: false })) {
  // The electron build configuration sets serviceWorker: false (angular.json) — no ngsw.json
  // is generated there, and this check is meaningless for a build with no offline cache at all.
  console.log(`No ${path.relative(ROOT, NGSW_PATH)} found (service worker disabled for this build configuration) — skipping cache budget check.`);
  process.exit(0);
}

const ngsw = JSON.parse(readFileSync(NGSW_PATH, 'utf8'));
const indexUrl = ngsw.index; // e.g. "/DUDE/index.html" — baseHref is everything before "index.html"
const basePrefix = indexUrl.replace(/index\.html$/, '');

let prefetchTotal = 0;
let sawError = false;

console.log('Offline cache footprint by asset group:');
for (const group of ngsw.assetGroups ?? []) {
  let total = 0;
  for (const url of group.urls) {
    const relativePath = url.startsWith(basePrefix) ? url.slice(basePrefix.length) : url.replace(/^\//, '');
    const filePath = path.join(BROWSER_DIR, relativePath);
    total += statSync(filePath).size;
  }
  console.log(`  ${group.name.padEnd(16)} ${group.installMode.padEnd(8)} ${group.urls.length} files, ${formatBytes(total)}`);
  if (group.name === PREFETCH_GROUP_NAME) prefetchTotal = total;
}

console.log(`\nPrefetched ("${PREFETCH_GROUP_NAME}") total: ${formatBytes(prefetchTotal)} (budget: ${formatBytes(PREFETCH_BUDGET_BYTES)})`);

if (prefetchTotal > PREFETCH_BUDGET_BYTES) {
  console.error(
    `\nERROR: the "${PREFETCH_GROUP_NAME}" group (installMode: prefetch) exceeds its ${formatBytes(PREFETCH_BUDGET_BYTES)} budget by ${formatBytes(prefetchTotal - PREFETCH_BUDGET_BYTES)}.\n` +
      'This is the code/CSS downloaded on every first visit before the app is interactive — check ngsw-config.json\'s "app" group and angular.json\'s "initial" budget for what grew.',
  );
  sawError = true;
}

if (sawError) process.exit(1);
