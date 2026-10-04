import { readFileSync } from 'node:fs';
import { APPEARANCE_AXES, DEFAULT_APPEARANCE, UI_FONTS, MONO_FONTS, sanitizeAppearance, resolveEffective } from './appearance.model.js';
import { THEME_TOKENS_DATA } from './theme-tokens.generated.js';
import { resolveNativeTheme } from './native-theme.js';

const source = JSON.parse(readFileSync(new URL('../../../../../apps/web/src/styles/theme/theme-tokens.json', import.meta.url), 'utf8'));
const media = { prefersLight: false, prefersMoreContrast: false, prefersReducedMotion: false };
function blend(first: string, second: string, percentage: string): string {
  const a = Number.parseInt(first.slice(1), 16);
  const b = second === 'white' ? 0xffffff : second === 'black' ? 0 : Number.parseInt(second.slice(1), 16);
  const weight = Number.parseFloat(percentage) / 100;
  return '#' + [16, 8, 0].map(shift => Math.round(((a >> shift) & 255) * (1 - weight) + ((b >> shift) & 255) * weight).toString(16).padStart(2, '0')).join('');
}

describe('native appearance projection', () => {
  it('generates the complete portable data from the single JSON source', () => {
    expect(THEME_TOKENS_DATA).toEqual(source);
  });

  it('matches every base, accent, category and status combination used by CSS', () => {
    for (const mode of source.axes.theme.values) for (const contrast of source.axes.contrast.values)
    for (const accent of source.axes.accent.values) for (const catset of source.axes.catset.values)
    for (const semantic of source.axes.semantic.values) {
      const theme = resolveNativeTheme({ ...DEFAULT_APPEARANCE, mode, contrast, accent, catset, semantic }, media);
      const base = source.bases[mode][contrast], accents = source.accents[accent][mode][contrast];
      expect(theme.colors).toEqual({ bg: base.bg, panel: base.panel, panelElevated: base['panel-elevated'], border: base.border,
        text: base.text, textMuted: base['text-muted'], scrim: base.scrim, accent: accents.accent, onAccent: accents['on-accent'] });
      expect(theme.status).toEqual(source.semanticSets[semantic][mode][contrast]);
      expect(Object.keys(theme.categories).sort()).toEqual(Object.keys(source.categorySets[catset][mode][contrast]).sort());
      for (const [id, color] of Object.entries(source.categorySets[catset][mode][contrast]) as [keyof typeof theme.categories, string][]) {
        expect(theme.categories[id]).toEqual({ color, wash: blend(base.panel, color, base['wash-pct']), tint: blend(color, base['tint-toward'], base['tint-pct']) });
      }
    }
  });

  it('resolves all system accessibility observations through the shared model', () => {
    const prefs = sanitizeAppearance({ mode: 'system', contrast: 'system', motion: 'system' });
    for (let flags = 0; flags < 8; flags++) {
      const observed = { prefersLight: !!(flags & 1), prefersMoreContrast: !!(flags & 2), prefersReducedMotion: !!(flags & 4) };
      const theme = resolveNativeTheme(prefs, observed);
      expect(theme.effective).toEqual(resolveEffective(prefs, observed));
      expect(theme.reducedMotion).toBe(observed.prefersReducedMotion);
      expect(theme.colors.bg).toBe(source.bases[theme.effective['theme']][theme.effective['contrast']].bg);
    }
  });

  it('converts density lengths to dp, scales text independently and retains touch targets', () => {
    for (const density of APPEARANCE_AXES['density'].values) for (const uiSize of APPEARANCE_AXES['uiSize'].values)
    for (const monoSize of APPEARANCE_AXES['monoSize'].values) {
      const theme = resolveNativeTheme({ ...DEFAULT_APPEARANCE, density, uiSize, monoSize }, media);
      const expected = source.density[density];
      expect(theme.metrics.spacing).toBe(Number.parseFloat(expected.spacing) * 16);
      expect(theme.metrics.radius).toBe(Number.parseFloat(expected.radius) * 16);
      expect(theme.metrics.spacePanel).toBe(Number.parseFloat(expected['space-panel']) * 16);
      expect(theme.metrics.textUi).toBe(Number.parseFloat(expected['text-ui']) * 16 * Number(source.sizeSteps[uiSize]));
      expect(theme.metrics.textMono).toBe(Number.parseFloat(expected['text-ui']) * 16 * Number(source.sizeSteps[monoSize]));
      expect(theme.metrics.controlHeight).toBeGreaterThanOrEqual(48);
      expect(theme.metrics.rowHeight).toBeGreaterThanOrEqual(48);
      expect(theme.metrics.touchMin).toBe(48);
      expect(Object.values(theme.metrics).every(value => Number.isFinite(value) && value > 0)).toBe(true);
    }
  });

  it('keeps synced font choices while resolving Android fallbacks', () => {
    for (const uiFont of [...UI_FONTS.map(font => font.id), { custom: 'My Installed Font' }])
    for (const monoFont of [...MONO_FONTS.map(font => font.id), { custom: 'My Code Font' }]) {
      const theme = resolveNativeTheme({ ...DEFAULT_APPEARANCE, uiFont, monoFont }, media);
      expect(theme.prefs.uiFont).toEqual(uiFont);
      expect(theme.prefs.monoFont).toEqual(monoFont);
      expect(theme.fonts).toEqual({ uiFamily: undefined, monoFamily: 'monospace' });
    }
  });

  it.each([null, [], 'dark', { mode: 'neon', accent: 'invalid', uiFont: { custom: 'x;evil' } }])('sanitizes malformed preferences %j', raw => {
    expect(resolveNativeTheme(raw, media)).toEqual(resolveNativeTheme(DEFAULT_APPEARANCE, media));
  });
});
