import {
  APPEARANCE_AXES,
  AppearancePrefs,
  DEFAULT_APPEARANCE,
  FontChoice,
  MONO_FONTS,
  SYSTEM,
  UI_FONTS,
  sanitizeAppearance,
} from './appearance.model';

/**
 * Standalone theme file (Phase 30K): the appearance preferences and nothing else, as a small
 * versioned JSON document that can be shared without a full backup bundle. Pure (no Angular);
 * `parseThemeFile` never throws and always returns a sanitized `AppearancePrefs`, so nothing in
 * a foreign file (including a custom-font CSS-injection attempt) reaches the app unchecked.
 */
export const THEME_FILE_FORMAT = 'dude-theme';
export const THEME_FILE_SCHEMA_VERSION = 1;
export const MAX_THEME_FILE_BYTES = 16 * 1024;
export const THEME_FILE_EXTENSION = '.dude-theme.json';

export interface DudeThemeFile {
  readonly format: typeof THEME_FILE_FORMAT;
  readonly schemaVersion: number;
  readonly exportedAt: string;
  readonly appearance: AppearancePrefs;
}

export interface ThemeFileChange {
  readonly key: string;
  readonly label: string;
  readonly from: string;
  readonly to: string;
}

export type ThemeFileParseResult =
  | { readonly ok: false; readonly error: string }
  | {
      readonly ok: true;
      readonly prefs: AppearancePrefs;
      /** Known preference keys present in the file whose value was invalid and fell back to the default. */
      readonly dropped: string[];
      /** Keys in the file's `appearance` that are not appearance preferences. */
      readonly unknown: string[];
      /** Human-readable differences between the current appearance and the file's. */
      readonly changes: ThemeFileChange[];
    };

const KEY_LABELS: Readonly<Record<string, string>> = {
  mode: 'Theme',
  contrast: 'Contrast',
  accent: 'Accent',
  catset: 'Category palette',
  semantic: 'Status colors',
  density: 'Density',
  uiSize: 'UI text size',
  monoSize: 'Data & code text size',
  ligatures: 'Code ligatures',
  motion: 'Motion',
  uiFont: 'UI font',
  monoFont: 'Data & code font',
};

/** Pref key -> axis name in the token file (`mode` is the `theme` axis). */
const KEY_AXIS: Readonly<Record<string, string>> = { mode: 'theme' };

const PREF_KEYS = Object.keys(DEFAULT_APPEARANCE) as (keyof AppearancePrefs)[];

export function serializeThemeFile(prefs: AppearancePrefs, now: Date = new Date()): string {
  const file: DudeThemeFile = {
    format: THEME_FILE_FORMAT,
    schemaVersion: THEME_FILE_SCHEMA_VERSION,
    exportedAt: now.toISOString(),
    appearance: sanitizeAppearance(prefs),
  };
  return JSON.stringify(file, null, 2);
}

export function themeFileName(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `dude-appearance-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}${THEME_FILE_EXTENSION}`;
}

function describeValue(key: string, value: FontChoice): string {
  if (key === 'uiFont' || key === 'monoFont') {
    if (typeof value !== 'string') return `Custom: ${value.custom}`;
    const options = key === 'uiFont' ? UI_FONTS : MONO_FONTS;
    return options.find((font) => font.id === value)?.label ?? value;
  }
  if (typeof value !== 'string') return String(value);
  if (value === SYSTEM) return 'System';
  const labels = APPEARANCE_AXES[KEY_AXIS[key] ?? key]?.labels;
  return labels?.[value] ?? value;
}

/** A comparable identity for a raw or sanitized value; `undefined` for anything that is not a plausible pref value. */
function identity(value: unknown): string | undefined {
  if (typeof value === 'string') return `s:${value}`;
  if (typeof value === 'object' && value !== null && typeof (value as { custom?: unknown }).custom === 'string') {
    return `c:${(value as { custom: string }).custom.trim()}`;
  }
  return undefined;
}

function utf8Bytes(text: string): number {
  return new TextEncoder().encode(text).length;
}

export function parseThemeFile(text: string, current: AppearancePrefs): ThemeFileParseResult {
  try {
    if (typeof text !== 'string') return { ok: false, error: 'This is not a DUDE theme file.' };
    if (utf8Bytes(text) > MAX_THEME_FILE_BYTES) {
      return { ok: false, error: 'File is larger than 16 KB, so it cannot be a DUDE theme file.' };
    }
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      return { ok: false, error: 'This file is not valid JSON.' };
    }
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      return { ok: false, error: 'This is not a DUDE theme file (expected a JSON object).' };
    }
    const file = raw as Record<string, unknown>;
    if (file['format'] !== THEME_FILE_FORMAT) {
      return {
        ok: false,
        error:
          file['format'] === 'dude-bundle'
            ? 'This is a DUDE backup bundle, not a DUDE theme file. Import it from Data & privacy instead.'
            : 'This is not a DUDE theme file.',
      };
    }
    const version = file['schemaVersion'];
    if (version !== THEME_FILE_SCHEMA_VERSION) {
      return {
        ok: false,
        error:
          typeof version === 'number' && version > THEME_FILE_SCHEMA_VERSION
            ? 'This theme file was exported by a newer DUDE and cannot be imported by this version.'
            : 'This theme file has an unsupported schema version.',
      };
    }
    const appearance = file['appearance'];
    if (typeof appearance !== 'object' || appearance === null || Array.isArray(appearance)) {
      return { ok: false, error: 'This theme file has no appearance settings.' };
    }
    const source = appearance as Record<string, unknown>;
    const prefs = sanitizeAppearance(source);
    const known = new Set<string>(PREF_KEYS);

    const dropped = PREF_KEYS.filter(
      (key) => Object.hasOwn(source, key) && identity(source[key]) !== identity(prefs[key]),
    ).map(String);
    const unknown = Object.keys(source).filter((key) => !known.has(key));
    const changes: ThemeFileChange[] = [];
    for (const key of PREF_KEYS) {
      if (identity(current[key]) === identity(prefs[key])) continue;
      changes.push({
        key,
        label: KEY_LABELS[key] ?? key,
        from: describeValue(key, current[key]),
        to: describeValue(key, prefs[key]),
      });
    }
    return { ok: true, prefs, dropped, unknown, changes };
  } catch {
    return { ok: false, error: 'This file could not be read as a DUDE theme file.' };
  }
}
