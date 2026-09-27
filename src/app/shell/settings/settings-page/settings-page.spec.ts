import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { PlatformService } from '../../../core/platform/platform.service';
import { ToolRegistryService } from '../../../core/registry/tool-registry.service';
import { CORE_SETTINGS_SECTIONS } from '../settings-sections';
import { SettingsUnsavedChanges, settingsUnsavedChangesGuard } from '../settings-unsaved-changes';
import { SettingsPage, matchesSettingsFilter } from './settings-page';

@Component({ selector: 'app-fake-section', template: '<label data-setting>Relay URL</label><label data-setting>Other</label>' })
class FakeSection {}

describe('SettingsPage', () => {
  let desktop: boolean;

  beforeEach(() => {
    desktop = false;
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'settings/tools/:toolId', component: SettingsPage, canDeactivate: [settingsUnsavedChangesGuard] },
          { path: 'settings/:section', component: SettingsPage, canDeactivate: [settingsUnsavedChangesGuard] },
          { path: 'elsewhere', component: FakeSection },
        ]),
        { provide: PlatformService, useValue: { isDesktop: () => desktop } },
        {
          provide: ToolRegistryService,
          useValue: {
            settingsSections: () => [
              { toolId: 'fake-tool', toolTitle: 'Fake Tool', title: 'Collaboration relay', keywords: ['relay'], desktopOnly: false, load: async () => FakeSection },
            ],
          },
        },
      ],
    });
  });

  afterEach(() => vi.restoreAllMocks());

  function navText(root: HTMLElement): string[] {
    return Array.from(root.querySelectorAll('nav a')).map((link) => link.textContent!.replace(/\s+/g, ' ').trim());
  }

  it('lists every core section, then contributed sections under a Tools heading, with Desktop badges on web', async () => {
    const harness = await RouterTestingHarness.create('/settings/general');
    const root = harness.routeNativeElement!;

    const items = navText(root);
    expect(items.slice(0, CORE_SETTINGS_SECTIONS.length).map((text) => text.replace(/\s*Desktop$/, ''))).toEqual(CORE_SETTINGS_SECTIONS.map((s) => s.title));
    expect(items.at(-1)).toContain('Fake Tool');
    expect(root.textContent).toContain('Tools');
    expect(items.find((text) => text.startsWith('AI / LLM Provider'))).toContain('Desktop');
    expect(items.find((text) => text.startsWith('General'))).not.toContain('Desktop');
  });

  it('renders an explainer instead of the controls for a desktop-only section on web', async () => {
    const harness = await RouterTestingHarness.create('/settings/ai');
    expect(harness.routeNativeElement!.textContent).toContain('Available in the DUDE desktop app.');
    expect(harness.routeNativeElement!.querySelector('input[type="password"]')).toBeNull();
  });

  it('loads a contributed section and highlights rows matching the filter', async () => {
    const harness = await RouterTestingHarness.create('/settings/tools/fake-tool');
    await harness.fixture.whenStable();
    harness.detectChanges();
    const root = harness.routeNativeElement!;
    expect(root.textContent).toContain('Contributed by Fake Tool');

    const filter = root.querySelector('input[type="search"]') as HTMLInputElement;
    filter.value = 'relay';
    filter.dispatchEvent(new Event('input'));
    harness.detectChanges();

    const rows = Array.from(root.querySelectorAll('[data-setting]'));
    expect(rows[0].classList).toContain('ring-accent');
    expect(rows[1].classList).not.toContain('ring-accent');
    expect(navText(root)).toEqual([expect.stringContaining('Fake Tool')]);
  });

  it('falls back to General for an unknown section id', async () => {
    const harness = await RouterTestingHarness.create('/settings/not-a-section');
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/settings/general');
  });

  it('asks before leaving with unsaved changes, and stays when declined', async () => {
    const harness = await RouterTestingHarness.create('/settings/general');
    const router = TestBed.inject(Router);
    const unsaved = TestBed.inject(SettingsUnsavedChanges);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    unsaved.setDirty('ai', true);
    await harness.navigateByUrl('/settings/data');
    expect(router.url).toBe('/settings/general');

    confirmSpy.mockReturnValue(true);
    await harness.navigateByUrl('/elsewhere');
    expect(router.url).toBe('/elsewhere');
    expect(unsaved.hasUnsavedChanges()).toBe(false);
  });
});

describe('matchesSettingsFilter', () => {
  it('matches title, subtitle, and keywords case-insensitively; empty matches all', () => {
    const item = { title: 'Hotkeys', subtitle: undefined, keywords: ['Quick Launcher'] };
    expect(matchesSettingsFilter(item, '')).toBe(true);
    expect(matchesSettingsFilter(item, 'hot')).toBe(true);
    expect(matchesSettingsFilter(item, 'launcher')).toBe(true);
    expect(matchesSettingsFilter(item, 'relay')).toBe(false);
  });
});
