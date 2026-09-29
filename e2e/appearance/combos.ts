import * as fs from 'node:fs';
import * as path from 'node:path';

/** Storage key the pre-paint script and AppearanceService read (see src/index.html). */
export const APPEARANCE_STORAGE_KEY = 'dude:v1:settings:appearance';

interface AxisDef {
  attr: string;
  values: string[];
  default: string;
}

interface ThemeTokens {
  axes: Record<string, AxisDef>;
  fonts: { defaultUi: string; defaultMono: string };
}

export interface AppearanceCombo {
  /** e.g. `dark/standard/cyan/vivid/standard/compact` (axis order = theme-tokens.json order). */
  key: string;
  /** Axis name -> chosen value. */
  values: Record<string, string>;
  /** `data-*` attribute -> value expected on <html>. */
  attrs: Record<string, string>;
  /** Object stored under APPEARANCE_STORAGE_KEY. The theme axis is stored as `mode`. */
  prefs: Record<string, string>;
}

/** Axes whose values can change layout/sizing; the multi-viewport sub-matrix iterates only these. */
export const LAYOUT_AXES = ['theme', 'contrast', 'density'];

export const VIEWPORTS = [
  { width: 1920, height: 1080 },
  { width: 1440, height: 900 },
  { width: 1366, height: 768 },
];

export function loadTokens(): ThemeTokens {
  const file = path.resolve(__dirname, '../../src/styles/theme/theme-tokens.json');
  return JSON.parse(fs.readFileSync(file, 'utf8')) as ThemeTokens;
}

function buildCombo(tokens: ThemeTokens, values: Record<string, string>): AppearanceCombo {
  const attrs: Record<string, string> = {};
  const prefs: Record<string, string> = {};
  for (const [axis, value] of Object.entries(values)) {
    attrs[tokens.axes[axis].attr] = value;
    prefs[axis === 'theme' ? 'mode' : axis] = value;
  }
  prefs['uiFont'] = tokens.fonts.defaultUi;
  prefs['monoFont'] = tokens.fonts.defaultMono;
  return { key: Object.values(values).join('/'), values, attrs, prefs };
}

/** Cross product of `axisNames` (the rest pinned to their defaults). */
function crossProduct(tokens: ThemeTokens, axisNames: string[]): AppearanceCombo[] {
  const defaults = Object.fromEntries(Object.entries(tokens.axes).map(([name, def]) => [name, def.default]));
  let acc: Record<string, string>[] = [{}];
  for (const name of Object.keys(tokens.axes)) {
    const choices = axisNames.includes(name) ? tokens.axes[name].values : [defaults[name]];
    acc = acc.flatMap((partial) => choices.map((value) => ({ ...partial, [name]: value })));
  }
  return acc.map((values) => buildCombo(tokens, values));
}

/** Every combination of every axis value. Grows automatically as theme-tokens.json grows. */
export function allCombos(): AppearanceCombo[] {
  const tokens = loadTokens();
  return crossProduct(tokens, Object.keys(tokens.axes));
}

/** Every combination of the LAYOUT_AXES values, other axes at their defaults. */
export function layoutCombos(): AppearanceCombo[] {
  const tokens = loadTokens();
  return crossProduct(tokens, LAYOUT_AXES.filter((name) => name in tokens.axes));
}

/** One representative tool per category (verified against the tool manifests). */
export const TOOL_IDS = ['json', 'case-converter', 'base64', 'jwt', 'cron', 'http-status', 'regex', 'markdown'];
