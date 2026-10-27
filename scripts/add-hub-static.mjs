#!/usr/bin/env node
/**
 * Copies the Hub-only static files (apps/hub/web-static: the Hub-offline page, the Hub service worker wrapper and its logic) into the Hub web
 * build, and with `--verify` proves they landed where the Hub-offline fallback needs them (32-SS1, Milestone 844, PD-123, PD-144).
 *
 * Why a post-build step and not an Angular asset: these files exist only in the Hub build (GitHub Pages and the desktop build never contain them),
 * and `ngsw.json` must hash `offline.html` into the prefetched `app` group, so the copy runs BEFORE `generate-offline-map.mjs` re-runs `ngsw-config`.
 *
 * Usage: node scripts/add-hub-static.mjs <browser dist dir>            (copy)
 *        node scripts/add-hub-static.mjs <browser dist dir> --verify   (after generate-offline-map: ngsw.json lists the offline page)
 */
import { copyFileSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const SOURCE_DIR = path.join(ROOT, 'apps', 'hub', 'web-static');
const target = process.argv[2];
const verify = process.argv.includes('--verify');
if (!target) {
  console.error('Usage: node scripts/add-hub-static.mjs <browser dist dir> [--verify]');
  process.exit(2);
}
const BROWSER_DIR = path.resolve(ROOT, target);
const NGSW_PATH = path.join(BROWSER_DIR, 'ngsw.json');

const files = readdirSync(SOURCE_DIR, { withFileTypes: true }).filter((e) => e.isFile()).map((e) => e.name);

if (!verify) {
  if (!existsSync(path.join(BROWSER_DIR, 'index.html'))) {
    console.error(`ERROR: ${BROWSER_DIR} is not a web build (no index.html).`);
    process.exit(1);
  }
  for (const name of files) copyFileSync(path.join(SOURCE_DIR, name), path.join(BROWSER_DIR, name));
  console.log(`Added the Hub-only static files to ${path.relative(ROOT, BROWSER_DIR)}: ${files.join(', ')}`);
  process.exit(0);
}

if (!existsSync(NGSW_PATH)) {
  console.log('No ngsw.json (service worker disabled for this build configuration), so skipping the Hub-offline verification.');
  process.exit(0);
}
const ngsw = JSON.parse(readFileSync(NGSW_PATH, 'utf8'));
const prefetched = new Set(ngsw.assetGroups.filter((g) => g.installMode === 'prefetch').flatMap((g) => g.urls));
const hashed = ngsw.hashTable ?? {};
if (!prefetched.has('/offline.html') || hashed['/offline.html'] === undefined) {
  console.error('ERROR: /offline.html is not in a prefetch asset group of ngsw.json, so the Hub-offline page would not be cached. Check ngsw-config.hub.json.');
  process.exit(1);
}
for (const name of ['hub-worker.js', 'hub-offline-logic.js', 'ngsw-worker.js']) {
  if (!existsSync(path.join(BROWSER_DIR, name))) {
    console.error(`ERROR: ${name} is missing from the Hub web build; the Hub-offline fallback needs it.`);
    process.exit(1);
  }
}
console.log('Hub-offline verified: /offline.html is prefetched by ngsw.json and the Hub worker files are present.');
