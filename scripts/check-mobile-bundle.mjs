import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const output = path.resolve('dist/mobile');
function maps(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? maps(file) : entry.name.endsWith('.map') ? [file] : [];
  });
}
const artifacts = maps(output);
if (!artifacts.length) throw new Error('Mobile bundle boundary check needs exported source maps; run mobile:bundle.');
const failures = new Set();
let sources = 0;
for (const file of artifacts) {
  const map = JSON.parse(readFileSync(file, 'utf8'));
  for (const raw of map.sources ?? []) {
    const source = raw.replaceAll('\\', '/');
    sources++;
    if (/\/node_modules\/(?:@angular\/|electron(?:\/|-)|ws\/|better-sqlite3\/)/.test(source) || /\/(?:apps|packages)\/(?:web|desktop|hub|device-agent|collab-relay|collab-protocol|sqlite-store|agent-pipe)\//.test(source)) failures.add(source);
    if (/\/packages\/tool-engine\//.test(source) && !/\/core\/registry\/tool-search\.(?:js|ts)$/.test(source)) failures.add(source);
    if (/\/packages\/persistence\/(?:src|dist)\/.*(?:browser|indexeddb|local-storage)/i.test(source)) failures.add(source);
  }
}
if (failures.size) throw new Error(`Forbidden mobile production bundle sources:\n${[...failures].join('\n')}`);
console.log(`Mobile production bundle boundaries pass (${sources} source-map entries).`);
