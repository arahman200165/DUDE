#!/usr/bin/env node
/**
 * Phase 30K theme contrast + palette check (supersedes check-semantic-palette.mjs).
 *
 * Reads src/styles/theme/theme-tokens.json and enumerates EVERY combination of
 * theme x contrast x catset x accent x semantic from `axes.*.values`. For each one it
 * resolves the base, accent, category and semantic tokens and enforces (hc = contrast "high"):
 *   1. text on bg / panel / panel-elevated             >= 4.5   (hc: >= 7)
 *   2. text-muted on bg / panel / panel-elevated       >= 4.5
 *   3. on-accent on accent                             >= 4.5   (hc: >= 7)
 *   4. accent vs bg and vs panel                       >= 3     (focus ring / selection, WCAG 1.4.11)
 *   5. each category color vs panel, and each category tint
 *      (mix(cat, tint-toward, tint-pct))               >= 4.5   (both are used as text: text-cat-*)
 *   6. each semantic color vs panel                    >= 4.5
 *   7. semantic separation vs each category and the accent: hue distance >= 22deg
 *      OR HSL lightness distance >= 12 points (8 categories + 6 semantic colors cannot all be
 *      further apart on one hue wheel, so lightness is the second axis); neutral semantic
 *      colors (saturation < 20%) are exempt from the hue rule.
 *   8. border vs bg and vs panel                       >= 3     ONLY when hc. In standard contrast
 *      the border is a decorative separator and is exempt (inputs/chips are also identifiable by
 *      fill/label); high-contrast mode is where WCAG 1.4.11 boundaries are enforced.
 *   9. for a semantic set with id "cvd": under simulated protanopia, deuteranopia and tritanopia
 *      (Machado et al. 2009, severity 1.0, applied in linear RGB) error, success and warning must
 *      be pairwise distinct: CIE76 deltaE >= 20 for every pair under every simulation.
 *
 * Exits 1 on failure. Flags: --table (per-combination summary), --self-test (math sanity checks).
 */
import { readFileSync } from 'node:fs';

const CATS = ['data', 'text', 'encoding', 'security', 'date-time', 'web', 'developer', 'documents'];
const SEM = ['error', 'warning', 'success', 'info', 'busy', 'offline'];

// ---------------------------------------------------------------- color math

function rgb(hex) {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
}
function hsl(hex) {
  const [r, g, b] = rgb(hex);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  let h = 0, s = 0;
  if (d) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  return { h, s: s * 100, l: l * 100 };
}
function luminance(hex) {
  const c = rgb(hex).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
const hueDist = (a, b) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));

const toHex = (channels) =>
  '#' + channels.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')).join('');

/**
 * CSS `color-mix(in srgb, a, b pct)`: per-channel linear interpolation in gamma-encoded sRGB,
 * result = a * (1 - p) + b * p. `pct` is a number of percent (or a string like "8%").
 */
function mixSrgb(a, b, pct) {
  const p = (typeof pct === 'string' ? parseFloat(pct) : pct) / 100;
  const ca = rgb(a), cb = rgb(b);
  return toHex(ca.map((v, i) => v * (1 - p) + cb[i] * p));
}

// ---------------------------------------------------------------- CVD simulation

const toLinear = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const fromLinear = (v) => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055);

// Machado, Oliveira & Fernandes (2009), "A Physiologically-based Model for Simulation of Color
// Vision Deficiency", IEEE TVCG 15(6). Severity 1.0 matrices, applied to LINEAR RGB.
const CVD_MATRICES = {
  protanopia: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deuteranopia: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritanopia: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
};

function simulate(hex, matrix) {
  const lin = rgb(hex).map(toLinear);
  const out = matrix.map((row) => row[0] * lin[0] + row[1] * lin[1] + row[2] * lin[2]);
  return toHex(out.map((v) => fromLinear(Math.min(1, Math.max(0, v)))));
}

/** sRGB -> XYZ (D65) -> CIE L*a*b*. */
function lab(hex) {
  const [r, g, b] = rgb(hex).map(toLinear);
  const x = 0.4124564 * r + 0.3575761 * g + 0.1804375 * b;
  const y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
  const z = 0.0193339 * r + 0.119192 * g + 0.9503041 * b;
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const fx = f(x / 0.95047), fy = f(y / 1.0), fz = f(z / 1.08883);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
function deltaE76(a, b) {
  const [l1, a1, b1] = lab(a), [l2, a2, b2] = lab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

// ---------------------------------------------------------------- self-test

function selfTest() {
  const fail = [];
  const assert = (cond, msg) => { if (!cond) fail.push(msg); };
  assert(Math.abs(contrast('#000000', '#ffffff') - 21) < 1e-9, 'contrast(#000, #fff) should be 21');
  assert(Math.abs(luminance('#ffffff') - 1) < 1e-9 && luminance('#000000') === 0, 'luminance of white/black');
  assert(mixSrgb('#000000', '#ffffff', '50%') === '#808080', 'mixSrgb 50% black/white should be #808080');
  assert(mixSrgb('#123456', '#ffffff', 0) === '#123456', 'mixSrgb 0% is identity');
  const normal = deltaE76('#ff0000', '#00ff00');
  const deut = deltaE76(simulate('#ff0000', CVD_MATRICES.deuteranopia), simulate('#00ff00', CVD_MATRICES.deuteranopia));
  assert(normal > 100, `red vs green normal deltaE should be > 100 (got ${normal.toFixed(1)})`);
  assert(deut < normal / 2, `red vs green under deuteranopia should be much closer (${deut.toFixed(1)} vs ${normal.toFixed(1)})`);
  assert(deltaE76('#ffffff', '#ffffff') < 1e-6, 'deltaE of identical colors is 0');
  console.log(`self-test: red/green deltaE normal ${normal.toFixed(1)}, deuteranopia ${deut.toFixed(1)}`);
  if (fail.length) {
    console.error('check-theme-contrast self-test: FAILED\n' + fail.join('\n'));
    process.exit(1);
  }
  console.log('check-theme-contrast self-test: ok');
}

// ---------------------------------------------------------------- main check

function need(obj, path) {
  let cur = obj;
  for (const p of path) {
    if (cur == null || typeof cur !== 'object' || !(p in cur)) {
      throw new Error(`theme-tokens.json: no entry at ${path.join('.')}`);
    }
    cur = cur[p];
  }
  return cur;
}

function product(lists) {
  return lists.reduce((acc, list) => acc.flatMap((a) => list.map((v) => [...a, v])), [[]]);
}

function run() {
  const tokens = JSON.parse(readFileSync(new URL('../src/styles/theme/theme-tokens.json', import.meta.url), 'utf8'));
  const v = (n) => tokens.axes[n].values;
  const combos = product([v('theme'), v('contrast'), v('catset'), v('accent'), v('semantic')]);

  /** rule -> Set of "combination: message" (deduped) */
  const failures = new Map();
  const rows = [];
  let checks = 0;

  for (const [theme, contrastMode, catset, accent, semantic] of combos) {
    const key = `${theme}/${contrastMode}/${catset}/${accent}/${semantic}`;
    const hc = contrastMode === 'high';
    const base = need(tokens.bases, [theme, contrastMode]);
    const acc = need(tokens.accents, [accent, theme, contrastMode]);
    const cats = need(tokens.categorySets, [catset, theme, contrastMode]);
    const sem = need(tokens.semanticSets, [semantic, theme, contrastMode]);
    let combFails = 0;

    const fail = (rule, msg) => {
      combFails++;
      if (!failures.has(rule)) failures.set(rule, new Set());
      failures.get(rule).add(`${key}: ${msg}`);
    };
    const min = (rule, label, fg, bg, threshold) => {
      checks++;
      const cr = contrast(fg, bg);
      if (cr < threshold) fail(rule, `${label} ${fg} on ${bg} = ${cr.toFixed(2)} < ${threshold}`);
      return cr;
    };

    const surfaces = [['bg', base.bg], ['panel', base.panel], ['panel-elevated', base['panel-elevated']]];
    let textPanel = 0, catMin = Infinity, semMin = Infinity;

    // 1, 2
    for (const [name, bg] of surfaces) {
      const cr = min('1 text on surfaces', `text on ${name}`, base.text, bg, hc ? 7 : 4.5);
      if (name === 'panel') textPanel = cr;
      min('2 text-muted on surfaces', `text-muted on ${name}`, base['text-muted'], bg, 4.5);
    }
    // 3
    min('3 on-accent on accent', 'on-accent on accent', acc['on-accent'], acc.accent, hc ? 7 : 4.5);
    // 4
    const accentPanel = min('4 accent vs bg/panel (non-text 3:1)', 'accent vs panel', acc.accent, base.panel, 3);
    min('4 accent vs bg/panel (non-text 3:1)', 'accent vs bg', acc.accent, base.bg, 3);
    // 5
    for (const c of CATS) {
      catMin = Math.min(catMin, min('5 category color/tint vs panel', `cat-${c}`, cats[c], base.panel, 4.5));
      const tint = mixSrgb(cats[c], base['tint-toward'] === 'white' ? '#ffffff' : base['tint-toward'] === 'black' ? '#000000' : base['tint-toward'], base['tint-pct']);
      min('5 category color/tint vs panel', `cat-${c}-tint`, tint, base.panel, 4.5);
    }
    // 6
    for (const s of SEM) {
      semMin = Math.min(semMin, min('6 semantic vs panel', s, sem[s], base.panel, 4.5));
    }
    // 7
    const others = [...CATS.map((c) => [`cat-${c}`, cats[c]]), ['accent', acc.accent]];
    for (const s of SEM) {
      const a = hsl(sem[s]);
      for (const [oname, ohex] of others) {
        checks++;
        const o = hsl(ohex);
        const neutral = a.s < 20;
        const ok = neutral || hueDist(a.h, o.h) >= 22 || Math.abs(a.l - o.l) >= 12;
        if (!ok) {
          fail('7 semantic separation', `${s} ${sem[s]} too close to ${oname} ${ohex} (dH ${hueDist(a.h, o.h).toFixed(0)}, dL ${Math.abs(a.l - o.l).toFixed(0)})`);
        }
      }
    }
    // 8
    if (hc) {
      min('8 border vs bg/panel (hc only)', 'border vs bg', base.border, base.bg, 3);
      min('8 border vs bg/panel (hc only)', 'border vs panel', base.border, base.panel, 3);
    }
    // 9
    if (semantic === 'cvd') {
      const trio = ['error', 'success', 'warning'];
      for (const [sim, matrix] of Object.entries(CVD_MATRICES)) {
        for (let i = 0; i < trio.length; i++) {
          for (let j = i + 1; j < trio.length; j++) {
            checks++;
            const ca = simulate(sem[trio[i]], matrix), cb = simulate(sem[trio[j]], matrix);
            const de = deltaE76(ca, cb);
            if (de < 20) fail('9 cvd distinguishability', `${trio[i]} vs ${trio[j]} under ${sim} deltaE ${de.toFixed(1)} < 20`);
          }
        }
      }
    }

    rows.push(`${key.padEnd(44)} ${combFails ? `FAIL(${combFails})` : 'ok     '} text/panel ${textPanel.toFixed(2).padStart(5)}  accent/panel ${accentPanel.toFixed(2).padStart(5)}  cat min ${catMin.toFixed(2).padStart(5)}  sem min ${semMin.toFixed(2).padStart(5)}`);
  }

  if (process.argv.includes('--table')) console.log(rows.join('\n'));
  if (failures.size) {
    for (const rule of [...failures.keys()].sort()) {
      console.log(`\nRule ${rule}`);
      for (const msg of failures.get(rule)) console.log(`  ${msg}`);
    }
    console.log('\ncheck-theme-contrast: FAILED');
    process.exit(1);
  }
  console.log(`check-theme-contrast: ok (${combos.length} combinations, ${checks} checks)`);
}

if (process.argv.includes('--self-test')) selfTest();
else {
  try {
    run();
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
