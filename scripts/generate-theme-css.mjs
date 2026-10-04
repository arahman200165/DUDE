#!/usr/bin/env node
/**
 * Generates apps/web/src/styles/theme.generated.css from apps/web/src/styles/theme/theme-tokens.json
 * (Phase 30K theming). The output declares runtime-overridable --dude-* custom
 * properties keyed by data-* attributes on <html>; tokens.css maps them to
 * Tailwind names. It also emits packages/domain/src/core/appearance/appearance-axes.generated.ts (axes + fonts
 * only, so the runtime model does not bundle every color). Pass --check to fail (exit 1) when
 * any generated file on disk is stale. The full portable token data is loaded only by native consumers.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const SRC = new URL('../apps/web/src/styles/theme/theme-tokens.json', import.meta.url);
const OUT = new URL('../apps/web/src/styles/theme.generated.css', import.meta.url);
const OUT_TS = new URL('../packages/domain/src/core/appearance/appearance-axes.generated.ts', import.meta.url);
const OUT_TOKENS = new URL('../packages/domain/src/core/appearance/theme-tokens.generated.ts', import.meta.url);

const CATS = ['data', 'text', 'encoding', 'security', 'date-time', 'web', 'developer', 'documents'];
const SEM = ['error', 'warning', 'success', 'info', 'busy', 'offline'];
const BASE_COLORS = ['bg', 'panel', 'panel-elevated', 'border', 'text', 'text-muted'];
const BASE_OTHER = ['focus-width', 'scrim', 'wash-pct', 'tint-toward', 'tint-pct'];
const DENSITY_KEYS = [
  'spacing', 'control-h', 'row-h', 'radius', 'text-ui', 'text-ui-sm', 'text-ui-xs',
  'space-micro', 'space-normal', 'space-panel', 'space-major', 'space-exceptional',
];
const HEX = /^#[0-9a-fA-F]{6}$/;
const LENGTH = /^\d+(?:\.\d+)?(?:rem|px)$/;
function percentage(value) {
  return /^\d+(?:\.\d+)?%$/.test(value) && Number.parseFloat(value) <= 100;
}

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
  for (const key of ['axes', 'bases', 'accents', 'categorySets', 'semanticSets', 'density', 'sizeSteps', 'fonts']) {
    if (!t[key]) throw new Error(`theme-tokens.json: missing top-level key "${key}"`);
  }
  for (const [name, axis] of Object.entries(t.axes)) {
    if (!axis.attr || !Array.isArray(axis.values) || !axis.values.length) {
      throw new Error(`theme-tokens.json: axis "${name}" needs attr and non-empty values`);
    }
    if (!axis.values.includes(axis.default)) {
      throw new Error(`theme-tokens.json: axis "${name}" default "${axis.default}" is not in its values`);
    }
    if (axis.labels !== undefined) {
      if (axis.labels === null || typeof axis.labels !== 'object' || Array.isArray(axis.labels)) {
        throw new Error(`theme-tokens.json: axis "${name}" labels must be an object of value -> label`);
      }
      for (const [value, label] of Object.entries(axis.labels)) {
        if (!axis.values.includes(value)) {
          throw new Error(`theme-tokens.json: axis "${name}" has a label for "${value}", which is not one of its values`);
        }
        if (typeof label !== 'string' || label.trim() === '') {
          throw new Error(`theme-tokens.json: axis "${name}" label for "${value}" must be a non-empty string`);
        }
      }
    }
  }
  const v = (n) => t.axes[n].values;
  for (const [th, co] of product([v('theme'), v('contrast')])) {
    const base = need(t.bases, [th, co], `bases combination (theme=${th}, contrast=${co})`);
    checkHex(base, BASE_COLORS, `bases.${th}.${co}`);
    checkKeys(base, [...BASE_OTHER, 'color-scheme'], `bases.${th}.${co}`);
    if (!LENGTH.test(base['focus-width']) || !HEX.test(base.scrim)
      || !percentage(base['wash-pct']) || !percentage(base['tint-pct'])
      || !(base['tint-toward'] === 'white' || base['tint-toward'] === 'black' || HEX.test(base['tint-toward']))) {
      throw new Error(`theme-tokens.json: unsupported native base derivation at bases.${th}.${co}`);
    }
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
    const density = need(t.density, [d], `density "${d}"`);
    checkKeys(density, DENSITY_KEYS, `density.${d}`);
    for (const key of DENSITY_KEYS) {
      if (!LENGTH.test(density[key])) throw new Error(`theme-tokens.json: density.${d}.${key} needs a px or rem length`);
    }
  }
  if (t.sizeSteps === null || typeof t.sizeSteps !== 'object' || Array.isArray(t.sizeSteps)) {
    throw new Error('theme-tokens.json: sizeSteps must be an object of step id -> scale factor');
  }
  for (const name of ['uiSize', 'monoSize']) {
    if (!t.axes[name]) continue;
    for (const value of t.axes[name].values) {
      const factor = t.sizeSteps[value];
      if (typeof factor !== 'string' || !/^\d+(\.\d+)?$/.test(factor) || !(Number(factor) > 0)) {
        throw new Error(`theme-tokens.json: axis "${name}" value "${value}" needs a sizeSteps entry that is a positive number string`);
      }
    }
  }
  if (t.axes.ligatures) {
    const lig = t.axes.ligatures.values;
    if (lig.length !== 2 || !lig.includes('on') || !lig.includes('off')) {
      throw new Error('theme-tokens.json: axis "ligatures" values must be exactly "on" and "off"');
    }
  }
  const { ui, mono, defaultUi, defaultMono } = t.fonts;
  for (const [kind, list] of [['ui', ui], ['mono', mono]]) {
    if (!Array.isArray(list) || !list.length) throw new Error(`theme-tokens.json: fonts.${kind} must be a non-empty list`);
    const seen = new Set();
    for (const f of list) {
      if (!f || typeof f.id !== 'string' || f.id === '') throw new Error(`theme-tokens.json: fonts.${kind} entry needs a string id`);
      if (seen.has(f.id)) throw new Error(`theme-tokens.json: fonts.${kind} has duplicate id "${f.id}"`);
      seen.add(f.id);
      if (typeof f.stack !== 'string' || f.stack.trim() === '') {
        throw new Error(`theme-tokens.json: fonts.${kind} "${f.id}" needs a non-empty stack`);
      }
    }
  }
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
    '/* Generated by scripts/generate-theme-css.mjs from apps/web/src/styles/theme/theme-tokens.json - never hand-edit. */',
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
  // UI / data font size steps: one scale factor per step, default via the :not() fallback form.
  for (const [axisName, prop] of [['uiSize', '--dude-ui-scale'], ['monoSize', '--dude-mono-scale']]) {
    if (!axes[axisName]) continue;
    for (const step of v(axisName)) {
      block(selector(axes, [axisName], [step]), { [prop]: t.sizeSteps[step] });
    }
  }
  // Curated non-default fonts: the pre-paint script sets data-ui-font / data-mono-font, so these
  // (higher specificity than the :root formula default) win before first paint. Custom fonts stay inline.
  for (const [list, attr, prop, def] of [
    [t.fonts.ui, 'data-ui-font', '--dude-font-sans', t.fonts.defaultUi],
    [t.fonts.mono, 'data-mono-font', '--dude-font-mono', t.fonts.defaultMono],
  ]) {
    for (const f of list) {
      if (f.id === def) continue;
      block(`:root[${attr}="${f.id}"]`, { [prop]: f.stack });
    }
  }
  return out.join('\n').replace(/\n+$/, '\n');
}

/** The runtime appearance model only needs the axes and fonts, not the hex values. Deterministic, LF. */
export function buildAxesTs(t) {
  validateTokens(t);
  const literal = (value) => JSON.stringify(value, null, 2);
  return [
    '// Generated by scripts/generate-theme-css.mjs from apps/web/src/styles/theme/theme-tokens.json - generated, never hand-edit.',
    '',
    `export const APPEARANCE_AXES_DATA = ${literal(t.axes)} as const;`,
    '',
    `export const APPEARANCE_FONTS_DATA = ${literal(t.fonts)} as const;`,
    '',
  ].join('\n');
}

/** Native clients resolve the same source data without CSS or an application import. */
export function buildTokensTs(t) {
  validateTokens(t);
  return '// Generated by scripts/generate-theme-css.mjs from apps/web/src/styles/theme/theme-tokens.json - generated, never hand-edit.\n\n'
    + `export const THEME_TOKENS_DATA = ${JSON.stringify(t, null, 2)} as const;\n`;
}

function main() {
  const tokens = JSON.parse(readFileSync(SRC, 'utf8'));
  const outputs = [
    [OUT, buildThemeCss(tokens), 'apps/web/src/styles/theme.generated.css'],
    [OUT_TS, buildAxesTs(tokens), 'packages/domain/src/core/appearance/appearance-axes.generated.ts'],
    [OUT_TOKENS, buildTokensTs(tokens), 'packages/domain/src/core/appearance/theme-tokens.generated.ts'],
  ];
  if (process.argv.includes('--check')) {
    const stale = outputs.filter(([url, text]) => (existsSync(url) ? readFileSync(url, 'utf8') : null) !== text);
    if (stale.length) {
      console.error(`${stale.map(([, , name]) => name).join(', ')} is stale: run \`node scripts/generate-theme-css.mjs\`.`);
      process.exit(1);
    }
    console.log('generate-theme-css: up to date');
    return;
  }
  for (const [url, text, name] of outputs) {
    writeFileSync(url, text);
    console.log(`generate-theme-css: wrote ${name}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
