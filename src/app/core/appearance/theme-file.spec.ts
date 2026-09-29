import { DEFAULT_APPEARANCE, AppearancePrefs } from './appearance.model';
import {
  MAX_THEME_FILE_BYTES,
  THEME_FILE_EXTENSION,
  parseThemeFile,
  serializeThemeFile,
  themeFileName,
} from './theme-file';

const wrap = (appearance: unknown, extra: Record<string, unknown> = {}) =>
  JSON.stringify({ format: 'dude-theme', schemaVersion: 1, exportedAt: 'x', appearance, ...extra });

describe('theme-file', () => {
  const custom: AppearancePrefs = { ...DEFAULT_APPEARANCE, mode: 'light', uiFont: { custom: 'Fira Sans' } };

  it('names the file by local date', () => {
    expect(themeFileName(new Date(2026, 8, 5))).toBe('dude-appearance-2026-09-05' + THEME_FILE_EXTENSION);
  });

  it('round-trips through serialize and parse', () => {
    const result = parseThemeFile(serializeThemeFile(custom), DEFAULT_APPEARANCE);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.prefs).toEqual(custom);
    expect(result.dropped).toEqual([]);
    expect(result.unknown).toEqual([]);
  });

  it('rejects files over the size cap (UTF-8 bytes)', () => {
    const result = parseThemeFile('x'.repeat(MAX_THEME_FILE_BYTES + 1), DEFAULT_APPEARANCE);
    expect(result.ok === false && result.error).toContain('larger than 16 KB');
  });

  it('rejects a wrong format, pointing bundles to Data & privacy', () => {
    const wrong = parseThemeFile(JSON.stringify({ format: 'other' }), DEFAULT_APPEARANCE);
    expect(wrong.ok === false && wrong.error).toContain('not a DUDE theme file');
    const bundle = parseThemeFile(JSON.stringify({ format: 'dude-bundle' }), DEFAULT_APPEARANCE);
    expect(bundle.ok === false && bundle.error).toContain('Data & privacy');
  });

  it('rejects a newer schema version and malformed JSON', () => {
    const newer = parseThemeFile(wrap({}, { schemaVersion: 2 }), DEFAULT_APPEARANCE);
    expect(newer.ok === false && newer.error).toContain('newer DUDE');
    const bad = parseThemeFile('{nope', DEFAULT_APPEARANCE);
    expect(bad.ok === false && bad.error).toContain('not valid JSON');
  });

  it('rejects a missing or non-object appearance', () => {
    expect(parseThemeFile(wrap([]), DEFAULT_APPEARANCE).ok).toBe(false);
    expect(parseThemeFile(JSON.stringify({ format: 'dude-theme', schemaVersion: 1 }), DEFAULT_APPEARANCE).ok).toBe(false);
  });

  it('reports invalid values as dropped and extra keys as unknown', () => {
    const result = parseThemeFile(wrap({ accent: 'neon', evil: 1 }), DEFAULT_APPEARANCE);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.dropped).toEqual(['accent']);
    expect(result.unknown).toEqual(['evil']);
    expect(result.prefs.accent).toBe(DEFAULT_APPEARANCE.accent);
  });

  it('drops a custom font injection attempt', () => {
    const result = parseThemeFile(wrap({ uiFont: { custom: 'x;}body{' } }), DEFAULT_APPEARANCE);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.dropped).toEqual(['uiFont']);
    expect(result.prefs.uiFont).toBe(DEFAULT_APPEARANCE.uiFont);
  });

  it('lists human-readable changes against the current appearance', () => {
    const result = parseThemeFile(wrap({ ...DEFAULT_APPEARANCE, mode: 'light', motion: 'system', monoFont: { custom: 'Iosevka' } }), {
      ...DEFAULT_APPEARANCE,
      motion: 'reduce',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const byKey = Object.fromEntries(result.changes.map((c) => [c.key, c]));
    expect(byKey['mode']).toMatchObject({ label: 'Theme', from: 'Dark', to: 'Light' });
    expect(byKey['motion']).toMatchObject({ label: 'Motion', from: 'Reduce', to: 'System' });
    expect(byKey['monoFont']).toMatchObject({ label: 'Data & code font', to: 'Custom: Iosevka' });
    expect(result.changes).toHaveLength(3);
  });

  it('reports no changes for an identical appearance', () => {
    const result = parseThemeFile(serializeThemeFile(DEFAULT_APPEARANCE), DEFAULT_APPEARANCE);
    expect(result.ok && result.changes).toEqual([]);
  });

  it('never throws on odd input', () => {
    for (const text of ['', 'null', '[]', '"x"', '{"format":"dude-theme","schemaVersion":1,"appearance":[]}', '{"__proto__":1}']) {
      expect(() => parseThemeFile(text, DEFAULT_APPEARANCE)).not.toThrow();
      expect(parseThemeFile(text, DEFAULT_APPEARANCE).ok).toBe(false);
    }
  });
});
