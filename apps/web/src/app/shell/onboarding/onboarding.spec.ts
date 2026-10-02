import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { OnboardingService } from '../../core/platform/onboarding.service';
import { DESKTOP_PREFERENCE_DEFAULTS, DesktopPreferencesService } from '../../core/platform/desktop-preferences.service';
import { ShellChromeService } from '../../core/platform/shell-chrome.service';
import { SecureLocalService } from '../../core/persistence/secure-local.service';
import { ToolRegistryService } from '../../core/registry/tool-registry.service';
import { AppearanceService } from '../../core/appearance/appearance.service';
import { Onboarding } from './onboarding';

@Component({ selector: 'app-fake-relay-section', template: '<label>Relay URL</label>' })
class FakeRelaySection {}

function setup(step: number, opts: { hotkeys?: unknown[]; prefs?: Record<string, string>; effective?: Record<string, string> } = {}) {
  const flow = { visible: signal(true), step: signal(step), setStep: vi.fn(), skip: vi.fn(), complete: vi.fn() };
  const appearance = {
    prefs: signal({ mode: 'dark', density: 'compact', contrast: 'standard', ...opts.prefs }),
    effective: signal({ theme: 'dark', contrast: 'standard', ...opts.effective }),
    set: vi.fn(),
  };
  const shell = {
    getLaunchOnLogin: vi.fn().mockResolvedValue(false),
    listQuickActions: vi.fn().mockResolvedValue(opts.hotkeys ?? []),
    setQuickActionHotkey: vi.fn().mockResolvedValue({ ok: true }),
  };
  const secure = { get: vi.fn().mockResolvedValue({ ok: true, value: null }), set: vi.fn().mockResolvedValue({ ok: true }) };
  TestBed.configureTestingModule({
    providers: [
      { provide: OnboardingService, useValue: flow },
      { provide: AppearanceService, useValue: appearance },
      { provide: DesktopPreferencesService, useValue: { load: vi.fn().mockResolvedValue(undefined), set: vi.fn(), current: signal(DESKTOP_PREFERENCE_DEFAULTS), displays: signal([]) } },
      { provide: ShellChromeService, useValue: shell },
      { provide: SecureLocalService, useValue: secure },
      {
        provide: ToolRegistryService,
        useValue: {
          // WorkspaceLayoutService prunes a saved layout through getById; specs share localStorage.
          getById: () => undefined,
          settingsSections: () => [
            { toolId: 'fake-tool', toolTitle: 'Fake Tool', title: 'Collaboration relay', onboarding: true, load: async () => FakeRelaySection },
            { toolId: 'quiet-tool', toolTitle: 'Quiet Tool', title: 'Not in wizard', load: async () => FakeRelaySection },
          ],
        },
      },
    ],
  });
  return { flow, appearance, shell, secure };
}

async function render(): Promise<{ el: HTMLElement; fixture: ReturnType<typeof TestBed.createComponent<Onboarding>> }> {
  const fixture = TestBed.createComponent(Onboarding);
  await fixture.whenStable();
  fixture.detectChanges();
  return { el: fixture.nativeElement as HTMLElement, fixture };
}

const button = (el: HTMLElement, label: string): HTMLButtonElement =>
  Array.from(el.querySelectorAll('button')).find((b) => b.textContent!.trim() === label)!;

describe('Onboarding', () => {
  it('renders registry-contributed onboarding sections on the Tool settings step, not a hard-coded relay field', async () => {
    setup(6);
    const text = (await render()).el.textContent!;

    expect(text).toContain('Tool settings');
    expect(text).toContain('Fake Tool — Collaboration relay');
    expect(text).toContain('Relay URL');
    expect(text).not.toContain('Not in wizard');
  });

  it('places Appearance right after Welcome', async () => {
    setup(1);
    const { el } = await render();
    expect(el.querySelector('h1')!.textContent).toContain('Appearance');
    expect(el.textContent).toContain('2. Appearance');
    expect(el.textContent).toContain('Step 2 of 8');
  });

  it('clamps an out-of-range step to the last page', async () => {
    setup(99);
    const { el } = await render();
    expect(el.querySelector('h1')!.textContent).toContain('Review');
  });

  it('Next on the hotkeys page saves changed hotkeys before advancing', async () => {
    const { flow, shell } = setup(4, { hotkeys: [{ id: 'a', label: 'A', hotkey: null }] });
    const { el, fixture } = await render();
    const input = el.querySelector('input')!;
    input.value = 'Ctrl+Alt+B';
    input.dispatchEvent(new Event('input'));
    button(el, 'Next').click();
    await fixture.whenStable();
    expect(shell.setQuickActionHotkey).toHaveBeenCalledWith('a', 'Ctrl+Alt+B');
    expect(flow.setStep).toHaveBeenCalledWith(5);
  });

  it('Next on the AI page saves the AI configuration before advancing', async () => {
    const { flow, secure } = setup(5);
    const { el, fixture } = await render();
    button(el, 'Next').click();
    await fixture.whenStable();
    expect(secure.set).toHaveBeenCalledTimes(3);
    expect(flow.setStep).toHaveBeenCalledWith(6);
  });

  it('Finish on the review page completes the wizard', async () => {
    const { flow } = setup(7);
    const { el, fixture } = await render();
    button(el, 'Finish').click();
    await fixture.whenStable();
    expect(flow.complete).toHaveBeenCalled();
  });

  describe('Appearance page', () => {
    it('renders theme, density and contrast rows', async () => {
      setup(1);
      const { el } = await render();
      for (const key of ['mode', 'density', 'contrast']) expect(el.querySelector(`[data-testid="row-${key}"]`), key).not.toBeNull();
      expect(el.textContent).toContain('Settings › Appearance');
    });

    it('clicking Light sets the mode immediately', async () => {
      const { appearance } = setup(1);
      const { el } = await render();
      button(el, 'Light').click();
      expect(appearance.set).toHaveBeenCalledWith({ mode: 'light' });
    });

    it('clicking Comfortable sets the density immediately', async () => {
      const { appearance } = setup(1);
      const { el } = await render();
      button(el, 'Comfortable').click();
      expect(appearance.set).toHaveBeenCalledWith({ density: 'comfortable' });
    });

    it('shows the resolved value under a row set to system', async () => {
      setup(1, { prefs: { mode: 'system' }, effective: { theme: 'light' } });
      const { el } = await render();
      expect(el.querySelector('[data-testid="system-note-mode"]')!.textContent).toContain('Currently: Light');
    });
  });
});
