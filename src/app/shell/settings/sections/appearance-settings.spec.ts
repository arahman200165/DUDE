import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AppearanceAxes, DEFAULT_APPEARANCE, MONO_FONTS, UI_FONTS } from '../../../core/appearance/appearance.model';
import { AppearanceService } from '../../../core/appearance/appearance.service';
import { TOOL_CATEGORIES } from '../../../shared/models/tool-category.model';
import { APPEARANCE_SETTINGS_AXES, AppearanceSettings } from './appearance-settings';

function buttonWithText(root: HTMLElement, text: string): HTMLButtonElement {
  return Array.from(root.querySelectorAll('button')).find((button) => button.textContent?.trim() === text) as HTMLButtonElement;
}

describe('AppearanceSettings', () => {
  let prefs: ReturnType<typeof signal<Record<string, unknown>>>;
  let resolved: ReturnType<typeof signal<string>>;
  let resolvedContrast: ReturnType<typeof signal<string>>;
  let set: ReturnType<typeof vi.fn>;
  let reset: ReturnType<typeof vi.fn>;

  const patch = (partial: Record<string, unknown>) => prefs.update((current) => ({ ...current, ...partial }));

  beforeEach(() => {
    prefs = signal<Record<string, unknown>>({ ...DEFAULT_APPEARANCE, mode: 'dark', accent: 'cyan', catset: 'vivid', contrast: 'standard', semantic: 'standard' });
    resolved = signal('dark');
    resolvedContrast = signal('standard');
    set = vi.fn((partial: Record<string, unknown>) => patch(partial));
    reset = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: AppearanceService,
          useValue: {
            prefs: computed(() => prefs()),
            effective: computed(() => ({ theme: resolved(), contrast: resolvedContrast() })),
            set,
            reset,
          },
        },
      ],
    });
  });

  afterEach(() => vi.restoreAllMocks());

  const MULTI: AppearanceAxes = {
    theme: { attr: 'data-theme', values: ['dark', 'light'], default: 'dark' },
    accent: { attr: 'data-accent', values: ['cyan', 'blue', 'violet'], default: 'cyan' },
    catset: { attr: 'data-catset', values: ['vivid', 'soft', 'cvd'], default: 'vivid' },
    contrast: { attr: 'data-contrast', values: ['standard', 'high'], default: 'standard', labels: { standard: 'Standard', high: 'High' } },
    semantic: { attr: 'data-semantic', values: ['standard', 'cvd'], default: 'standard', labels: { standard: 'Standard', cvd: 'Color-blind safe' } },
    density: { attr: 'data-density', values: ['compact', 'comfortable', 'ultra'], default: 'compact', labels: { compact: 'Compact', comfortable: 'Comfortable', ultra: 'Ultra-compact' } },
    ligatures: { attr: 'data-ligatures', values: ['on', 'off'], default: 'on' },
    motion: { attr: 'data-motion', values: ['allow', 'reduce'], default: 'allow', labels: { allow: 'Allow', reduce: 'Reduce' } },
  };

  function withAxes(axes: AppearanceAxes) {
    TestBed.overrideProvider(APPEARANCE_SETTINGS_AXES, { useValue: axes });
  }

  function group(root: HTMLElement, label: string): HTMLElement | null {
    return root.querySelector('[role="group"][aria-label="' + label + '"]');
  }

  function create() {
    const fixture = TestBed.createComponent(AppearanceSettings);
    fixture.detectChanges();
    return fixture;
  }

  function pressed(root: HTMLElement): Record<string, string | null> {
    const group = root.querySelector('[role="group"]') as HTMLElement;
    return Object.fromEntries(Array.from(group.querySelectorAll('button')).map((b) => [b.textContent?.trim() ?? '', b.getAttribute('aria-pressed')]));
  }

  it('offers Dark, Light and System chips in an aria-labelled group', () => {
    const root = create().nativeElement as HTMLElement;
    const group = root.querySelector('[role="group"]') as HTMLElement;
    expect(group.getAttribute('aria-label')).toBe('Theme');
    expect(Object.keys(pressed(root))).toEqual(['Dark', 'Light', 'System (follows OS)']);
  });

  it('clicking Light calls set({ mode: "light" }) and aria-pressed follows prefs().mode', () => {
    const fixture = create();
    const root = fixture.nativeElement as HTMLElement;
    expect(pressed(root)).toEqual({ Dark: 'true', Light: 'false', 'System (follows OS)': 'false' });

    buttonWithText(root, 'Light').click();
    fixture.detectChanges();

    expect(set).toHaveBeenCalledWith({ mode: 'light' });
    expect(pressed(root)).toEqual({ Dark: 'false', Light: 'true', 'System (follows OS)': 'false' });
    expect(buttonWithText(root, 'Light').className).toContain('dude-chip-on');
    expect(buttonWithText(root, 'Dark').className).toContain('dude-chip-off');
  });

  it('shows the resolved theme only while mode is system', () => {
    const fixture = create();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[data-testid="system-note-theme"]')).toBeNull();

    patch({ mode: 'system' });
    resolved.set('light');
    fixture.detectChanges();
    expect(root.querySelector('[data-testid="system-note-theme"]')?.textContent).toContain('Currently: Light');
  });

  it('renders a labelled swatch for every category and status token', () => {
    const root = create().nativeElement as HTMLElement;
    expect(root.querySelectorAll('[data-testid="swatches-category"] li')).toHaveLength(TOOL_CATEGORIES.length);
    expect(root.querySelector('[data-testid="swatches-category"] li')?.textContent?.trim()).toBeTruthy();
    expect(root.querySelector('[data-testid="swatches-status"]')?.textContent).toContain('Error');
  });

  it('resets appearance only after confirming', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const root = create().nativeElement as HTMLElement;

    buttonWithText(root, 'Reset appearance to defaults').click();
    expect(reset).not.toHaveBeenCalled();

    confirmSpy.mockReturnValue(true);
    buttonWithText(root, 'Reset appearance to defaults').click();
    expect(reset).toHaveBeenCalledOnce();
  });

  it('renders a Contrast row for a multi-value axis, with system resolution and set({ contrast })', () => {
    withAxes(MULTI);
    const fixture = create();
    const root = fixture.nativeElement as HTMLElement;
    const state = () => Object.fromEntries(Array.from((group(root, 'Contrast') as HTMLElement).querySelectorAll('button')).map((b) => [b.textContent?.trim(), b.getAttribute('aria-pressed')]));
    expect(state()).toEqual({ Standard: 'true', High: 'false', 'System (follows OS)': 'false' });
    expect(root.textContent).toContain('High raises text, border and focus-ring contrast. System follows your OS contrast setting.');
    expect(root.querySelector('[data-testid="system-note-contrast"]')).toBeNull();

    (group(root, 'Contrast') as HTMLElement).querySelectorAll('button')[1].click();
    fixture.detectChanges();
    expect(set).toHaveBeenCalledWith({ contrast: 'high' });
    expect(state()).toEqual({ Standard: 'false', High: 'true', 'System (follows OS)': 'false' });

    patch({ contrast: 'system' });
    resolvedContrast.set('high');
    fixture.detectChanges();
    expect(root.querySelector('[data-testid="system-note-contrast"]')?.textContent).toContain('Currently: High');
    resolvedContrast.set('standard');
    fixture.detectChanges();
    expect(root.querySelector('[data-testid="system-note-contrast"]')?.textContent).toContain('Currently: Standard');
  });

  it('renders a Motion row with a system chip and set({ motion })', () => {
    withAxes(MULTI);
    const root = create().nativeElement as HTMLElement;
    const buttons = Array.from((group(root, 'Motion') as HTMLElement).querySelectorAll('button'));
    expect(buttons.map((b) => b.textContent?.trim())).toEqual(['Allow', 'Reduce', 'System (follows OS)']);
    buttons[1].click();
    expect(set).toHaveBeenCalledWith({ motion: 'reduce' });
  });

  it('omits the Contrast row while the contrast axis has a single value', () => {
    withAxes({ ...MULTI, contrast: { attr: 'data-contrast', values: ['standard'], default: 'standard' } });
    expect(group(create().nativeElement as HTMLElement, 'Contrast')).toBeNull();
  });

  it('renders only the Theme row while accent and catset have a single value', () => {
    withAxes({
      theme: MULTI['theme'],
      accent: { attr: 'data-accent', values: ['cyan'], default: 'cyan' },
      catset: { attr: 'data-catset', values: ['vivid'], default: 'vivid' },
    });
    const root = create().nativeElement as HTMLElement;
    expect(root.querySelectorAll('[role="group"]')).toHaveLength(1);
    expect(group(root, 'Accent')).toBeNull();
    expect(group(root, 'Category palette')).toBeNull();
  });

  it('renders Accent and Category palette rows for multi-value axes, with the category help text', () => {
    withAxes(MULTI);
    const root = create().nativeElement as HTMLElement;
    const labelsOf = (g: HTMLElement) => Array.from(g.querySelectorAll('button')).map((b) => b.textContent?.trim());
    expect(labelsOf(group(root, 'Accent') as HTMLElement)).toEqual(['Cyan', 'Blue', 'Violet']);
    expect(labelsOf(group(root, 'Category palette') as HTMLElement)).toEqual(['Vivid', 'Soft', 'Cvd']);
    expect(root.textContent).toContain('Changes the 8 category colors; icons and labels always identify categories too.');
  });

  it('prefers an axis labels map over the capitalized value', () => {
    withAxes({ ...MULTI, catset: { ...MULTI['catset'], labels: { vivid: 'Vivid', soft: 'Soft', cvd: 'Color-blind safe' } } as AppearanceAxes[string] });
    const root = create().nativeElement as HTMLElement;
    expect(buttonWithText(root, 'Color-blind safe')).toBeTruthy();
  });

  it('clicking an accent or catset chip calls set with that partial and aria-pressed follows prefs', () => {
    withAxes(MULTI);
    const fixture = create();
    const root = fixture.nativeElement as HTMLElement;
    const state = (label: string) => Array.from((group(root, label) as HTMLElement).querySelectorAll('button')).map((b) => b.getAttribute('aria-pressed'));
    expect(state('Accent')).toEqual(['true', 'false', 'false']);

    buttonWithText(root, 'Violet').click();
    fixture.detectChanges();
    expect(set).toHaveBeenCalledWith({ accent: 'violet' });
    expect(state('Accent')).toEqual(['false', 'false', 'true']);

    buttonWithText(root, 'Soft').click();
    fixture.detectChanges();
    expect(set).toHaveBeenCalledWith({ catset: 'soft' });
    expect(state('Category palette')).toEqual(['false', 'true', 'false']);
    expect(buttonWithText(root, 'Soft').className).toContain('dude-chip-on');
  });

  it('renders a Status colors row for a multi-value semantic axis and sets { semantic }', () => {
    withAxes(MULTI);
    const fixture = create();
    const root = fixture.nativeElement as HTMLElement;
    const state = () => Object.fromEntries(Array.from((group(root, 'Status colors') as HTMLElement).querySelectorAll('button')).map((b) => [b.textContent?.trim(), b.getAttribute('aria-pressed')]));
    expect(state()).toEqual({ Standard: 'true', 'Color-blind safe': 'false' });
    expect(root.textContent).toContain('Color-blind safe swaps red/green status colors for a blue/orange scheme; status icons and labels are always shown too.');

    buttonWithText(root, 'Color-blind safe').click();
    fixture.detectChanges();
    expect(set).toHaveBeenCalledWith({ semantic: 'cvd' });
    expect(state()).toEqual({ Standard: 'false', 'Color-blind safe': 'true' });
  });

  it('omits the Status colors row while the semantic axis has a single value (or is absent)', () => {
    withAxes({ ...MULTI, semantic: { attr: 'data-semantic', values: ['standard'], default: 'standard' } });
    expect(group(create().nativeElement as HTMLElement, 'Status colors')).toBeNull();
  });

  it('renders a Density row with three chips and sets { density }', () => {
    withAxes(MULTI);
    const fixture = create();
    const root = fixture.nativeElement as HTMLElement;
    const labels = Array.from((group(root, 'Density') as HTMLElement).querySelectorAll('button')).map((b) => b.textContent?.trim());
    expect(labels).toEqual(['Compact', 'Comfortable', 'Ultra-compact']);
    expect(root.textContent).toContain('Compact is the default.');
    buttonWithText(root, 'Comfortable').click();
    expect(set).toHaveBeenCalledWith({ density: 'comfortable' });
  });

  it('renders a Code ligatures row and sets { ligatures }', () => {
    withAxes(MULTI);
    const fixture = create();
    const root = fixture.nativeElement as HTMLElement;
    expect(group(root, 'Code ligatures')).not.toBeNull();
    buttonWithText(root, 'Off').click();
    expect(set).toHaveBeenCalledWith({ ligatures: 'off' });
  });

  describe('font rows', () => {
    const select = (root: HTMLElement, key = 'uiFont') => root.querySelector('#font-select-' + key) as HTMLSelectElement;
    const customInput = (root: HTMLElement, key = 'uiFont') => root.querySelector('[data-testid="row-' + key + '"] input') as HTMLInputElement | null;

    function choose(fixture: ReturnType<typeof create>, value: string) {
      const el = select(fixture.nativeElement as HTMLElement);
      el.value = value;
      el.dispatchEvent(new Event('change'));
      fixture.detectChanges();
    }

    function type(fixture: ReturnType<typeof create>, value: string) {
      const input = customInput(fixture.nativeElement as HTMLElement) as HTMLInputElement;
      input.value = value;
      input.dispatchEvent(new Event('change'));
      fixture.detectChanges();
    }

    it('lists curated UI fonts plus Custom and sets the chosen id', () => {
      const fixture = create();
      const root = fixture.nativeElement as HTMLElement;
      const options = Array.from(select(root).options);
      expect(options.map((o) => o.textContent?.trim())).toEqual([...UI_FONTS.map((f) => f.label), 'Custom (installed font)…']);
      expect(options[options.length - 1].value).toBe('__custom');
      expect(customInput(root)).toBeNull();
      expect(root.textContent).toContain('DUDE bundles no web fonts.');

      const other = UI_FONTS[UI_FONTS.length - 1].id;
      choose(fixture, other);
      expect(set).toHaveBeenCalledWith({ uiFont: other });
    });

    it('Custom reveals the input without changing prefs, and a valid name is applied', () => {
      const fixture = create();
      const root = fixture.nativeElement as HTMLElement;
      choose(fixture, '__custom');
      expect(set).not.toHaveBeenCalled();
      expect(customInput(root)).not.toBeNull();
      type(fixture, ' Fira Sans ');
      expect(set).toHaveBeenCalledWith({ uiFont: { custom: 'Fira Sans' } });
      expect(root.querySelector('[role="alert"]')).toBeNull();
    });

    it('rejects an invalid custom name with an alert and does not store it', () => {
      const fixture = create();
      const root = fixture.nativeElement as HTMLElement;
      choose(fixture, '__custom');
      type(fixture, 'x;}body{color:red');
      expect(set).not.toHaveBeenCalled();
      expect(root.querySelector('[role="alert"]')?.textContent).toContain('Use letters, digits, spaces, dot, dash or underscore (max 64).');
    });

    it('shows Custom and the name when prefs already hold a custom font', () => {
      patch({ uiFont: { custom: 'Foo' } });
      const root = create().nativeElement as HTMLElement;
      expect(select(root).value).toBe('__custom');
      expect(customInput(root)?.value).toBe('Foo');
    });

    it('renders a mono font row too', () => {
      const root = create().nativeElement as HTMLElement;
      expect(Array.from(select(root, 'monoFont').options).map((o) => o.textContent?.trim())).toContain(MONO_FONTS[0].label);
    });
  });
});
