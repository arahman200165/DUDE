import tokens from '../../../styles/theme/theme-tokens.json';

/**
 * Pure appearance model (Phase 30K): the shape of the persisted appearance preferences, their
 * sanitizer and the resolution of `'system'` against media queries. Every allowed value is derived
 * from `styles/theme/theme-tokens.json` — the same file the generated CSS is built from — so adding
 * a theme/accent/font there needs no change here. No Angular imports; the service lives beside it.
 */

export interface AppearanceAxis {
  readonly attr: string;
  readonly values: readonly string[];
  readonly default: string;
}

export type AppearanceAxes = Readonly<Record<string, AppearanceAxis>>;

export interface FontOption {
  readonly id: string;
  readonly label: string;
  readonly stack: string;
}

export const APPEARANCE_AXES: AppearanceAxes = tokens.axes;
export const UI_FONTS: readonly FontOption[] = tokens.fonts.ui;
export const MONO_FONTS: readonly FontOption[] = tokens.fonts.mono;

/** A curated font id, or a user-typed family name (sanitised by `sanitizeFontFamily`). */
export type FontChoice = string | { readonly custom: string };

/** A value from `axes.theme.values`, or `'system'`. */
export type AppearanceMode = string;

export interface AppearancePrefs {
  readonly mode: AppearanceMode;
  readonly contrast: string;
  readonly accent: string;
  readonly catset: string;
  readonly semantic: string;
  readonly density: string;
  readonly uiFont: FontChoice;
  readonly monoFont: FontChoice;
}

export interface MediaState {
  readonly prefersLight: boolean;
  readonly prefersMoreContrast: boolean;
}

/** Preference key -> axis name in `theme-tokens.json` (`mode` is the `theme` axis). */
const PREF_AXIS = {
  mode: 'theme',
  contrast: 'contrast',
  accent: 'accent',
  catset: 'catset',
  semantic: 'semantic',
  density: 'density',
} as const;

type AxisPrefKey = keyof typeof PREF_AXIS;
const AXIS_PREF_KEYS = Object.keys(PREF_AXIS) as AxisPrefKey[];

export const SYSTEM = 'system';

export const DEFAULT_APPEARANCE: AppearancePrefs = {
  mode: APPEARANCE_AXES['theme'].default,
  contrast: APPEARANCE_AXES['contrast'].default,
  accent: APPEARANCE_AXES['accent'].default,
  catset: APPEARANCE_AXES['catset'].default,
  semantic: APPEARANCE_AXES['semantic'].default,
  density: APPEARANCE_AXES['density'].default,
  uiFont: tokens.fonts.defaultUi,
  monoFont: tokens.fonts.defaultMono,
};

const FONT_NAME_PATTERN = /^[A-Za-z0-9 _.-]{1,64}$/;

/**
 * CSS-injection guard: a custom font name ends up inside a CSS custom property, so only a tiny
 * safe alphabet is accepted. Returns the name as a double-quoted CSS string, or `null`.
 */
export function sanitizeFontFamily(name: string): string | null {
  if (typeof name !== 'string') return null;
  const trimmed = name.trim();
  return FONT_NAME_PATTERN.test(trimmed) ? `"${trimmed}"` : null;
}

function sanitizeFontChoice(raw: unknown, options: readonly FontOption[], fallback: string): FontChoice {
  if (typeof raw === 'string') return options.some((font) => font.id === raw) ? raw : fallback;
  if (typeof raw === 'object' && raw !== null && typeof (raw as { custom?: unknown }).custom === 'string') {
    const custom = (raw as { custom: string }).custom.trim();
    if (sanitizeFontFamily(custom) !== null) return { custom };
  }
  return fallback;
}

/** Whether `value` is allowed for a preference; `mode` and `contrast` also accept `'system'`. */
function allowedValue(key: AxisPrefKey, value: unknown, axes: AppearanceAxes): value is string {
  if (typeof value !== 'string') return false;
  if ((key === 'mode' || key === 'contrast') && value === SYSTEM) return true;
  return axes[PREF_AXIS[key]]?.values.includes(value) ?? false;
}

/** Never throws: every field is clamped to an allowed value (else its default), unknown keys are dropped. */
export function sanitizeAppearance(raw: unknown, axes: AppearanceAxes = APPEARANCE_AXES): AppearancePrefs {
  const source = typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const axisValues = {} as Record<AxisPrefKey, string>;
  for (const key of AXIS_PREF_KEYS) {
    const value = source[key];
    axisValues[key] = allowedValue(key, value, axes) ? value : (axes[PREF_AXIS[key]]?.default ?? DEFAULT_APPEARANCE[key]);
  }
  return {
    ...axisValues,
    uiFont: sanitizeFontChoice(source['uiFont'], UI_FONTS, tokens.fonts.defaultUi),
    monoFont: sanitizeFontChoice(source['monoFont'], MONO_FONTS, tokens.fonts.defaultMono),
  };
}

/** The concrete value of every axis (keyed by axis name), with `'system'` resolved against the media state. */
export function resolveEffective(
  prefs: AppearancePrefs,
  media: MediaState,
  axes: AppearanceAxes = APPEARANCE_AXES,
): Record<string, string> {
  const effective: Record<string, string> = {};
  for (const key of AXIS_PREF_KEYS) {
    const axis = axes[PREF_AXIS[key]];
    if (!axis) continue;
    effective[PREF_AXIS[key]] = prefs[key];
  }

  const theme = axes['theme'];
  if (theme && prefs.mode === SYSTEM) {
    effective['theme'] = media.prefersLight && theme.values.includes('light') ? 'light' : theme.default;
  }
  const contrast = axes['contrast'];
  if (contrast && prefs.contrast === SYSTEM) {
    effective['contrast'] = media.prefersMoreContrast && contrast.values.includes('high') ? 'high' : contrast.default;
  }
  return effective;
}

/** The CSS `font-family` value for the UI or mono font. */
export function fontStack(prefs: AppearancePrefs, kind: 'ui' | 'mono'): string {
  const options = kind === 'ui' ? UI_FONTS : MONO_FONTS;
  const defaultId = kind === 'ui' ? tokens.fonts.defaultUi : tokens.fonts.defaultMono;
  const defaultStack = options.find((font) => font.id === defaultId)?.stack ?? '';
  const choice = kind === 'ui' ? prefs.uiFont : prefs.monoFont;

  if (typeof choice === 'string') return options.find((font) => font.id === choice)?.stack ?? defaultStack;
  const family = sanitizeFontFamily(choice.custom);
  return family === null ? defaultStack : `${family}, ${defaultStack}`;
}
