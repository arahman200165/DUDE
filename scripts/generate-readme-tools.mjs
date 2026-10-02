// Regenerates README.md's tool count and Tools table from the distributed
// apps/web/src/app/tools/**/<id>.manifest.ts files (DUDE_PRD.md Phase 22 Item 4) — these were
// previously hand-maintained and only drift-checked (tool-count.spec.ts) rather than
// generated outright.
//
// Usage: node scripts/generate-readme-tools.mjs

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readManifests } from './tool-manifests.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const TOOLS_DIR = path.join(ROOT, 'packages/tool-registry/src/tools');
const README_PATH = path.join(ROOT, 'README.md');
const BASE_URL = 'https://arahman200165.github.io/DUDE';

// Mirrors packages/shared-types/src/shared/models/tool-category.model.ts's CATEGORY_METADATA order/labels.
// Categories are a closed, rarely-changed 8-value set (root AGENTS.md) — if that file ever
// gains/renames a category, update this alongside it.
const CATEGORY_LABELS = {
  data: 'Data',
  text: 'Text',
  encoding: 'Encoding',
  security: 'Security',
  'date-time': 'Date & Time',
  web: 'Web',
  developer: 'Developer',
  documents: 'Documents',
};
const CATEGORY_ORDER = Object.keys(CATEGORY_LABELS);

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

function unescapeQuoted(str) {
  return str.replace(/\\(.)/g, '$1');
}

function extractField(text, field) {
  // Prettier switches a string literal to double quotes instead of escaping an apostrophe
  // inside it (e.g. a description like "...a password's entropy...") — support both.
  const match =
    text.match(new RegExp(`${field}:\\s*'((?:[^'\\\\]|\\\\.)*)'`)) ??
    text.match(new RegExp(`${field}:\\s*"((?:[^"\\\\]|\\\\.)*)"`));
  if (!match) throw new Error(`Could not find field "${field}" in manifest text`);
  return unescapeQuoted(match[1]);
}

const tools = readManifests().map(({metadata}) => metadata);

const grouped = new Map(CATEGORY_ORDER.map((category) => [category, []]));
for (const tool of tools) {
  if (!grouped.has(tool.category)) throw new Error(`Tool "${tool.id}" has unknown category "${tool.category}"`);
  grouped.get(tool.category).push(tool);
}
for (const list of grouped.values()) list.sort((a, b) => a.id.localeCompare(b.id));

const tableRows = CATEGORY_ORDER.flatMap((category) =>
  grouped.get(category).map(
    (tool) => `| [${tool.title}](${BASE_URL}${tool.route}) | ${CATEGORY_LABELS[category]} | ${tool.description} |`,
  ),
);

// Defensively normalize CRLF -> LF on read (a Windows checkout may have autocrlf-converted this
// file), the same normalization tool-count.spec.ts already applies -- but never assume it, since
// the committed blob itself is LF (git normalizes on commit) and a Linux CI checkout gives LF as-is.
let readme = readFileSync(README_PATH, 'utf8').replace(/\r\n/g, '\n');

const countPattern = /\d+ tools ship today/;
if (!countPattern.test(readme)) throw new Error('README.md is missing the "N tools ship today" line');
readme = readme.replace(countPattern, `${tools.length} tools ship today`);

const tableSectionPattern = /(\| Tool \| Category \| What it does \|\n\| --- \| --- \| --- \|\n)([\s\S]*?)(\n## )/;
if (!tableSectionPattern.test(readme)) throw new Error('README.md is missing the Tools table section');
readme = readme.replace(tableSectionPattern, (_match, header, _oldRows, nextHeading) => {
  return `${header}${tableRows.join('\n')}${nextHeading}`;
});

// Plain `\n` on write -- forcing `\r\n` made every line differ from the LF-stored blob on a
// Linux CI runner (no autocrlf conversion there), failing the "up to date" staleness check even
// when the content itself hadn't changed at all.
writeFileSync(README_PATH, readme, 'utf8');
console.log(`Regenerated README.md's tool count (${tools.length}) and Tools table (${tableRows.length} rows).`);
