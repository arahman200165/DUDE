import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import fc from 'fast-check';
import { Settings } from './settings';
import { PlatformService } from '../../core/platform/platform.service';
import { SecureLocalService } from '../../core/persistence/secure-local.service';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { WorkspaceLayoutService } from '../../core/workspace/workspace-layout.service';
import { ClearAllDataService } from '../../core/workspace/clear-all-data';
import { ShellChromeService } from '../../core/platform/shell-chrome.service';
import { DesktopPreferencesService } from '../../core/platform/desktop-preferences.service';
import { OnboardingService } from '../../core/platform/onboarding.service';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';

@Component({ selector: 'app-tool-shell', standalone: true, template: '<ng-content />' })
class ToolShellStub {}

@Component({ selector: 'app-error-panel', standalone: true, template: '' })
class ErrorPanelStub {}

describe('Settings integration', () => {
  let desktop: boolean;
  let secureLocal: { get: ReturnType<typeof vi.fn>; set: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn> };
  let clearAll: ReturnType<typeof vi.fn>;
  let reopenOnRestart: ReturnType<typeof signal<boolean>>;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    desktop = false;
    reopenOnRestart = signal(true);
    secureLocal = {
      get: vi.fn().mockResolvedValue({ ok: true, value: null }),
      set: vi.fn().mockResolvedValue({ ok: true }),
      remove: vi.fn().mockResolvedValue({ ok: true }),
    };
    clearAll = vi.fn().mockResolvedValue(undefined);

    TestBed.configureTestingModule({
      providers: [
        { provide: PlatformService, useValue: { isDesktop: () => desktop } },
        { provide: SecureLocalService, useValue: secureLocal },
        { provide: PersistenceService, useValue: { signal: () => signal('') } },
        { provide: WorkspaceLayoutService, useValue: { reopenOnRestart } },
        { provide: ClearAllDataService, useValue: { clearAll } },
        { provide: ShellChromeService, useValue: { getLaunchOnLogin: vi.fn().mockResolvedValue(false), listQuickActions: vi.fn().mockResolvedValue([]) } },
        { provide: DesktopPreferencesService, useValue: { load: vi.fn().mockResolvedValue(undefined), current: signal({}), displays: signal([]) } },
        { provide: OnboardingService, useValue: { open: vi.fn() } },
      ],
    }).overrideComponent(Settings, {
      remove: { imports: [ToolShell, ErrorPanel] },
      add: { imports: [ToolShellStub, ErrorPanelStub] },
    });
  });

  it('persists trimmed desktop provider fields and clears each secure-local entry', async () => {
    desktop = true;
    const fixture = TestBed.createComponent(Settings);
    await fixture.whenStable();
    const component = fixture.componentInstance as any;
    component['baseUrl'].set(' https://proxy.example/v1 ');
    component['model'].set(' model-x ');
    component['apiKey'].set(' secret ');

    await component['save']();

    expect(secureLocal.set.mock.calls).toEqual([
      ['settings', 'llmBaseUrl', 'https://proxy.example/v1'],
      ['settings', 'llmModel', 'model-x'],
      ['settings', 'llmApiKey', 'secret'],
    ]);
    expect(component['saveStatus']()).toBe('saved');

    await component['clear']();
    expect(secureLocal.remove.mock.calls).toEqual([
      ['settings', 'llmBaseUrl'],
      ['settings', 'llmModel'],
      ['settings', 'llmApiKey'],
    ]);
    expect([component['baseUrl'](), component['model'](), component['apiKey']()]).toEqual(['', '', '']);
    fixture.destroy();
  });

  it('saves generated desktop field values after trimming, then clears all three keys', async () => {
    desktop = true;
    const fixture = TestBed.createComponent(Settings);
    await fixture.whenStable();
    const component = fixture.componentInstance as any;

    await fc.assert(
      fc.asyncProperty(
        fc.tuple(fc.string(), fc.string(), fc.string()),
        async ([url, model, key]) => {
          secureLocal.set.mockClear();
          secureLocal.remove.mockClear();
          component['baseUrl'].set(` ${url} `);
          component['model'].set(` ${model} `);
          component['apiKey'].set(` ${key} `);
          await component['save']();
          expect(secureLocal.set.mock.calls).toEqual([
            ['settings', 'llmBaseUrl', url.trim()],
            ['settings', 'llmModel', model.trim()],
            ['settings', 'llmApiKey', key.trim()],
          ]);
          await component['clear']();
          expect(secureLocal.remove.mock.calls.map((call: unknown[]) => call[1])).toEqual(['llmBaseUrl', 'llmModel', 'llmApiKey']);
        },
      ),
      { numRuns: 50 },
    );
    fixture.destroy();
  });

  it('persists the web reopen toggle and asks before clearing local data', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm');
    const fixture = TestBed.createComponent(Settings);
    fixture.detectChanges();
    const checkbox = fixture.nativeElement.querySelector('input[type="checkbox"]') as HTMLInputElement;
    checkbox.checked = false;
    checkbox.dispatchEvent(new Event('change'));
    expect(reopenOnRestart()).toBe(false);

    confirmSpy.mockReturnValue(false);
    const button = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button') as NodeListOf<HTMLButtonElement>).find((item) => item.textContent?.includes('Clear all local data'))!;
    button.click();
    await fixture.whenStable();
    expect(clearAll).not.toHaveBeenCalled();

    confirmSpy.mockReturnValue(true);
    button.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(clearAll).toHaveBeenCalledTimes(1);
    expect(fixture.nativeElement.textContent).toContain('Cleared.');
    confirmSpy.mockRestore();
    fixture.destroy();
  });
});
