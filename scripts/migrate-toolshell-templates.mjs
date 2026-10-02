// One-time codemod (Milestone 301): strips the now-redundant title="..."/status="..."
// attributes from every tool's <app-tool-shell> opening tag, since ToolShell resolves
// both from the registered ToolDefinition itself (DUDE_PRD.md §21 Phase 22 Items 2/6).
// [networkRequired]="..." bindings are left untouched — a handful of tools have a
// genuinely dynamic (not just registry-static) network need and keep overriding it.
//
// Usage: node scripts/migrate-toolshell-templates.mjs

import { readdirSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const TOOLS_DIR = path.join(ROOT, 'apps/web/src/app/tools');

function findHtmlFiles(dir) {
  const results = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findHtmlFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.html')) {
      results.push(full);
    }
  }
  return results;
}

// Matched against the raw file text (not a split line) so CRLF-vs-LF line endings never
// matter — this only needs to find the opening tag up to its first `>`.
const OPENING_TAG = /^<app-tool-shell\b[^>]*>/;

let changed = 0;
let checked = 0;

for (const htmlFile of findHtmlFiles(TOOLS_DIR)) {
  const text = readFileSync(htmlFile, 'utf8');
  const match = text.match(OPENING_TAG);
  if (!match) continue;
  checked += 1;

  const originalTag = match[0];
  const updatedTag = originalTag
    .replace(/\s+title="(?:[^"\\]|\\.)*"/, '')
    .replace(/\s+status="(?:[^"\\]|\\.)*"/, '');

  if (updatedTag !== originalTag) {
    writeFileSync(htmlFile, updatedTag + text.slice(originalTag.length), 'utf8');
    changed += 1;
  }
}

console.log(`Checked ${checked} tool templates, updated ${changed}.`);
