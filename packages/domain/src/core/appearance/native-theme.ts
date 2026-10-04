import type { ToolCategory } from '@dude/shared-types/shared/models/tool-category.model';
import { sanitizeAppearance, resolveEffective, type AppearancePrefs, type MediaState } from './appearance.model.js';
import { THEME_TOKENS_DATA } from './theme-tokens.generated.js';

type TokenBlock = Readonly<Record<string, string>>;
type ThemeContrast = Readonly<Record<string, Readonly<Record<string, TokenBlock>>>>;
const tokens: {
  bases: ThemeContrast;
  accents: Readonly<Record<string, ThemeContrast>>;
  categorySets: Readonly<Record<string, ThemeContrast>>;
  semanticSets: Readonly<Record<string, ThemeContrast>>;
  density: Readonly<Record<string, TokenBlock>>;
  sizeSteps: TokenBlock;
} = THEME_TOKENS_DATA;

export type NativeStatus = 'error' | 'warning' | 'success' | 'info' | 'busy' | 'offline';
export interface NativeCategoryColors {
  readonly color: string;
  readonly wash: string;
  readonly tint: string;
}
export interface NativeTheme {
  readonly prefs: AppearancePrefs;
  readonly effective: Readonly<Record<string, string>>;
  readonly colors: {
    readonly bg: string;
    readonly panel: string;
    readonly panelElevated: string;
    readonly border: string;
    readonly text: string;
    readonly textMuted: string;
    readonly accent: string;
    readonly onAccent: string;
    readonly scrim: string;
  };
  readonly categories: Readonly<Record<ToolCategory, NativeCategoryColors>>;
  readonly status: Readonly<Record<NativeStatus, string>>;
  readonly metrics: {
    readonly spacing: number;
    readonly controlHeight: number;
    readonly rowHeight: number;
    readonly radius: number;
    readonly textUi: number;
    readonly textUiSm: number;
    readonly textUiXs: number;
    readonly textMono: number;
    readonly spaceMicro: number;
    readonly spaceNormal: number;
    readonly spacePanel: number;
    readonly spaceMajor: number;
    readonly spaceExceptional: number;
    readonly focusWidth: number;
    readonly touchMin: number;
  };
  readonly fonts: { readonly uiFamily: string | undefined; readonly monoFamily: string };
  readonly reducedMotion: boolean;
}

/** Shared CSS lengths use a 16px rem root; native dp keeps that logical scale. */
function dp(value: string): number {
  const match = /^(\d+(?:\.\d+)?)(rem|px)$/.exec(value);
  if (!match) throw new Error(`Unsupported native theme length: ${value}`);
  return Number(match[1]) * (match[2] === 'rem' ? 16 : 1);
}

/** Same sRGB interpolation as the CSS color-mix formulas, with native hex output. */
function mix(first: string, second: string | 'white' | 'black', percentage: string): string {
  const weight = Number.parseFloat(percentage) / 100;
  const channels = [1, 3, 5].map(offset => {
    const a = Number.parseInt(first.slice(offset, offset + 2), 16);
    const b = second === 'white' ? 255 : second === 'black' ? 0 : Number.parseInt(second.slice(offset, offset + 2), 16);
    return Math.round(a * (1 - weight) + b * weight).toString(16).padStart(2, '0');
  });
  return `#${channels.join('')}`;
}

/**
 * Pure host-independent projection of the controlled token source. Android observes its OS
 * accessibility state and supplies MediaState; no React Native or host globals belong here.
 * Unbundled desktop/custom font choices survive in prefs for sync, while Android uses its
 * system UI and monospace fonts. RN's accessibility font scaling remains enabled by the UI.
 */
export function resolveNativeTheme(raw: unknown, media: MediaState): NativeTheme {
  const prefs = sanitizeAppearance(raw);
  const effective = resolveEffective(prefs, media);
  const theme = effective['theme'], contrast = effective['contrast'];
  const base = tokens.bases[theme][contrast];
  const accent = tokens.accents[effective['accent']][theme][contrast];
  const category = tokens.categorySets[effective['catset']][theme][contrast];
  const status = tokens.semanticSets[effective['semantic']][theme][contrast];
  const density = tokens.density[effective['density']];
  const uiScale = Number(tokens.sizeSteps[effective['uiSize']]);
  const monoScale = Number(tokens.sizeSteps[effective['monoSize']]);
  const touchMin = 48;
  const categories = Object.fromEntries(Object.entries(category).map(([id, color]) => [id, {
    color,
    wash: mix(base['panel'], color, base['wash-pct']),
    tint: mix(color, base['tint-toward'], base['tint-pct']),
  }])) as Record<ToolCategory, NativeCategoryColors>;
  return {
    prefs, effective,
    colors: {
      bg: base['bg'], panel: base['panel'], panelElevated: base['panel-elevated'],
      border: base['border'], text: base['text'], textMuted: base['text-muted'],
      accent: accent['accent'], onAccent: accent['on-accent'], scrim: base['scrim'],
    },
    categories,
    status: status as Record<NativeStatus, string>,
    metrics: {
      spacing: dp(density['spacing']),
      controlHeight: Math.max(touchMin, dp(density['control-h'])),
      rowHeight: Math.max(touchMin, dp(density['row-h'])),
      radius: dp(density['radius']),
      textUi: dp(density['text-ui']) * uiScale,
      textUiSm: dp(density['text-ui-sm']) * uiScale,
      textUiXs: dp(density['text-ui-xs']) * uiScale,
      textMono: dp(density['text-ui']) * monoScale,
      spaceMicro: dp(density['space-micro']), spaceNormal: dp(density['space-normal']),
      spacePanel: dp(density['space-panel']), spaceMajor: dp(density['space-major']),
      spaceExceptional: dp(density['space-exceptional']), focusWidth: dp(base['focus-width']), touchMin,
    },
    fonts: { uiFamily: undefined, monoFamily: 'monospace' },
    reducedMotion: effective['motion'] === 'reduce',
  };
}
