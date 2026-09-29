#!/usr/bin/env node
/**
 * Generates src/styles/theme.generated.css from src/styles/theme/theme-tokens.json
 * (Phase 30K theming). The output declares runtime-overridable --dude-* custom
 * properties keyed by data-* attributes on <html>; tokens.css maps them to
 * Tailwind names. Pass --check to fail (exit 1) when the file on disk is stale.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const SRC = new URL('../src/styles/theme/theme-tokens.json', import.meta.url);
const OUT = new URL('../src/styles/theme.generated.css', import.meta.url);

const CATS = ['data', 'text', 'encoding', 'security', 'date-time', 'web', 'developer', 'documents'];
const SEM = ['error', 'warning', 'success', 'info', 'busy', 'offline'];
const BASE_COLORS = ['bg', 'panel', 'panel-elevated', 'border', 'text', 'text-muted'];
const BASE_OTHER = ['focus-width', 'wash-pct', 'tint-toward', 'tint-pct'];
const DENSITY_KEYS = [
  'spacing', 'control-h', 'row-h', 'radius', 'text-ui', 'text-ui-sm', 'text-ui-xs',
  'space-micro', 'space-normal', 'space-panel', 'space-major', 'space-exceptional',
];
const HEX = /^#[0-9a-fA-F]{6}$/;

/** Cartesian product of arrays of values. */
function product(lists) {
  return lists.reduce((acc, list) => acc.flatMap((a) => list.map((v) => [...a, v])), [[]]);
}

/**
 * Non-default values match the attribute exactly. The DEFAULT value matches "not any other
 * known value", so an absent attribute AND an unknown/tampered one (data-accent="bogus")
 * both fall back to the default block instead of leaving the variables undefined.
 * An axis with a single value needs no condition at all. Combinations stay mutually exclusive.
 */
function condition(axis, value) {
  const { attr, default: def, values } = axis;
  if (value !== def) return `[${attr}="${value}"]`;
  return values
    .filter((o) => o !== value)
    .map((o) => `:not([${attr}="${o}"])`)
    .join('');
}

function selector(axes, names, combo) {
  return ':root' + names.map((n, i) => condition(axes[n], combo[i])).join('');
}

function need(obj, path, what) {
  let cur = obj;
  for (const p of path) {
    if (cur == null || typeof cur !== 'object' || !(p in cur)) {
      throw new Error(`theme-tokens.json: missing ${what} (no entry at ${path.join('.')})`);
    }
    cur = cur[p];
  }
  return cur;
}

function checkKeys(block, keys, where) {
  for (const k of keys) {
    if (typeof block[k] !== 'string' || block[k] === '') {
      throw new Error(`theme-tokens.json: missing token "${k}" at ${where}`);
    }
  }
}

function checkHex(block, keys, where) {
  checkKeys(block, keys, where);
  for (const k of keys) {
    if (!HEX.test(block[k])) {
      throw new Error(`theme-tokens.json: "${k}" at ${where} is not #rrggbb: ${block[k]}`);
    }
  }
}

export function validateTokens(t) {
  for (const key of ['axes', 'bases', 'accents', 'categorySets', 'semanticSets', 'density', 'fonts']) {
    if (!t[key]) throw new Error(`theme-tokens.json: missing top-level key "${key}"`);
  }
  for (const [name, axis] of Object.entries(t.axes)) {
    if (!axis.attr || !Array.isArray(axis.values) || !axis.values.length) {
      throw new Error(`theme-tokens.json: axis "${name}" needs attr and non-empty values`);
    }
    if (!axis.values.includes(axis.default)) {
      throw new Error(`theme-tokens.json: axis "${name}" default "${axis.default}" is not in its values`);
    }
  }
  const v = (n) => t.axes[n].values;
  for (const [th, co] of product([v('theme'), v('contrast')])) {
    const base = need(t.bases, [th, co], `bases combination (theme=${th}, contrast=${co})`);
    checkHex(base, BASE_COLORS, `bases.${th}.${co}`);
    checkKeys(base, [...BASE_OTHER, 'color-scheme'], `bases.${th}.${co}`);
    for (const a of v('accent')) {
      const s = need(t.accents, [a, th, co], `accents combination (accent=${a}, theme=${th}, contrast=${co})`);
      checkHex(s, ['accent', 'on-accent'], `accents.${a}.${th}.${co}`);
    }
    for (const c of v('catset')) {
      const s = need(t.categorySets, [c, th, co], `categorySets combination (catset=${c}, theme=${th}, contrast=${co})`);
      checkHex(s, CATS, `categorySets.${c}.${th}.${co}`);
    }
    for (const sm of v('semantic')) {
      const s = need(t.semanticSets, [sm, th, co], `semanticSets combination (semantic=${sm}, theme=${th}, contrast=${co})`);
      checkHex(s, SEM, `semanticSets.${sm}.${th}.${co}`);
    }
  }
  for (const d of v('density')) {
    checkKeys(need(t.density, [d], `density "${d}"`), DENSITY_KEYS, `density.${d}`);
  }
  const { ui, mono, defaultUi, defaultMono } = t.fonts;
  if (!ui?.some((f) => f.id === defaultUi)) {
    throw new Error(`theme-tokens.json: fonts.defaultUi "${defaultUi}" not found in fonts.ui`);
  }
  if (!mono?.some((f) => f.id === defaultMono)) {
    throw new Error(`theme-tokens.json: fonts.defaultMono "${defaultMono}" not found in fonts.mono`);
  }
}

function decls(map) {
  return Object.entries(map)
    .map(([k, val]) => `  ${k}: ${val};`)
    .join('\n');
}

export function buildThemeCss(t) {
  validateTokens(t);
  const axes = t.axes;
  const out = [
    '/* Generated by scripts/generate-theme-css.mjs from src/styles/theme/theme-tokens.json - never hand-edit. */',
    '',
  ];
  const block = (sel, map) => out.push(`${sel} {\n${decls(map)}\n}`, '');

  // Formula block first: wash/tint derivations and default font stacks.
  const formulas = {};
  for (const c of CATS) {
    formulas[`--dude-cat-${c}-wash`] =
      `color-mix(in srgb, var(--dude-panel), var(--dude-cat-${c}) var(--dude-wash-pct))`;
  }
  for (const c of CATS) {
    formulas[`--dude-cat-${c}-tint`] =
      `color-mix(in srgb, var(--dude-cat-${c}), var(--dude-tint-toward) var(--dude-tint-pct))`;
  }
  formulas['--dude-font-sans'] = t.fonts.ui.find((f) => f.id === t.fonts.defaultUi).stack;
  formulas['--dude-font-mono'] = t.fonts.mono.find((f) => f.id === t.fonts.defaultMono).stack;
  block(':root', formulas);

  const v = (n) => axes[n].values;
  const tc = ['theme', 'contrast'];
  const tcValues = tc.map(v);

  for (const combo of product(tcValues)) {
    const [th, co] = combo;
    const b = t.bases[th][co];
    const map = {};
    for (const k of BASE_COLORS) map[`--dude-${k}`] = b[k];
    for (const k of BASE_OTHER) map[`--dude-${k}`] = b[k];
    map['color-scheme'] = b['color-scheme'];
    block(selector(axes, tc, combo), map);
  }
  for (const combo of product([v('accent'), ...tcValues])) {
    const [a, th, co] = combo;
    const s = t.accents[a][th][co];
    block(selector(axes, ['accent', ...tc], combo), {
      '--dude-accent': s.accent,
      '--dude-on-accent': s['on-accent'],
    });
  }
  for (const combo of product([v('catset'), ...tcValues])) {
    const [c, th, co] = combo;
    const s = t.categorySets[c][th][co];
    const map = {};
    for (const k of CATS) map[`--dude-cat-${k}`] = s[k];
    block(selector(axes, ['catset', ...tc], combo), map);
  }
  for (const combo of product([v('semantic'), ...tcValues])) {
    const [sm, th, co] = combo;
    const s = t.semanticSets[sm][th][co];
    const map = {};
    for (const k of SEM) map[`--dude-${k}`] = s[k];
    block(selector(axes, ['semantic', ...tc], combo), map);
  }
  for (const d of v('density')) {
    const s = t.density[d];
    const map = {};
    for (const k of DENSITY_KEYS) map[`--dude-${k}`] = s[k];
    block(selector(axes, ['density'], [d]), map);
  }
  return out.join('\n').replace(/\n+$/, '\n');
}

function main() {
  const tokens = JSON.parse(readFileSync(SRC, 'utf8'));
  const css = buildThemeCss(tokens);
  if (process.argv.includes('--check')) {
    const disk = existsSync(OUT) ? readFileSync(OUT, 'utf8') : null;
    if (disk !== css) {
      console.error('theme.generated.css is stale: run `node scripts/generate-theme-css.mjs`.');
      process.exit(1);
    }
    console.log('generate-theme-css: up to date');
    return;
  }
  writeFileSync(OUT, css);
  console.log('generate-theme-css: wrote src/styles/theme.generated.css');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
