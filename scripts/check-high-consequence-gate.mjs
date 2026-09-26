// Capability-specific release gate (DUDE_PRD.md §21 Phase 23 Item 12) -- runs every spec file
// belonging to a tool tagged with a ConsequenceClass (crypto/authentication/code-execution/
// secret-management today; filesystem-write/process-management/registry/network-scanning/
// database-write reserved for Phase 27+) as its own, separately-labeled step, so a
// high-consequence failure reads unambiguously in CI logs even though `npm test` already blocks
// on any failure today.
//
// Usage: node scripts/check-high-consequence-gate.mjs

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const TOOLS_DIR = path.join(ROOT, 'src/app/tools');

function findManifests(dir) {
  const results = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findManifests(full));
    } else if (entry.isFile() && entry.name.endsWith('.manifest.ts')) {
      results.push(full);
    }
  }
  return results;
}

function extractField(text, field) {
  const match = text.match(new RegExp(`${field}:\\s*'((?:[^'\\\\]|\\\\.)*)'`));
  return match ? match[1].replace(/\\(.)/g, '$1') : undefined;
}

function extractStringArray(text, field) {
  const match = text.match(new RegExp(`${field}:\\s*\\[([^\\]]*)\\]`));
  if (!match) return [];
  return [...match[1].matchAll(/'((?:[^'\\]|\\.)*)'/g)].map((m) => m[1].replace(/\\(.)/g, '$1'));
}

const highConsequenceIds = findManifests(TOOLS_DIR)
  .map((manifestPath) => {
    const text = readFileSync(manifestPath, 'utf8');
    return { id: extractField(text, 'id'), consequenceClass: extractStringArray(text, 'consequenceClass') };
  })
  .filter((tool) => tool.consequenceClass.length > 0)
  .map((tool) => tool.id)
  .sort();

if (highConsequenceIds.length === 0) {
  console.log('Capability-specific release gate: no high-consequence tools found -- nothing to gate.');
  process.exit(0);
}

console.log(
  `Capability-specific release gate: running specs for ${highConsequenceIds.length} high-consequence tools (${highConsequenceIds.join(', ')})`,
);

const includeArgs = highConsequenceIds.map((id) => `--include=src/app/tools/${id}`);
const result = spawnSync('npx', ['ng', 'test', ...includeArgs, '--watch=false'], {
  stdio: 'inherit',
  shell: true,
  cwd: ROOT,
});

if (result.status !== 0) {
  console.error('\nCapability-specific release gate FAILED -- a high-consequence tool has a failing spec.');
}
process.exit(result.status ?? 1);
