#!/usr/bin/env node
/**
 * Phase 30J design-token guard. Scans src/app/shell and src/app/shared
 * (templates, inline templates, component CSS; specs excluded) for:
 *
 *   spacing   - Tailwind spacing utilities off the compact scale
 *   arbitrary - arbitrary px/rem values (p-[13px], w-[43rem] is allowed via
 *               --allow-arbitrary-sizes only in ALLOWED_ARBITRARY)
 *   radius    - rounded-lg and larger (small radius band is 3-5px)
 *   hex       - raw hex colors in .html/.css (use tokens.css colors)
 *   wash      - category wash surfaces used outside hover/selected/active states
 *
 * Scale (rem root = 16px): 0, px, 0.5 (2px), 1 (4px), 1.5 (6px), 2 (8px),
 * 3 (12px), 4 (16px), 6 (24px). Everything else is a violation.
 *
 * Usage: node scripts/check-design-tokens.mjs [--enforce]
 * Without --enforce it reports and exits 0 (report mode used while the audit
 * is in progress); with --enforce any violation exits 1.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const SCAN_DIRS = ['src/app/shell', 'src/app/shared'];
const EXTENSIONS = new Set(['.html', '.ts', '.css']);
const enforce = process.argv.includes('--enforce');

const SCALE = new Set(['0', 'px', '0.5', '1', '1.5', '2', '3', '4', '6']);
const SPACING_PREFIX = '(?:p|px|py|pt|pr|pb|pl|ps|pe|m|mx|my|mt|mr|mb|ml|ms|me|gap|gap-x|gap-y|space-x|space-y)';
const SPACING_RE = new RegExp(`(?<![\\w-])-?${SPACING_PREFIX}-(\\d+(?:\\.\\d+)?|px)(?![\\w.\\[/-]|\\.\\d)`, 'g');
const ARBITRARY_RE = /(?<![\w-])(?:p|px|py|pt|pr|pb|pl|m|mx|my|mt|mr|mb|ml|gap|gap-x|gap-y|space-x|space-y|w|h|min-w|min-h|max-w|max-h|text|rounded)-\[\d*\.?\d+(?:px|rem)\]/g;
const RADIUS_RE = /(?<![\w-])rounded(?:-[a-z]{1,2})?-(?:lg|xl|2xl|3xl)(?![\w-])/g;
const HEX_RE = /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g;
const WASH_RE = /(?<![:\w])(?:bg-cat-[\w${}.()\s+'\-]*-wash|bg-\$\{[^}]*\}-wash)/g;

// Sizes that are structural (overlay widths, etc.) rather than spacing. Keep
// this list short and justified; add entries only with a reason.
const ALLOWED_ARBITRARY = new Set([
  // command-palette container width
  'w-[43.08rem]',
]);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (
      EXTENSIONS.has(name.slice(name.lastIndexOf('.'))) &&
      !name.endsWith('.spec.ts')
    ) {
      out.push(full);
    }
  }
  return out;
}

function lineOf(text, index) {
  let line = 1;
  for (let i = 0; i < index; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
}

const violations = [];
function add(rule, file, text, match) {
  violations.push({
    rule,
    file: relative(ROOT, file).split(sep).join('/'),
    line: lineOf(text, match.index),
    snippet: match[0].trim(),
  });
}

for (const dir of SCAN_DIRS) {
  for (const file of walk(join(ROOT, dir))) {
    const text = readFileSync(file, 'utf8');
    const isMarkup = file.endsWith('.html') || file.endsWith('.css');
    for (const m of text.matchAll(SPACING_RE)) {
      if (!SCALE.has(m[1])) add('spacing', file, text, m);
    }
    for (const m of text.matchAll(ARBITRARY_RE)) {
      if (!ALLOWED_ARBITRARY.has(m[0])) add('arbitrary', file, text, m);
    }
    for (const m of text.matchAll(RADIUS_RE)) add('radius', file, text, m);
    if (isMarkup) for (const m of text.matchAll(HEX_RE)) add('hex', file, text, m);
    for (const m of text.matchAll(WASH_RE)) add('wash', file, text, m);
  }
}

const byRule = new Map();
for (const v of violations) byRule.set(v.rule, (byRule.get(v.rule) ?? 0) + 1);

for (const v of violations) console.log(`${v.file}:${v.line}  [${v.rule}] ${v.snippet}`);
console.log(
  `\ncheck-design-tokens: ${violations.length} violation(s)` +
    (violations.length ? ` (${[...byRule].map(([r, n]) => `${r}: ${n}`).join(', ')})` : '') +
    (enforce ? '' : ' [report mode]'),
);
process.exit(enforce && violations.length ? 1 : 0);
