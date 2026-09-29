#!/usr/bin/env node
/**
 * Phase 30J.1 palette check. Reads src/styles/tokens.css and verifies that each
 * semantic color (error/warning/success/info/busy/offline) is
 *   1. distinct from every category color and the accent: hue distance >= 22deg
 *      OR HSL lightness distance >= 12 points (8 categories + 6 semantic colors
 *      cannot all be further apart on one hue wheel, so lightness is the second axis);
 *      neutral (saturation < 20%) offline is exempt from the hue rule;
 *   2. readable on --color-panel: WCAG contrast >= 4.5:1.
 * Exits 1 on failure. Pass --table to print the full table.
 */
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/styles/tokens.css', import.meta.url), 'utf8');
const token = (name) => {
  const m = css.match(new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!m) throw new Error(`token --color-${name} not found`);
  return m[1];
};

const CATS = ['data', 'text', 'encoding', 'security', 'date-time', 'web', 'developer', 'documents'];
const SEM = ['error', 'warning', 'success', 'info', 'busy', 'offline'];

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

const panel = token('panel');
const others = [...CATS.map((c) => [`cat-${c}`, token(`cat-${c}`)]), ['accent', token('accent')]];
let failed = false;
const rows = [];

for (const name of SEM) {
  const hex = token(name);
  const a = hsl(hex);
  const cr = contrast(hex, panel);
  const problems = [];
  if (cr < 4.5) problems.push(`contrast ${cr.toFixed(2)} < 4.5`);
  for (const [oname, ohex] of others) {
    const o = hsl(ohex);
    const neutral = a.s < 20;
    const ok = neutral || hueDist(a.h, o.h) >= 22 || Math.abs(a.l - o.l) >= 12;
    if (!ok) problems.push(`too close to ${oname} (dH ${hueDist(a.h, o.h).toFixed(0)}, dL ${Math.abs(a.l - o.l).toFixed(0)})`);
  }
  if (problems.length) failed = true;
  rows.push(`${name.padEnd(8)} ${hex} H${a.h.toFixed(0).padStart(3)} S${a.s.toFixed(0).padStart(3)} L${a.l.toFixed(0).padStart(3)} contrast ${cr.toFixed(2)}${problems.length ? '  FAIL: ' + problems.join('; ') : '  ok'}`);
}

if (failed || process.argv.includes('--table')) console.log(rows.join('\n'));
console.log(failed ? '\ncheck-semantic-palette: FAILED' : 'check-semantic-palette: ok');
process.exit(failed ? 1 : 0);
