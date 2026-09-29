import {
  APPEARANCE_AXES,
  AppearanceAxes,
  DEFAULT_APPEARANCE,
  MONO_FONTS,
  UI_FONTS,
  fontStack,
  resolveEffective,
  sanitizeAppearance,
  sanitizeFontFamily,
} from './appearance.model';

// A richer axes object than the JSON's single values, to exercise the multi-value logic.
const RICH_AXES: AppearanceAxes = {
  theme: { attr: 'data-theme', values: ['dark', 'light'], default: 'dark' },
  contrast: { attr: 'data-contrast', values: ['standard', 'high'], default: 'standard' },
  accent: { attr: 'data-accent', values: ['cyan', 'violet'], default: 'cyan' },
  catset: { attr: 'data-catset', values: ['vivid'], default: 'vivid' },
  semantic: { attr: 'data-semantic', values: ['standard'], default: 'standard' },
  density: { attr: 'data-density', values: ['compact', 'comfortable'], default: 'compact' },
  uiSize: { attr: 'data-ui-size', values: ['default', 'large'], default: 'default' },
  monoSize: { attr: 'data-mono-size', values: ['default', 'large'], default: 'default' },
  ligatures: { attr: 'data-ligatures', values: ['on', 'off'], default: 'on' },
  motion: { attr: 'data-motion', values: ['allow', 'reduce'], default: 'allow' },
};

const NO_MEDIA = { prefersLight: false, prefersMoreContrast: false, prefersReducedMotion: false };

describe('appearance model', () => {
  describe('defaults', () => {
    it('come from the token JSON defaults', () => {
      expect(DEFAULT_APPEARANCE.mode).toBe(APPEARANCE_AXES['theme'].default);
      expect(DEFAULT_APPEARANCE.contrast).toBe(APPEARANCE_AXES['contrast'].default);
      expect(DEFAULT_APPEARANCE.accent).toBe(APPEARANCE_AXES['accent'].default);
      expect(DEFAULT_APPEARANCE.catset).toBe(APPEARANCE_AXES['catset'].default);
      expect(DEFAULT_APPEARANCE.semantic).toBe(APPEARANCE_AXES['semantic'].default);
      expect(DEFAULT_APPEARANCE.density).toBe(APPEARANCE_AXES['density'].default);
      expect(DEFAULT_APPEARANCE.uiSize).toBe(APPEARANCE_AXES['uiSize'].default);
      expect(DEFAULT_APPEARANCE.monoSize).toBe(APPEARANCE_AXES['monoSize'].default);
      expect(DEFAULT_APPEARANCE.ligatures).toBe(APPEARANCE_AXES['ligatures'].default);
      expect(DEFAULT_APPEARANCE.motion).toBe('system');
      expect(UI_FONTS.some((font) => font.id === DEFAULT_APPEARANCE.uiFont)).toBe(true);
      expect(MONO_FONTS.some((font) => font.id === DEFAULT_APPEARANCE.monoFont)).toBe(true);
    });

    it('are a fixed point of the sanitizer', () => {
      expect(sanitizeAppearance(DEFAULT_APPEARANCE)).toEqual(DEFAULT_APPEARANCE);
    });
  });

  describe('generated axes', () => {
    it('list the shipped accents and category sets, defaults first', () => {
      expect(APPEARANCE_AXES['accent'].values).toEqual(['cyan', 'blue', 'violet', 'green', 'amber', 'magenta']);
      expect(APPEARANCE_AXES['catset'].values).toEqual(['vivid', 'soft', 'cvd']);
    });

    it('carry a display label for every value and none for unknown values', () => {
      for (const axis of Object.values(APPEARANCE_AXES)) {
        const labels = axis.labels ?? {};
        expect(Object.keys(labels).sort()).toEqual([...axis.values].sort());
        expect(Object.values(labels).every((label) => label.trim() !== '')).toBe(true);
      }
    });

    it('accept every shipped accent and category set through the sanitizer', () => {
      for (const accent of APPEARANCE_AXES['accent'].values) {
        expect(sanitizeAppearance({ accent }).accent).toBe(accent);
      }
      for (const catset of APPEARANCE_AXES['catset'].values) {
        expect(sanitizeAppearance({ catset }).catset).toBe(catset);
      }
    });

    it('list the three densities and the size / ligature axes, defaults first', () => {
      expect(APPEARANCE_AXES['density'].values).toEqual(['compact', 'comfortable', 'ultra']);
      expect(APPEARANCE_AXES['uiSize'].values).toEqual(['default', 'small', 'large']);
      expect(APPEARANCE_AXES['monoSize'].values).toEqual(['default', 'small', 'large']);
      expect(APPEARANCE_AXES['ligatures'].values).toEqual(['on', 'off']);
      expect(APPEARANCE_AXES['uiSize'].attr).toBe('data-ui-size');
      expect(APPEARANCE_AXES['monoSize'].attr).toBe('data-mono-size');
      expect(APPEARANCE_AXES['ligatures'].attr).toBe('data-ligatures');
    });

    it('accept every density, size step and ligature value, and reject unknown or wrong-typed ones', () => {
      for (const density of ['compact', 'comfortable', 'ultra']) expect(sanitizeAppearance({ density }).density).toBe(density);
      for (const key of ['uiSize', 'monoSize'] as const) {
        for (const value of ['default', 'small', 'large']) expect(sanitizeAppearance({ [key]: value })[key]).toBe(value);
        for (const bad of ['huge', 'system', 3, null, {}]) expect(sanitizeAppearance({ [key]: bad })[key]).toBe('default');
      }
      for (const value of ['on', 'off']) expect(sanitizeAppearance({ ligatures: value }).ligatures).toBe(value);
      for (const bad of ['yes', true, 1, null]) expect(sanitizeAppearance({ ligatures: bad }).ligatures).toBe('on');
    });

    it('accept every curated font id and fall back to the default for an unknown id', () => {
      expect(UI_FONTS.map((font) => font.id)).toEqual(['system', 'segoe', 'inter', 'helvetica', 'verdana', 'atkinson']);
      expect(MONO_FONTS.map((font) => font.id)).toEqual(['default', 'cascadia', 'consolas', 'system', 'plex', 'source']);
      for (const font of UI_FONTS) expect(sanitizeAppearance({ uiFont: font.id }).uiFont).toBe(font.id);
      for (const font of MONO_FONTS) expect(sanitizeAppearance({ monoFont: font.id }).monoFont).toBe(font.id);
      expect(sanitizeAppearance({ uiFont: 'comic' }).uiFont).toBe('system');
      expect(sanitizeAppearance({ monoFont: 'comic' }).monoFont).toBe('default');
    });
  });

  describe('sanitizeAppearance', () => {
    it.each([null, undefined, 'dark', 42, true, [], ['mode']])('returns defaults for non-object %j', (raw) => {
      expect(sanitizeAppearance(raw)).toEqual(DEFAULT_APPEARANCE);
    });

    it('replaces unknown and wrong-typed values with defaults', () => {
      const result = sanitizeAppearance({ mode: 'neon', contrast: 5, accent: null, catset: {}, semantic: [], density: 'huge' });
      expect(result).toEqual(DEFAULT_APPEARANCE);
    });

    it('accepts "system" for mode and contrast only', () => {
      const result = sanitizeAppearance({ mode: 'system', contrast: 'system', accent: 'system', density: 'system' });
      expect(result.mode).toBe('system');
      expect(result.contrast).toBe('system');
      expect(result.accent).toBe(DEFAULT_APPEARANCE.accent);
      expect(result.density).toBe(DEFAULT_APPEARANCE.density);
    });

    it('accepts "system", "allow" and "reduce" for motion and falls back to "system"', () => {
      expect(sanitizeAppearance({}).motion).toBe('system');
      expect(sanitizeAppearance({ motion: 'system' }).motion).toBe('system');
      expect(sanitizeAppearance({ motion: 'allow' }).motion).toBe('allow');
      expect(sanitizeAppearance({ motion: 'reduce' }).motion).toBe('reduce');
      for (const junk of ['none', 5, null, {}, 'REDUCE']) expect(sanitizeAppearance({ motion: junk }).motion).toBe('system');
    });

    it('keeps allowed values from a richer axes set', () => {
      const result = sanitizeAppearance({ mode: 'light', contrast: 'high', accent: 'violet', density: 'comfortable' }, RICH_AXES);
      expect(result).toMatchObject({ mode: 'light', contrast: 'high', accent: 'violet', density: 'comfortable' });
      expect(sanitizeAppearance({ mode: 'neon', accent: 'chartreuse' })).toMatchObject({ mode: DEFAULT_APPEARANCE.mode, accent: DEFAULT_APPEARANCE.accent });
    });

    it('drops unknown keys', () => {
      const result = sanitizeAppearance({ mode: 'dark', extra: 'x', __proto__: { polluted: true }, constructor: 'y' });
      expect(Object.keys(result).sort()).toEqual(Object.keys(DEFAULT_APPEARANCE).sort());
    });

    it('keeps curated font ids and custom font names, rejecting anything else', () => {
      expect(sanitizeAppearance({ uiFont: UI_FONTS[0].id }).uiFont).toBe(UI_FONTS[0].id);
      expect(sanitizeAppearance({ uiFont: 'not-a-font' }).uiFont).toBe(DEFAULT_APPEARANCE.uiFont);
      expect(sanitizeAppearance({ monoFont: { custom: '  Cascadia Code ' } }).monoFont).toEqual({ custom: 'Cascadia Code' });
      expect(sanitizeAppearance({ monoFont: { custom: 'x"; background:url(evil)' } }).monoFont).toBe(DEFAULT_APPEARANCE.monoFont);
      expect(sanitizeAppearance({ monoFont: { custom: 7 } }).monoFont).toBe(DEFAULT_APPEARANCE.monoFont);
      expect(sanitizeAppearance({ uiFont: { other: 'x' } }).uiFont).toBe(DEFAULT_APPEARANCE.uiFont);
    });
  });

  describe('sanitizeFontFamily', () => {
    it('quotes a safe name and trims whitespace', () => {
      expect(sanitizeFontFamily('Inter')).toBe('"Inter"');
      expect(sanitizeFontFamily('  Fira Code-2.0_x  ')).toBe('"Fira Code-2.0_x"');
      expect(sanitizeFontFamily('a'.repeat(64))).toBe(`"${'a'.repeat(64)}"`);
    });

    it.each([
      ['a quote breakout', 'x"; background:url(evil)'],
      ['a rule terminator', 'a;}'],
      ['a style close tag', '</style>'],
      ['a backslash escape', 'a\\22 b'],
      ['a single quote', "it's"],
      ['a comma list', 'Inter, sans-serif'],
      ['a newline', 'a\nb'],
      ['unicode', 'Fönt'],
      ['empty', ''],
      ['whitespace only', '   '],
      ['65 characters', 'a'.repeat(65)],
    ])('rejects %s', (_label, input) => {
      expect(sanitizeFontFamily(input)).toBeNull();
    });
  });

  describe('resolveEffective', () => {
    it('passes explicit values through, keyed by axis name', () => {
      expect(resolveEffective({ ...DEFAULT_APPEARANCE, accent: 'violet', density: 'comfortable' }, NO_MEDIA, RICH_AXES)).toEqual({
        theme: 'dark',
        contrast: 'standard',
        accent: 'violet',
        catset: 'vivid',
        semantic: 'standard',
        density: 'comfortable',
        uiSize: 'default',
        monoSize: 'default',
        ligatures: 'on',
        motion: 'allow',
      });
    });

    it('resolves "system" motion from prefers-reduced-motion; explicit values ignore the media', () => {
      const system = { ...DEFAULT_APPEARANCE, motion: 'system' };
      const reduced = { ...NO_MEDIA, prefersReducedMotion: true };
      expect(resolveEffective(system, reduced, RICH_AXES)['motion']).toBe('reduce');
      expect(resolveEffective(system, NO_MEDIA, RICH_AXES)['motion']).toBe('allow');
      expect(resolveEffective({ ...system, motion: 'reduce' }, NO_MEDIA, RICH_AXES)['motion']).toBe('reduce');
      expect(resolveEffective({ ...system, motion: 'allow' }, reduced, RICH_AXES)['motion']).toBe('allow');
    });

    it('resolves "system" to the axis default when an axis has no alternative value, whatever the media says', () => {
      const prefs = { ...DEFAULT_APPEARANCE, mode: 'system', contrast: 'system' };
      const darkOnly = {
        ...APPEARANCE_AXES,
        theme: { ...APPEARANCE_AXES['theme'], values: ['dark'] },
        contrast: { ...APPEARANCE_AXES['contrast'], values: ['standard'] },
      };
      const effective = resolveEffective(prefs, { prefersLight: true, prefersMoreContrast: true, prefersReducedMotion: true }, darkOnly);
      expect(effective['theme']).toBe(APPEARANCE_AXES['theme'].default);
      expect(effective['contrast']).toBe(APPEARANCE_AXES['contrast'].default);
    });

    it('resolves "system" mode from prefers-color-scheme when light exists', () => {
      const prefs = { ...DEFAULT_APPEARANCE, mode: 'system' };
      expect(resolveEffective(prefs, { prefersLight: true, prefersMoreContrast: false, prefersReducedMotion: false }, RICH_AXES)['theme']).toBe('light');
      expect(resolveEffective(prefs, NO_MEDIA, RICH_AXES)['theme']).toBe('dark');
    });

    it('resolves "system" contrast from prefers-contrast when high exists', () => {
      const prefs = { ...DEFAULT_APPEARANCE, contrast: 'system' };
      expect(resolveEffective(prefs, { prefersLight: false, prefersMoreContrast: true, prefersReducedMotion: false }, RICH_AXES)['contrast']).toBe('high');
      expect(resolveEffective(prefs, NO_MEDIA, RICH_AXES)['contrast']).toBe('standard');
    });

    it('does not resolve to light/high when the axis lacks them', () => {
      const axes: AppearanceAxes = { ...RICH_AXES, theme: { ...RICH_AXES['theme'], values: ['dark'] }, contrast: { ...RICH_AXES['contrast'], values: ['standard'] } };
      const prefs = { ...DEFAULT_APPEARANCE, mode: 'system', contrast: 'system' };
      const effective = resolveEffective(prefs, { prefersLight: true, prefersMoreContrast: true, prefersReducedMotion: true }, axes);
      expect(effective['theme']).toBe('dark');
      expect(effective['contrast']).toBe('standard');
    });
  });

  describe('fontStack', () => {
    it('returns the curated stack for an id', () => {
      expect(fontStack(DEFAULT_APPEARANCE, 'ui')).toBe(UI_FONTS.find((font) => font.id === DEFAULT_APPEARANCE.uiFont)?.stack);
      expect(fontStack(DEFAULT_APPEARANCE, 'mono')).toBe(MONO_FONTS.find((font) => font.id === DEFAULT_APPEARANCE.monoFont)?.stack);
    });

    it('puts a valid custom family in front of the default stack', () => {
      const defaultStack = fontStack(DEFAULT_APPEARANCE, 'mono');
      expect(fontStack({ ...DEFAULT_APPEARANCE, monoFont: { custom: 'Cascadia Code' } }, 'mono')).toBe(`"Cascadia Code", ${defaultStack}`);
    });

    it('falls back to the default stack for an invalid custom family or unknown id', () => {
      const defaultStack = fontStack(DEFAULT_APPEARANCE, 'ui');
      expect(fontStack({ ...DEFAULT_APPEARANCE, uiFont: { custom: 'a;}' } }, 'ui')).toBe(defaultStack);
      expect(fontStack({ ...DEFAULT_APPEARANCE, uiFont: 'nope' }, 'ui')).toBe(defaultStack);
    });
  });
});
