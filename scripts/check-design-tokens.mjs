#!/usr/bin/env node
/**
 * Phase 30J/30K design-token guard. Scans apps/web/src/app/shell, apps/web/src/app/shared and
 * apps/web/src/app/tools (templates, inline templates, component CSS; specs excluded).
 *
 * shell/ and shared/ are checked against every rule below. tools/ is checked
 * ONLY against the color rules (palette, text-bg, hex in .html/.css) because the
 * spacing/radius rules would flood hundreds of pre-existing tool layouts.
 *
 *   spacing   - Tailwind spacing utilities off the compact scale
 *   arbitrary - arbitrary px/rem values (p-[13px], w-[43rem] is allowed via
 *               --allow-arbitrary-sizes only in ALLOWED_ARBITRARY)
 *   radius    - rounded-lg and larger (small radius band is 3-5px)
 *   hex       - raw hex colors in .html/.css (use tokens.css colors)
 *   wash      - category wash surfaces used outside hover/selected/active states
 *   palette   - raw Tailwind palette colors (text-red-400, bg-black/75, hover:bg-white)
 *               in .html/.ts class contexts; use theme tokens (bg-error, bg-scrim ...)
 *   text-bg   - the retired `text-bg` token; use `text-on-accent` on accent fills
 *   text-opacity - an opacity modifier on a text-color token (`text-text-muted/70`,
 *               `placeholder:text-text-muted/60`, `hover:text-accent/80` ...). Alpha silently drops
 *               text below the 4.5:1 that check-theme-contrast.mjs proves for the solid token, so
 *               drop the modifier (`text-text-muted`). Also scans apps/web/src/styles.css (dude-* utilities).
 *
 * `hex` also applies to tools/**\/*.html and *.css (hex in tool .ts is data).
 * Per-rule exemptions live in scripts/design-token-allowlist.json
 * ({ "<rule>": ["repo/relative/path"], "_comment": "justification" }) if present.
 *
 * Scale (rem root = 16px): 0, px, 0.5 (2px), 1 (4px), 1.5 (6px), 2 (8px),
 * 3 (12px), 4 (16px), 6 (24px). Everything else is a violation.
 *
 * Usage: node scripts/check-design-tokens.mjs [--enforce]
 * Without --enforce it reports and exits 0 (report mode used while the audit
 * is in progress); with --enforce any violation exits 1.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const SCAN_DIRS = [
  { dir: 'apps/web/src/app/shell', full: true },
  { dir: 'apps/web/src/app/shared', full: true },
  { dir: 'apps/web/src/app/tools', full: false },
];
const EXTENSIONS = new Set(['.html', '.ts', '.css']);
const enforce = process.argv.includes('--enforce');

const SCALE = new Set(['0', 'px', '0.5', '1', '1.5', '2', '3', '4', '6']);
const SPACING_PREFIX = '(?:p|px|py|pt|pr|pb|pl|ps|pe|m|mx|my|mt|mr|mb|ml|ms|me|gap|gap-x|gap-y|space-x|space-y)';
const SPACING_RE = new RegExp(`(?<![\\w-])-?${SPACING_PREFIX}-(\\d+(?:\\.\\d+)?|px)(?![\\w.\\[/-]|\\.\\d)`, 'g');
const ARBITRARY_RE = /(?<![\w-])(?:p|px|py|pt|pr|pb|pl|m|mx|my|mt|mr|mb|ml|gap|gap-x|gap-y|space-x|space-y|w|h|min-w|min-h|max-w|max-h|text|rounded)-\[\d*\.?\d+(?:px|rem)\]/g;
const RADIUS_RE = /(?<![\w-])rounded(?:-[a-z]{1,2})?-(?:lg|xl|2xl|3xl)(?![\w-])/g;
const HEX_RE = /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g;
const WASH_RE = /^.*-wash.*$/gm;
const WASH_STATE_RE = /hover:|selected|active/i;

const PALETTE_NAMES =
  'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose';
const PALETTE_PREFIX =
  'text|bg|border(?:-[trblxyse])?|ring|outline|fill|stroke|from|via|to|divide|placeholder|accent|caret|decoration|shadow';
// Preceded by start, whitespace, quote, backtick, ':' (variant prefix) or '[class.'.
const PALETTE_LEAD = String.raw`(?<=^|[\s'"` + '`' + String.raw`:]|\[class\.)`;
const PALETTE_TAIL = String.raw`(?:/\d+|/\[[^\]\s]+\])?(?![\w-])`;
const PALETTE_RE = new RegExp(
  `${PALETTE_LEAD}(?:${PALETTE_PREFIX})-(?:(?:${PALETTE_NAMES})-(?:50|[1-9]00|950)|white|black)${PALETTE_TAIL}`,
  'gm',
);
const TEXT_BG_RE = /(?<![\w-])text-bg(?![\w-])/g;

// Color tokens from apps/web/src/styles/tokens.css @theme that can follow `text-` (longest alternatives first).
const COLOR_TOKENS =
  'text-muted|on-accent|cat-(?:data|text|encoding|security|date-time|web|developer|documents)(?:-wash|-tint)?|text|accent|error|warning|success|info|busy|offline';
const TEXT_OPACITY_RE = new RegExp(
  String.raw`(?<![\w:/-])(?:[a-z0-9-]+:|\[[^\]\s]+\]:)*text-(?:${COLOR_TOKENS})/(?:\d+(?:\.\d+)?|\[[^\]\s]+\])(?![\w-])`,
  'g',
);

const ALLOWLIST_PATH = join(ROOT, 'scripts/design-token-allowlist.json');
const ALLOWLIST = existsSync(ALLOWLIST_PATH) ? JSON.parse(readFileSync(ALLOWLIST_PATH, 'utf8')) : {};
function allowed(rule, relFile) {
  return Array.isArray(ALLOWLIST[rule]) && ALLOWLIST[rule].includes(relFile);
}

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

for (const { dir, full } of SCAN_DIRS) {
  for (const file of walk(join(ROOT, dir))) {
    const text = readFileSync(file, 'utf8');
    const rel = relative(ROOT, file).split(sep).join('/');
    const isMarkup = file.endsWith('.html') || file.endsWith('.css');
    const isClassSource = file.endsWith('.html') || file.endsWith('.ts');
    const run = (rule, re, filter = () => true) => {
      if (allowed(rule, rel)) return;
      for (const m of text.matchAll(re)) if (filter(m)) add(rule, file, text, m);
    };
    if (full) {
      run('spacing', SPACING_RE, (m) => !SCALE.has(m[1]));
      run('arbitrary', ARBITRARY_RE, (m) => !ALLOWED_ARBITRARY.has(m[0]));
      run('radius', RADIUS_RE);
      run('wash', WASH_RE, (m) => !WASH_STATE_RE.test(m[0]));
    }
    if (isMarkup && (full || file.endsWith('.html') || file.endsWith('.css'))) run('hex', HEX_RE);
    if (isClassSource) {
      run('palette', PALETTE_RE);
      run('text-bg', TEXT_BG_RE);
      run('text-opacity', TEXT_OPACITY_RE);
    }
  }
}
{
  const file = join(ROOT, 'apps/web/src/styles.css');
  const text = readFileSync(file, 'utf8');
  if (!allowed('text-opacity', 'apps/web/src/styles.css')) {
    for (const m of text.matchAll(TEXT_OPACITY_RE)) add('text-opacity', file, text, m);
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
