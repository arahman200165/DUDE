import { Component, signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { PlatformService } from '../../../core/platform/platform.service';
import { SecretsService } from '../../../core/persistence/secrets.service';
import { AiProviderConfigService } from '../../../core/persistence/ai-provider-config.service';
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
  let secureLocal: { status: ReturnType<typeof vi.fn>; set: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn> };
  let aiConfig: { get: ReturnType<typeof vi.fn>; set: ReturnType<typeof vi.fn> };
  const keyStatus = (isSet: boolean, hint: string | null = null, needsReentry = false) => ({ purpose: 'ai.llmApiKey', isSet, hint, needsReentry });
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
      status: vi.fn().mockResolvedValue(keyStatus(false)),
      set: vi.fn().mockResolvedValue({ ok: true }),
      remove: vi.fn().mockResolvedValue({ ok: true }),
    };
    aiConfig = { get: vi.fn().mockResolvedValue({ baseUrl: '', model: '', apiKey: keyStatus(false) }), set: vi.fn().mockResolvedValue({ ok: true }) };
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
        provideRouter([]),
        { provide: PlatformService, useValue: { isDesktop: () => desktop } },
        { provide: SecretsService, useValue: secureLocal },
        { provide: AiProviderConfigService, useValue: aiConfig },
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
    it('saves trimmed base URL and model through the config service and the key as a secret', async () => {
      const fixture = TestBed.createComponent(AiProviderSettings);
      await fixture.whenStable();
      const component = fixture.componentInstance as any;
      component['baseUrl'].set(' https://proxy.example/v1 ');
      component['model'].set(' model-x ');
      component['apiKey'].set(' secret ');

      await component.save();

      expect(aiConfig.set).toHaveBeenCalledWith({ baseUrl: 'https://proxy.example/v1', model: 'model-x' });
      expect(secureLocal.set.mock.calls).toEqual([['ai.llmApiKey', 'secret']]);
      expect(component['saveStatus']()).toBe('saved');
      expect(component['apiKey']()).toBe('');

      await component.clear();
      expect(aiConfig.set).toHaveBeenLastCalledWith({ baseUrl: '', model: '' });
      expect(secureLocal.remove.mock.calls).toEqual([['ai.llmApiKey']]);
      expect([component['baseUrl'](), component['model'](), component['apiKey']()]).toEqual(['', '', '']);
      fixture.destroy();
    });

    it('does not touch the stored key when none was typed', async () => {
      const fixture = TestBed.createComponent(AiProviderSettings);
      await fixture.whenStable();
      const component = fixture.componentInstance as any;
      component['model'].set('only-model');
      await component.save();
      expect(secureLocal.set).not.toHaveBeenCalled();
      fixture.destroy();
    });

    it('shows a saved key as a masked hint only; Replace reveals an empty input and Remove confirms first', async () => {
      aiConfig.get.mockResolvedValue({ baseUrl: 'https://x/v1', model: 'm', apiKey: keyStatus(true, '••••abcd') });
      const fixture = TestBed.createComponent(AiProviderSettings);
      await fixture.whenStable();
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('[data-testid="key-saved"]')!.textContent).toContain('Saved (••••abcd)');
      expect(el.querySelector('input[type="password"]')).toBeNull();

      buttonWithText(el, 'Replace').click();
      fixture.detectChanges();
      expect((el.querySelector('input[type="password"]') as HTMLInputElement).value).toBe('');

      buttonWithText(el, 'Cancel').click();
      fixture.detectChanges();
      buttonWithText(el, 'Remove').click();
      fixture.detectChanges();
      expect(secureLocal.remove).not.toHaveBeenCalled();
      secureLocal.status.mockResolvedValue(keyStatus(false));
      buttonWithText(el, 'Remove key').click();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(secureLocal.remove).toHaveBeenCalledWith('ai.llmApiKey');
      expect(el.querySelector('[data-testid="key-saved"]')).toBeNull();
      fixture.destroy();
    });

    it('asks the user to re-enter a key that needs re-entry', async () => {
      aiConfig.get.mockResolvedValue({ baseUrl: 'https://x/v1', model: 'm', apiKey: keyStatus(true, null, true) });
      const fixture = TestBed.createComponent(AiProviderSettings);
      await fixture.whenStable();
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('[data-testid="key-reentry"]')!.textContent).toContain('Re-enter your API key');
      expect(el.querySelector('input[type="password"]')).not.toBeNull();
      fixture.destroy();
    });

    it('surfaces an invalid base URL from main', async () => {
      aiConfig.set.mockResolvedValue({ ok: false, error: 'invalid-config' });
      const fixture = TestBed.createComponent(AiProviderSettings);
      await fixture.whenStable();
      const component = fixture.componentInstance as any;
      await component.save();
      expect(component['saveStatus']()).toBe('error');
      expect(component['saveError']()).toContain('http(s)');
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
    it('points to This Device instead of clearing data itself', () => {
      desktop = false;
      const fixture = TestBed.createComponent(DataPrivacySettings);
      fixture.detectChanges();
      const link = fixture.nativeElement.querySelector('a[href="/settings/device"]') as HTMLAnchorElement;
      expect(link).not.toBeNull();
      expect(buttonWithText(fixture.nativeElement, 'Clear all local data')).toBeUndefined();
      expect(clearAll).not.toHaveBeenCalled();
    });
  });
});
