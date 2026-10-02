import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import fc from 'fast-check';
import { PlatformService } from '../../../core/platform/platform.service';
import { SecureLocalService } from '../../../core/persistence/secure-local.service';
import { WorkspaceLayoutService } from '../../../core/workspace/workspace-layout.service';
import { ClearAllDataService } from '../../../core/workspace/clear-all-data';
import { ShellChromeService } from '../../../core/platform/shell-chrome.service';
import { SmartPasteHotkeyService } from '../../../core/platform/smart-paste-hotkey.service';
import { QuickLauncherService } from '../../../core/platform/quick-launcher.service';
import { DESKTOP_PREFERENCE_DEFAULTS, DesktopPreferencesService } from '../../../core/platform/desktop-preferences.service';
import { OnboardingService } from '../../../core/platform/onboarding.service';
import { NativeRecentsService } from '../../../core/native-recents/native-recents.service';
import { NativeRecentEntry } from "@dude/domain/core/native-recents/native-recent.model";
import { ErrorPanel } from '../../../shared/components/error-panel/error-panel';
import { SettingsUnsavedChanges } from '../settings-unsaved-changes';
import { AiProviderSettings } from './ai-provider-settings';
import { HotkeysSettings, QUICK_LAUNCHER_HOTKEY_ID, SMART_PASTE_HOTKEY_ID } from './hotkeys-settings';
import { FilesSettings } from './files-settings';
import { GeneralSettings } from './general-settings';
import { DataPrivacySettings } from './data-privacy-settings';
import { WindowUpdatesSettings } from './window-updates-settings';

@Component({ selector: 'app-error-panel', standalone: true, template: '' })
class ErrorPanelStub {}

function buttonWithText(root: HTMLElement, text: string): HTMLButtonElement {
  return Array.from(root.querySelectorAll('button')).find((button) => button.textContent?.trim() === text) as HTMLButtonElement;
}

describe('Settings sections', () => {
  let desktop: boolean;
  let secureLocal: { get: ReturnType<typeof vi.fn>; set: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn> };
  let clearAll: ReturnType<typeof vi.fn>;
  let reopenOnRestart: ReturnType<typeof signal<boolean>>;
  let desktopPrefsSet: ReturnType<typeof vi.fn>;
  let shellChrome: Record<string, ReturnType<typeof vi.fn>>;
  let nativeRecentsEnabled: ReturnType<typeof signal<boolean>>;
  let nativeRecentEntries: ReturnType<typeof signal<readonly NativeRecentEntry[]>>;
  let nativeRecentsRemove: ReturnType<typeof vi.fn>;
  let nativeRecentsClearAll: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    desktop = true;
    reopenOnRestart = signal(true);
    nativeRecentsEnabled = signal(true);
    nativeRecentEntries = signal([]);
    nativeRecentsRemove = vi.fn();
    nativeRecentsClearAll = vi.fn();
    desktopPrefsSet = vi.fn().mockResolvedValue({ ok: true });
    secureLocal = {
      get: vi.fn().mockResolvedValue({ ok: true, value: null }),
      set: vi.fn().mockResolvedValue({ ok: true }),
      remove: vi.fn().mockResolvedValue({ ok: true }),
    };
    clearAll = vi.fn().mockResolvedValue(undefined);
    shellChrome = {
      getLaunchOnLogin: vi.fn().mockResolvedValue(false),
      setLaunchOnLogin: vi.fn().mockResolvedValue({ ok: true }),
      listQuickActions: vi.fn().mockResolvedValue([{ id: 'base64-encode', label: 'Base64 encode clipboard', hotkey: 'Ctrl+Alt+B' }]),
      setQuickActionHotkey: vi.fn().mockResolvedValue({ ok: true }),
      getFileAssociations: vi.fn().mockResolvedValue({ candidateExtensions: ['.json'] }),
      openDefaultApps: vi.fn().mockResolvedValue({ ok: true }),
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: PlatformService, useValue: { isDesktop: () => desktop } },
        { provide: SecureLocalService, useValue: secureLocal },
        { provide: WorkspaceLayoutService, useValue: { reopenOnRestart } },
        { provide: ClearAllDataService, useValue: { clearAll } },
        { provide: ShellChromeService, useValue: shellChrome },
        { provide: SmartPasteHotkeyService, useValue: { getHotkey: vi.fn().mockResolvedValue(null), setHotkey: vi.fn().mockResolvedValue({ ok: true }) } },
        { provide: QuickLauncherService, useValue: { getHotkey: vi.fn().mockResolvedValue(null), setHotkey: vi.fn().mockResolvedValue({ ok: true }) } },
        {
          provide: DesktopPreferencesService,
          useValue: { load: vi.fn().mockResolvedValue(undefined), set: desktopPrefsSet, current: signal(DESKTOP_PREFERENCE_DEFAULTS), displays: signal([]) },
        },
        { provide: OnboardingService, useValue: { open: vi.fn() } },
        { provide: NativeRecentsService, useValue: { enabled: nativeRecentsEnabled, entries: nativeRecentEntries, remove: nativeRecentsRemove, clearAll: nativeRecentsClearAll } },
      ],
    });
    for (const component of [AiProviderSettings, HotkeysSettings, WindowUpdatesSettings]) {
      TestBed.overrideComponent(component, { remove: { imports: [ErrorPanel] }, add: { imports: [ErrorPanelStub] } });
    }
  });

  afterEach(() => vi.restoreAllMocks());

  describe('AI / LLM Provider', () => {
    it('persists trimmed provider fields under the app settings namespace and clears each secure-local entry', async () => {
      const fixture = TestBed.createComponent(AiProviderSettings);
      await fixture.whenStable();
      const component = fixture.componentInstance as any;
      component['baseUrl'].set(' https://proxy.example/v1 ');
      component['model'].set(' model-x ');
      component['apiKey'].set(' secret ');

      await component.save();

      expect(secureLocal.set.mock.calls).toEqual([
        ['settings', 'llmBaseUrl', 'https://proxy.example/v1'],
        ['settings', 'llmModel', 'model-x'],
        ['settings', 'llmApiKey', 'secret'],
      ]);
      expect(component['saveStatus']()).toBe('saved');

      await component.clear();
      expect(secureLocal.remove.mock.calls).toEqual([
        ['settings', 'llmBaseUrl'],
        ['settings', 'llmModel'],
        ['settings', 'llmApiKey'],
      ]);
      expect([component['baseUrl'](), component['model'](), component['apiKey']()]).toEqual(['', '', '']);
      fixture.destroy();
    });

    it('saves generated field values after trimming, then clears all three keys', async () => {
      const fixture = TestBed.createComponent(AiProviderSettings);
      await fixture.whenStable();
      const component = fixture.componentInstance as any;

      await fc.assert(
        fc.asyncProperty(fc.tuple(fc.string(), fc.string(), fc.string()), async ([url, model, key]) => {
          secureLocal.set.mockClear();
          secureLocal.remove.mockClear();
          component['baseUrl'].set(` ${url} `);
          component['model'].set(` ${model} `);
          component['apiKey'].set(` ${key} `);
          await component.save();
          expect(secureLocal.set.mock.calls).toEqual([
            ['settings', 'llmBaseUrl', url.trim()],
            ['settings', 'llmModel', model.trim()],
            ['settings', 'llmApiKey', key.trim()],
          ]);
          await component.clear();
          expect(secureLocal.remove.mock.calls.map((call: unknown[]) => call[1])).toEqual(['llmBaseUrl', 'llmModel', 'llmApiKey']);
        }),
        { numRuns: 50 },
      );
      fixture.destroy();
    });

    it('reports unsaved drafts to the Settings unsaved-changes tracker until saved', async () => {
      const fixture = TestBed.createComponent(AiProviderSettings);
      await fixture.whenStable();
      const unsaved = TestBed.inject(SettingsUnsavedChanges);
      const component = fixture.componentInstance as any;

      component['model'].set('draft-model');
      fixture.detectChanges();
      expect(component.hasUnsavedChanges()).toBe(true);
      expect(unsaved.hasUnsavedChanges()).toBe(true);

      await component.save();
      fixture.detectChanges();
      expect(unsaved.hasUnsavedChanges()).toBe(false);

      component['model'].set('another');
      fixture.detectChanges();
      fixture.destroy();
      expect(unsaved.hasUnsavedChanges()).toBe(false);
    });
  });

  describe('Hotkeys', () => {
    it('saves and clears the Quick Launcher hotkey', async () => {
      const fixture = TestBed.createComponent(HotkeysSettings);
      await fixture.whenStable();
      const component = fixture.componentInstance as any;
      const quickLauncher = TestBed.inject(QuickLauncherService);

      component['drafts'].update((drafts: Record<string, string>) => ({ ...drafts, [QUICK_LAUNCHER_HOTKEY_ID]: ' Control+Alt+Space ' }));
      await component.save(QUICK_LAUNCHER_HOTKEY_ID);
      expect(quickLauncher.setHotkey).toHaveBeenCalledWith('Control+Alt+Space');

      await component.clear(QUICK_LAUNCHER_HOTKEY_ID);
      expect(quickLauncher.setHotkey).toHaveBeenLastCalledWith(null);
      fixture.destroy();
    });

    it('routes each row to its own registrar and surfaces registration failures', async () => {
      const smartPaste = TestBed.inject(SmartPasteHotkeyService);
      (smartPaste.setHotkey as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, error: 'registration-failed' });
      const fixture = TestBed.createComponent(HotkeysSettings);
      await fixture.whenStable();
      const component = fixture.componentInstance as any;

      component['drafts'].update((drafts: Record<string, string>) => ({ ...drafts, [SMART_PASTE_HOTKEY_ID]: 'Ctrl+Alt+V', 'base64-encode': 'Ctrl+Alt+E' }));
      expect(component.hasUnsavedChanges()).toBe(true);

      expect(await component.save(SMART_PASTE_HOTKEY_ID)).toBe(false);
      expect(component['errors']()[SMART_PASTE_HOTKEY_ID]).toContain('already be in use');

      expect(await component.save('base64-encode')).toBe(true);
      expect(shellChrome['setQuickActionHotkey']).toHaveBeenCalledWith('base64-encode', 'Ctrl+Alt+E');
      fixture.destroy();
    });

    it('Reset to defaults unbinds every hotkey after confirming', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      const fixture = TestBed.createComponent(HotkeysSettings);
      await fixture.whenStable();
      fixture.detectChanges();

      buttonWithText(fixture.nativeElement, 'Reset to defaults').click();
      await fixture.whenStable();

      expect(shellChrome['setQuickActionHotkey']).toHaveBeenCalledWith('base64-encode', null);
      expect(TestBed.inject(SmartPasteHotkeyService).setHotkey).toHaveBeenCalledWith(null);
      expect(TestBed.inject(QuickLauncherService).setHotkey).toHaveBeenCalledWith(null);
      fixture.destroy();
    });
  });

  describe('Files', () => {
    it('labels registered file types as candidates and opens Windows Settings', async () => {
      const fixture = TestBed.createComponent(FilesSettings);
      await fixture.whenStable();
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('registered by the installer as candidates');
      expect(fixture.nativeElement.textContent).toContain('.json');

      buttonWithText(fixture.nativeElement, 'Change in Windows Settings').click();
      await fixture.whenStable();
      expect(shellChrome['openDefaultApps']).toHaveBeenCalledOnce();
      fixture.destroy();
    });

    it('manages the native file recent list: toggling, removing one, and clearing all', async () => {
      nativeRecentEntries.set([{ path: 'C:/notes.md', name: 'notes.md', extension: '.md', openedAt: '2026-01-01T00:00:00.000Z' }]);
      const fixture = TestBed.createComponent(FilesSettings);
      await fixture.whenStable();
      fixture.detectChanges();
      const root = fixture.nativeElement as HTMLElement;
      expect(root.textContent).toContain('notes.md');

      const toggleLabel = Array.from(root.querySelectorAll('label')).find((label) => label.textContent?.includes('Remember recently opened native files'))!;
      const toggle = toggleLabel.querySelector('input[type="checkbox"]') as HTMLInputElement;
      toggle.checked = false;
      toggle.dispatchEvent(new Event('change'));
      expect(nativeRecentsEnabled()).toBe(false);

      buttonWithText(root, 'Remove').click();
      expect(nativeRecentsRemove).toHaveBeenCalledWith('C:/notes.md');

      buttonWithText(root, 'Clear all').click();
      expect(nativeRecentsClearAll).toHaveBeenCalledOnce();
      fixture.destroy();
    });
  });

  describe('General', () => {
    it('persists the reopen toggle on the web build and hides desktop-only controls', () => {
      desktop = false;
      const fixture = TestBed.createComponent(GeneralSettings);
      fixture.detectChanges();
      const root = fixture.nativeElement as HTMLElement;

      const checkbox = root.querySelector('input[type="checkbox"]') as HTMLInputElement;
      checkbox.checked = false;
      checkbox.dispatchEvent(new Event('change'));
      expect(reopenOnRestart()).toBe(false);
      expect(root.textContent).not.toContain('Startup destination');
      expect(root.textContent).not.toContain('Run setup wizard again');
    });

    it('Reset to defaults restores reopen-on-restart and the startup destination after confirming', async () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
      reopenOnRestart.set(false);
      const fixture = TestBed.createComponent(GeneralSettings);
      fixture.detectChanges();

      buttonWithText(fixture.nativeElement, 'Reset to defaults').click();
      await fixture.whenStable();
      expect(reopenOnRestart()).toBe(false);
      expect(desktopPrefsSet).not.toHaveBeenCalled();

      confirmSpy.mockReturnValue(true);
      buttonWithText(fixture.nativeElement, 'Reset to defaults').click();
      await fixture.whenStable();
      expect(reopenOnRestart()).toBe(true);
      expect(desktopPrefsSet).toHaveBeenCalledWith({ startupDestination: DESKTOP_PREFERENCE_DEFAULTS.startupDestination });
    });
  });

  describe('Window & Updates', () => {
    it('Reset to defaults restores every desktop preference except the General-owned startup destination', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      const fixture = TestBed.createComponent(WindowUpdatesSettings);
      await fixture.whenStable();
      fixture.detectChanges();

      buttonWithText(fixture.nativeElement, 'Reset to defaults').click();
      await fixture.whenStable();

      const patch = desktopPrefsSet.mock.calls[0][0];
      expect(patch).not.toHaveProperty('startupDestination');
      expect(patch).toMatchObject({ closeToTray: true, launchMinimized: false, updateMode: 'auto-download' });
    });
  });

  describe('Data & Privacy', () => {
    it('asks before clearing local data', async () => {
      desktop = false;
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
      const fixture = TestBed.createComponent(DataPrivacySettings);
      fixture.detectChanges();
      const button = buttonWithText(fixture.nativeElement, 'Clear all local data');

      button.click();
      await fixture.whenStable();
      expect(clearAll).not.toHaveBeenCalled();

      confirmSpy.mockReturnValue(true);
      button.click();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(clearAll).toHaveBeenCalledTimes(1);
      expect(fixture.nativeElement.textContent).toContain('Cleared.');
    });
  });
});
