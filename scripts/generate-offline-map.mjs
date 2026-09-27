// Builds dist/dude/browser/offline-map.json (DUDE_PRD.md §21 Phase 26 Items 4, 5, 10), which
// maps each tool to the lazy files it needs and each service-worker asset group to its URLs and
// build size. Chunk names are content-hashed and unknown until build time, so the renderer can't
// answer "is this tool available offline?" or "how big is the pyodide runtime?" without it.
//
// Sources:
// - dist/dude/stats.json: the esbuild metafile, emitted by `statsJson: true` in angular.json's
//   production config.
//   - A tool's files are every output whose entryPoint lives under src/app/tools/<id>/ (its
//     component chunk, pipeline/workspace step chunks, and workers), plus the transitive static and
//     dynamic imports of those outputs.
//   - The traversal stops at outputs that belong to another tool and at prefetched `app`-group
//     files, which are always cached already.
// - dist/dude/browser/ngsw.json: each asset group's URLs.
//
// The map must itself work offline, so after writing it this script re-runs Angular's
// `ngsw-config` CLI. That regenerates ngsw.json with offline-map.json in the prefetched `app`
// group and a correct hash in hashTable.
//
// Usage: node scripts/generate-offline-map.mjs  (postbuild, before check-cache-budget.mjs)

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const BROWSER_DIR = path.join(ROOT, 'dist/dude/browser');
const STATS_PATH = path.join(ROOT, 'dist/dude/stats.json');
const NGSW_PATH = path.join(BROWSER_DIR, 'ngsw.json');
const MAP_NAME = 'offline-map.json';
const TOOL_ENTRY = /^src\/app\/tools\/([^/]+)\//;

if (!existsSync(NGSW_PATH)) {
  console.log('No ngsw.json (service worker disabled for this build configuration), so skipping the offline map.');
  process.exit(0);
}
if (!existsSync(STATS_PATH)) {
  console.error(`ERROR: ${path.relative(ROOT, STATS_PATH)} is missing. The production build must set "statsJson": true (angular.json).`);
  process.exit(1);
}

const { outputs } = JSON.parse(readFileSync(STATS_PATH, 'utf8'));
const ngsw = JSON.parse(readFileSync(NGSW_PATH, 'utf8'));
const basePrefix = ngsw.index.replace(/index\.html$/, '');
const relative = (url) => (url.startsWith(basePrefix) ? url.slice(basePrefix.length) : url.replace(/^\//, ''));
const sizeOf = (file) => statSync(path.join(BROWSER_DIR, file), { throwIfNoEntry: false })?.size ?? 0;

const prefetched = new Set(
  ngsw.assetGroups.filter((group) => group.installMode === 'prefetch').flatMap((group) => group.urls.map(relative)),
);
const ownerOf = (file) => TOOL_ENTRY.exec(outputs[file]?.entryPoint ?? '')?.[1];

// Walks `roots` plus every static import (and, when `dynamic`, every dynamic import) reachable
// from them. It stops at prefetched shell files and at outputs owned by a different tool.
function closure(id, roots, dynamic) {
  const found = new Set(roots);
  const queue = [...roots];
  while (queue.length) {
    const file = queue.pop();
    for (const { path: imported, kind } of outputs[file]?.imports ?? []) {
      if (found.has(imported) || prefetched.has(imported) || !imported.endsWith('.js')) continue;
      if (!dynamic && kind !== 'import-statement') continue;
      const owner = ownerOf(imported);
      if (owner && owner !== id) continue;
      found.add(imported);
      queue.push(imported);
    }
  }
  return found;
}

const owned = {};
for (const file of Object.keys(outputs)) {
  const owner = ownerOf(file);
  if (!owner || !file.endsWith('.js')) continue;
  (owned[owner] ??= []).push(file);
}

// `open` is what a plain route visit fetches: the component chunk (`<id>/<id>.ts`, the manifest's
// `load()` target) and its static imports. That's the readiness bar for "opens offline".
// `extra` is everything else the tool can pull in later: workers, pipeline/workspace step chunks,
// and lazily imported libraries. "Make available offline" downloads both.
const tools = {};
for (const [id, files] of Object.entries(owned)) {
  const component = files.filter((file) => outputs[file].entryPoint === `src/app/tools/${id}/${id}.ts`);
  const open = closure(id, component.length ? component : files, false);
  const all = closure(id, files, true);
  tools[id] = { open, extra: new Set([...all].filter((file) => !open.has(file))) };
}

// Lazy shell destinations (History, Pipelines, Settings sections, ...) are code-split too, and
// can't be opened offline until cached. They're too large to prefetch (~0.8 MB), so they're listed
// for "Make available offline" instead.
const shellRoots = Object.keys(outputs).filter(
  (file) => file.endsWith('.js') && !prefetched.has(file) && /^src\/app\/(shell|core|shared)\//.test(outputs[file].entryPoint ?? ''),
);
const shell = closure(undefined, shellRoots, false);

// Shared chunks recur across hundreds of tools, so tools and groups reference one deduplicated
// `files`/`sizes` table by index. The map ships in the prefetched shell, so its size counts
// against the app-group budget.
const fileIndex = new Map();
const files = [];
const sizes = [];
const indexOf = (file) => {
  if (!fileIndex.has(file)) {
    fileIndex.set(file, files.length);
    files.push(file);
    sizes.push(sizeOf(file));
  }
  return fileIndex.get(file);
};

const map = {
  schemaVersion: 2,
  files,
  sizes,
  tools: Object.fromEntries(
    Object.entries(tools)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([id, { open, extra }]) => [id, { open: [...open].sort().map(indexOf), extra: [...extra].sort().map(indexOf) }]),
  ),
  shell: [...shell].sort().map(indexOf),
  groups: Object.fromEntries(
    ngsw.assetGroups.map((group) => [group.name, { installMode: group.installMode, files: group.urls.map(relative).map(indexOf) }]),
  ),
};

writeFileSync(path.join(BROWSER_DIR, MAP_NAME), JSON.stringify(map), 'utf8');

// Regenerate ngsw.json so the new file is hashed into the prefetched app group (ngsw-config.json
// lists `/offline-map.json` there). Base href comes from the ngsw.json the build just produced.
const cli = path.join(ROOT, 'node_modules/@angular/service-worker/ngsw-config.js');
// The CLI joins both paths onto process.cwd(), so they must be relative to ROOT.
execFileSync(process.execPath, [cli, path.relative(ROOT, BROWSER_DIR), 'ngsw-config.json', basePrefix], {
  cwd: ROOT,
  stdio: 'inherit',
});
const regenerated = JSON.parse(readFileSync(NGSW_PATH, 'utf8'));
if (!regenerated.assetGroups.some((group) => group.urls.includes(`${basePrefix}${MAP_NAME}`))) {
  console.error(`ERROR: ${MAP_NAME} isn't in any ngsw asset group after regeneration. Check ngsw-config.json's "app" group.`);
  process.exit(1);
}

console.log(`Wrote ${MAP_NAME}: ${Object.keys(map.tools).length} tools, ${Object.keys(map.groups).length} asset groups.`);
