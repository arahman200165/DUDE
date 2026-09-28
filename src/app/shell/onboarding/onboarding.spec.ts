import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { OnboardingService } from '../../core/platform/onboarding.service';
import { DESKTOP_PREFERENCE_DEFAULTS, DesktopPreferencesService } from '../../core/platform/desktop-preferences.service';
import { ShellChromeService } from '../../core/platform/shell-chrome.service';
import { SecureLocalService } from '../../core/persistence/secure-local.service';
import { ToolRegistryService } from '../../core/registry/tool-registry.service';
import { Onboarding } from './onboarding';

@Component({ selector: 'app-fake-relay-section', template: '<label>Relay URL</label>' })
class FakeRelaySection {}

describe('Onboarding', () => {
  it('renders registry-contributed onboarding sections on the Tool settings step, not a hard-coded relay field', async () => {
    TestBed.configureTestingModule({
      providers: [
        { provide: OnboardingService, useValue: { visible: signal(true), step: signal(5), setStep: vi.fn(), skip: vi.fn(), complete: vi.fn() } },
        { provide: DesktopPreferencesService, useValue: { load: vi.fn().mockResolvedValue(undefined), set: vi.fn(), current: signal(DESKTOP_PREFERENCE_DEFAULTS), displays: signal([]) } },
        { provide: ShellChromeService, useValue: { getLaunchOnLogin: vi.fn().mockResolvedValue(false), listQuickActions: vi.fn().mockResolvedValue([]) } },
        { provide: SecureLocalService, useValue: { get: vi.fn().mockResolvedValue({ ok: true, value: null }) } },
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
    const fixture = TestBed.createComponent(Onboarding);
    await fixture.whenStable();
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent!;

    expect(text).toContain('Tool settings');
    expect(text).toContain('Fake Tool — Collaboration relay');
    expect(text).toContain('Relay URL');
    expect(text).not.toContain('Not in wizard');
  });
});
