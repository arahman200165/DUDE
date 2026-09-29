import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DEFAULT_APPEARANCE } from '../../../core/appearance/appearance.model';
import { AppearanceService } from '../../../core/appearance/appearance.service';
import { TOOL_CATEGORIES } from '../../../shared/models/tool-category.model';
import { AppearanceSettings } from './appearance-settings';

function buttonWithText(root: HTMLElement, text: string): HTMLButtonElement {
  return Array.from(root.querySelectorAll('button')).find((button) => button.textContent?.trim() === text) as HTMLButtonElement;
}

describe('AppearanceSettings', () => {
  let mode: ReturnType<typeof signal<string>>;
  let resolved: ReturnType<typeof signal<string>>;
  let set: ReturnType<typeof vi.fn>;
  let reset: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mode = signal('dark');
    resolved = signal('dark');
    set = vi.fn((partial: { mode?: string }) => {
      if (partial.mode) mode.set(partial.mode);
    });
    reset = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: AppearanceService,
          useValue: {
            prefs: computed(() => ({ ...DEFAULT_APPEARANCE, mode: mode() })),
            effective: computed(() => ({ theme: resolved() })),
            set,
            reset,
          },
        },
      ],
    });
  });

  afterEach(() => vi.restoreAllMocks());

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
});
