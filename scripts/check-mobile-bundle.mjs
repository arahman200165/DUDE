import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const FORBIDDEN_DEPENDENCIES = /\/node_modules\/(?:@angular\/|electron(?:\/|-)|ws\/|better-sqlite3\/)/;
const FORBIDDEN_WORKSPACES = /\/(?:apps|packages)\/(?:web|desktop|hub|device-agent|collab-relay|collab-protocol|collab-doc|sqlite-store|agent-pipe)\//;
// The measurement harness (apps/mobile/src/tools/_measure) is compiled in only when EXPO_PUBLIC_DUDE_MEASURE=1 was set at build time.
const MEASUREMENT_MODULE = /\/apps\/mobile\/src\/tools\/_measure\//;
const FORBIDDEN_PERSISTENCE = /\/packages\/persistence\/(?:src|dist)\/.*(?:browser|indexeddb|local-storage)/i;

/**
 * Classifies exported source-map entries. Each rule is a standalone check: host sources (Angular, Electron, ws,
 * better-sqlite3 and the web/desktop/hub workspaces) and browser persistence adapters never belong in the mobile bundle.
 * Tool engines (@dude/tool-engine/tools|shared, @dude/crypto) are allowed: Hermes exports one bundle, so keeping them out
 * of the shell's static graph is enforced by tests/mobile-lazy-tools.test.mjs rather than an entry-chunk check here.
 */
export function bundleSourceFailures(rawSources, { allowMeasurement = false } = {}) {
  const failures = new Set();
  for (const raw of rawSources) {
    const source = raw.replaceAll('\\', '/');
    if (FORBIDDEN_DEPENDENCIES.test(source)) failures.add(source);
    if (FORBIDDEN_WORKSPACES.test(source)) failures.add(source);
    if (FORBIDDEN_PERSISTENCE.test(source)) failures.add(source);
    if (!allowMeasurement && MEASUREMENT_MODULE.test(source)) failures.add(source);
  }
  return [...failures];
}

function maps(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? maps(file) : entry.name.endsWith('.map') ? [file] : [];
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const artifacts = maps(path.resolve('dist/mobile'));
  if (!artifacts.length) throw new Error('Mobile bundle boundary check needs exported source maps; run mobile:bundle.');
  const failures = new Set();
  let sources = 0;
  for (const file of artifacts) {
    const entries = JSON.parse(readFileSync(file, 'utf8')).sources ?? [];
    sources += entries.length;
    for (const failure of bundleSourceFailures(entries, { allowMeasurement: process.env.EXPO_PUBLIC_DUDE_MEASURE === '1' })) failures.add(failure);
  }
  if (failures.size) throw new Error(`Forbidden mobile production bundle sources:\n${[...failures].join('\n')}`);
  console.log(`Mobile production bundle boundaries pass (${sources} source-map entries).`);
}
