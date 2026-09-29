import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AppearanceAxes, DEFAULT_APPEARANCE } from '../../../core/appearance/appearance.model';
import { AppearanceService } from '../../../core/appearance/appearance.service';
import { TOOL_CATEGORIES } from '../../../shared/models/tool-category.model';
import { APPEARANCE_SETTINGS_AXES, AppearanceSettings } from './appearance-settings';

function buttonWithText(root: HTMLElement, text: string): HTMLButtonElement {
  return Array.from(root.querySelectorAll('button')).find((button) => button.textContent?.trim() === text) as HTMLButtonElement;
}

describe('AppearanceSettings', () => {
  let mode: ReturnType<typeof signal<string>>;
  let accent: ReturnType<typeof signal<string>>;
  let catset: ReturnType<typeof signal<string>>;
  let resolved: ReturnType<typeof signal<string>>;
  let set: ReturnType<typeof vi.fn>;
  let reset: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mode = signal('dark');
    accent = signal('cyan');
    catset = signal('vivid');
    resolved = signal('dark');
    set = vi.fn((partial: { mode?: string; accent?: string; catset?: string }) => {
      if (partial.mode) mode.set(partial.mode);
      if (partial.accent) accent.set(partial.accent);
      if (partial.catset) catset.set(partial.catset);
    });
    reset = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: AppearanceService,
          useValue: {
            prefs: computed(() => ({ ...DEFAULT_APPEARANCE, mode: mode(), accent: accent(), catset: catset() })),
            effective: computed(() => ({ theme: resolved() })),
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
    expect(root.querySelector('[data-testid="system-note"]')).toBeNull();

    mode.set('system');
    resolved.set('light');
    fixture.detectChanges();
    expect(root.querySelector('[data-testid="system-note"]')?.textContent).toContain('Currently: Light');
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
});
