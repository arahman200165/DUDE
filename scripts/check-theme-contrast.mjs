#!/usr/bin/env node
/**
 * Phase 30K theme contrast + palette check (supersedes check-semantic-palette.mjs).
 *
 * Reads src/styles/theme/theme-tokens.json and enumerates EVERY combination of
 * theme x contrast x catset x accent x semantic from `axes.*.values`. For each one it
 * resolves the base, accent, category and semantic tokens and enforces (hc = contrast "high"):
 *   1. text on bg / panel / panel-elevated             >= 4.5   (hc: >= 7)
 *   2. text-muted on bg / panel / panel-elevated       >= 4.5   (hc: >= 7)
 *   3. on-accent on accent                             >= 4.5   (hc: >= 7)
 *   4. accent vs bg and vs panel                       >= 3     (focus ring / selection, WCAG 1.4.11)
 *   5. each category color, and each category tint (mix(cat, tint-toward, tint-pct)), vs bg, panel
 *      AND panel-elevated                              >= 4.5   (hc: >= 7; both are used as text:
 *                                                                 text-cat-*, on every surface)
 *   6. each semantic color vs bg, panel AND panel-elevated >= 4.5 (hc: >= 7, WCAG 1.4.6 AAA)
 *   7. semantic separation vs each category and the accent: hue distance >= 22deg
 *      OR HSL lightness distance >= 12 points (8 categories + 6 semantic colors cannot all be
 *      further apart on one hue wheel, so lightness is the second axis); neutral semantic
 *      colors (saturation < 20%) are exempt from the hue rule.
 *   8. border vs bg and vs panel                       >= 3     ONLY when hc. In standard contrast
 *      the border is a decorative separator and is exempt (inputs/chips are also identifiable by
 *      fill/label); high-contrast mode is where WCAG 1.4.11 boundaries are enforced.
 *   9. for a semantic set with id "cvd": under simulated protanopia, deuteranopia and tritanopia
 *      (Machado et al. 2009, severity 1.0, applied in linear RGB) AND unsimulated vision, error, success
 *      and warning must be pairwise distinct: CIE76 deltaE >= CVD_SEMANTIC_MIN_DELTA_E (20), and info must
 *      be distinct from each of them: deltaE >= CVD_INFO_MIN_DELTA_E (12).
 *      For a category set with id "cvd": under the same three simulations (and unsimulated vision)
 *      every pair of the 8 category colors must reach CIE76 deltaE >= CVD_CATEGORY_MIN_DELTA_E.
 *
 *  10. text on its own wash: Tailwind `bg-x/N` is color-mix(in oklab, x N%, transparent), i.e. the color
 *      at alpha N%. For N in WASH_ALPHAS (the opacities the app uses for tinted chips/badges: 5, 10, 20, plus 15) the
 *      color is alpha-blended (simple sRGB) over bg and over panel, and every semantic color, category
 *      color and the accent must reach >= 4.5 as text on that composite (`text-x` on `bg-x/N`).
 *  11. text / text-muted on the semantic highlight washes (bg-warning/40 etc. used behind text-text)
 *      >= 4.5 for `text`.
 *  12. category color and tint as text on their own *-wash surface (panel mixed toward the category by
 *      wash-pct) >= 4.5.
 *
 *  13. (hc only) accent as text on accent/5 and accent/10 over bg, panel AND panel-elevated >= 7
 *      (`text-accent bg-accent/10` badges, e.g. the Browse Tools "verified" chip).
 *  14. (hc only) error, warning and success as text on their own /5 and /10 wash over bg AND panel >= 7
 *      (`text-warning bg-warning/10` badges and banners, e.g. the desktop-capability badge). info is deliberately
 *      excluded: info banners use `text-text` on the tinted wash with a `text-info` glyph, because the cvd light-hc info
 *      color cannot be 7:1 on its own wash AND keep CVD_INFO_MIN_DELTA_E from success AND stay hue/lightness-separated.
 *
 * High-contrast (hc) thresholds enforced beyond standard: rules 1, 2, 3, 5, 6, 11, 13 and 14 require 7:1 (WCAG 1.4.6
 * AAA) and rule 8 (border >= 3:1 vs bg and panel) only applies in hc. Everything else (accent non-text 3:1,
 * semantic separation, rule 9's CVD deltaE thresholds, and the own-wash rules 10 and 12 at 4.5) is identical in
 * standard and hc; the CVD category deltaE bar (16) is NOT relaxed for hc. The own-wash rules 10 and 12 stay at
 * 4.5 in hc: a color on a wash of itself loses contrast by construction, and the cvd light set (dark colors
 * to reach 7:1 on white) has too little lightness room to also stay 16 deltaE apart under CVD simulation.
 *
 * Opacity modifiers on text-color utilities are banned separately (check-design-tokens.mjs `text-opacity`)
 * because they silently drop contrast below what this script proves.
 *
 * Exits 1 on failure. Flags: --table (per-combination summary), --self-test (math sanity checks).
 */
import { readFileSync } from 'node:fs';

const CATS = ['data', 'text', 'encoding', 'security', 'date-time', 'web', 'developer', 'documents'];
const SEM = ['error', 'warning', 'success', 'info', 'busy', 'offline'];
// bg-<semantic|accent>/N opacities found in src (5, 10, 20 for chips/badges; 30/40 are strong highlights
// that carry `text-text`, see rule 11) plus 15. Text COLORED like its wash is only allowed up to 20%.
// Category colors are only used as fills via the 8% *-wash tokens (rule 12), never bg-cat-*/N.
const WASH_ALPHAS = [5, 10, 15, 20];
const HIGHLIGHT_ALPHAS = [30, 40];
// Minimum CIE76 deltaE between any two of the 8 category colors of the "cvd" set, under protanopia,
// deuteranopia, tritanopia and normal vision. Achieved threshold: 16. Every category color must also
// clear 4.5:1 as text on all surfaces (raw and tinted) in BOTH themes; on the near-white light surfaces
// that confines all 8 to dark colors (Lab L* roughly 28-45), which is what limits the light theme. The
// unconstrained optimum is ~22 but needs near-black swatches (e.g. #000400) that read as text, not
// category color; requiring L* >= 28 and chroma >= 30 gives ~16.1 (the shipped light set is 16.09, the
// dark set ~19.6). Categories always ship with an icon and a text label, so color is a secondary cue and
// 16 (a clearly visible difference in CIE76 terms) is enough. Do not lower this to make a change pass.
const CVD_CATEGORY_MIN_DELTA_E = 16;
// Same metric for the "cvd" semantic set. error/success/warning carry the status meaning that must survive
// a red-green deficiency (success is BLUE, error red-orange, warning yellow), so they get the strict bar of 20.
// info is a fourth blue-ish hue that has to sit apart from success by lightness/chroma alone; the separation rule (7)
// forbids the free hue/lightness room it would need next to 24 category colors and 6 accents, and in the hc
// themes the 7:1 ceiling plus the 7:1-on-highlight-wash rule leave little lightness room, so its bar is 12
// (achieved minimum ~12.4 in light-hc, ~14 in dark-hc).
const CVD_SEMANTIC_MIN_DELTA_E = 20;
const CVD_INFO_MIN_DELTA_E = 12;

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

/** Plain sRGB alpha blend of `fg` at `alpha` percent over opaque `bg` (what `bg-x/N` renders as). */
function blendAlpha(fg, bg, alpha) {
  return mixSrgb(bg, fg, alpha);
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
  assert(blendAlpha('#000000', '#ffffff', 10) === '#e6e6e6', 'blendAlpha black@10% over white should be #e6e6e6');
  assert(blendAlpha('#123456', '#ffffff', 100) === '#123456', 'blendAlpha 100% is the foreground');
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
  /** "theme/contrast/vision" -> smallest pairwise deltaE among the cvd category set */
  const cvdStats = new Map();
  /** "theme/contrast/trio|info" -> smallest pairwise deltaE among the cvd semantic set */
  const semStats = new Map();
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
    let textPanel = 0, catMin = Infinity, semMin = Infinity, washMin = Infinity;

    // 1, 2
    for (const [name, bg] of surfaces) {
      const cr = min('1 text on surfaces', `text on ${name}`, base.text, bg, hc ? 7 : 4.5);
      if (name === 'panel') textPanel = cr;
      min('2 text-muted on surfaces', `text-muted on ${name}`, base['text-muted'], bg, hc ? 7 : 4.5);
    }
    // 3
    min('3 on-accent on accent', 'on-accent on accent', acc['on-accent'], acc.accent, hc ? 7 : 4.5);
    // 4
    const accentPanel = min('4 accent vs bg/panel (non-text 3:1)', 'accent vs panel', acc.accent, base.panel, 3);
    min('4 accent vs bg/panel (non-text 3:1)', 'accent vs bg', acc.accent, base.bg, 3);
    // 5
    const tintToward = base['tint-toward'] === 'white' ? '#ffffff' : base['tint-toward'] === 'black' ? '#000000' : base['tint-toward'];
    for (const c of CATS) {
      const tint = mixSrgb(cats[c], tintToward, base['tint-pct']);
      for (const [name, bg] of surfaces) {
        catMin = Math.min(catMin, min('5 category color/tint vs bg/panel/panel-elevated', `cat-${c} on ${name}`, cats[c], bg, hc ? 7 : 4.5));
        min('5 category color/tint vs bg/panel/panel-elevated', `cat-${c}-tint on ${name}`, tint, bg, hc ? 7 : 4.5);
      }
    }
    // 6
    for (const s of SEM) {
      for (const [name, bg] of surfaces) {
        const cr = min('6 semantic vs bg/panel/panel-elevated', `${s} on ${name}`, sem[s], bg, hc ? 7 : 4.5);
        if (name === 'panel') semMin = Math.min(semMin, cr);
      }
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
    // 10: text-x on bg-x/N (composite over bg and panel)
    const washed = [...SEM.map((s) => [s, sem[s]]), ['accent', acc.accent], ...CATS.map((c) => [`cat-${c}`, cats[c]])];
    for (const [name, hex] of washed) {
      for (const alpha of WASH_ALPHAS) {
        for (const [sname, sbg] of [['bg', base.bg], ['panel', base.panel]]) {
          const comp = blendAlpha(hex, sbg, alpha);
          const cr = min('10 text on own wash (bg-x/N)', `${name} on ${name}/${alpha} over ${sname} (${comp})`, hex, comp, 4.5);
          washMin = Math.min(washMin, cr);
        }
      }
    }
    // 13 (hc only): the shipped chip/badge/selected-row pattern `text-accent bg-accent/N` (N <= 10) sits on any of the three
    // surfaces (hovered rows and elevated panels included), so accent text on its own 5%/10% wash must reach 7:1 there.
    if (hc) {
      for (const alpha of [5, 10]) {
        for (const [sname, sbg] of surfaces) {
          min('13 accent on own wash (hc, 7:1)', `accent on accent/${alpha} over ${sname}`, acc.accent, blendAlpha(acc.accent, sbg, alpha), 7);
        }
      }
    }
    // 14 (hc only): the shipped alert/badge pattern `text-<semantic> bg-<semantic>/N` (N <= 10, e.g. `text-warning bg-warning/10`
    // in the desktop-capability badge and tool warning banners) sits on bg or panel, and its text is small (text-ui /
    // text-ui-xs, never "large"), so error/warning/success on their own 5%/10% wash must reach 7:1 in hc. info banners use
    // `text-text` (glyph keeps `text-info`), so info is not text on its own wash; keep it that way (see header, rule 14).
    if (hc) {
      for (const s of ['error', 'warning', 'success']) {
        for (const alpha of [5, 10]) {
          for (const [sname, sbg] of surfaces.slice(0, 2)) {
            min('14 semantic on own wash (hc, 7:1)', `${s} on ${s}/${alpha} over ${sname}`, sem[s], blendAlpha(sem[s], sbg, alpha), 7);
          }
        }
      }
    }
    // 11: text on the semantic highlight washes
    for (const s of ['error', 'warning', 'success', 'info']) {
      for (const alpha of HIGHLIGHT_ALPHAS) {
        for (const [sname, sbg] of [['bg', base.bg], ['panel', base.panel]]) {
          min('11 text on semantic highlight wash', `text on ${s}/${alpha} over ${sname}`, base.text, blendAlpha(sem[s], sbg, alpha), hc ? 7 : 4.5);
        }
      }
    }
    // 12: category color / tint as text on its own 8% wash (mix(panel, cat, wash-pct)), the *-wash surfaces
    for (const c of CATS) {
      const wash = mixSrgb(base.panel, cats[c], base['wash-pct']);
      const tint = mixSrgb(cats[c], tintToward, base['tint-pct']);
      min('12 category on own wash surface', `cat-${c} on cat-${c}-wash (${wash})`, cats[c], wash, 4.5);
      min('12 category on own wash surface', `cat-${c}-tint on cat-${c}-wash (${wash})`, tint, wash, 4.5);
    }
    // 8
    if (hc) {
      min('8 border vs bg/panel (hc only)', 'border vs bg', base.border, base.bg, 3);
      min('8 border vs bg/panel (hc only)', 'border vs panel', base.border, base.panel, 3);
    }
    // 9
    if (semantic === 'cvd') {
      const trio = ['error', 'success', 'warning'];
      const pairs = [];
      for (let i = 0; i < trio.length; i++) {
        for (let j = i + 1; j < trio.length; j++) pairs.push([trio[i], trio[j], CVD_SEMANTIC_MIN_DELTA_E]);
        pairs.push([trio[i], 'info', CVD_INFO_MIN_DELTA_E]);
      }
      for (const [sim, matrix] of Object.entries({ normal: null, ...CVD_MATRICES })) {
        for (const [a, b, threshold] of pairs) {
          checks++;
          const ca = matrix ? simulate(sem[a], matrix) : sem[a], cb = matrix ? simulate(sem[b], matrix) : sem[b];
          const de = deltaE76(ca, cb);
          const group = b === 'info' ? 'info' : 'trio';
          const statKey = `${theme}/${contrastMode}/${group}`;
          const seen = semStats.get(statKey) ?? { min: Infinity, pair: '', threshold };
          if (de < seen.min) { seen.min = de; seen.pair = `${a}/${b} ${sim}`; }
          semStats.set(statKey, seen);
          if (de < threshold) fail('9 cvd distinguishability', `${a} vs ${b} under ${sim} deltaE ${de.toFixed(1)} < ${threshold}`);
        }
      }
    }

    if (catset === 'cvd') {
      const vision = { normal: null, ...CVD_MATRICES };
      for (const [sim, matrix] of Object.entries(vision)) {
        const seen = cvdStats.get(`${theme}/${contrastMode}/${sim}`) ?? { min: Infinity, pair: '' };
        for (let i = 0; i < CATS.length; i++) {
          for (let j = i + 1; j < CATS.length; j++) {
            checks++;
            const ca = matrix ? simulate(cats[CATS[i]], matrix) : cats[CATS[i]];
            const cb = matrix ? simulate(cats[CATS[j]], matrix) : cats[CATS[j]];
            const de = deltaE76(ca, cb);
            if (de < seen.min) { seen.min = de; seen.pair = `${CATS[i]}/${CATS[j]}`; }
            if (de < CVD_CATEGORY_MIN_DELTA_E) {
              fail('9 cvd distinguishability', `cvd categories ${CATS[i]} vs ${CATS[j]} under ${sim} deltaE ${de.toFixed(1)} < ${CVD_CATEGORY_MIN_DELTA_E}`);
            }
          }
        }
        cvdStats.set(`${theme}/${contrastMode}/${sim}`, seen);
      }
    }

    rows.push(`${key.padEnd(44)} ${combFails ? `FAIL(${combFails})` : 'ok     '} text/panel ${textPanel.toFixed(2).padStart(5)}  accent/panel ${accentPanel.toFixed(2).padStart(5)}  cat min(all surfaces) ${catMin.toFixed(2).padStart(5)}  sem min ${semMin.toFixed(2).padStart(5)}  wash min ${washMin.toFixed(2).padStart(5)}`);
  }

  if (process.argv.includes('--table')) {
    console.log(rows.join('\n'));
    for (const [k, s] of semStats) console.log(`cvd semantics  ${k.padEnd(28)} min pairwise deltaE ${s.min.toFixed(2)} (${s.pair}, threshold ${s.threshold})`);
    for (const [k, s] of cvdStats) console.log(`cvd categories ${k.padEnd(28)} min pairwise deltaE ${s.min.toFixed(2)} (${s.pair}, threshold ${CVD_CATEGORY_MIN_DELTA_E})`);
  }
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
