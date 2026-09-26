import { Component, inject, signal } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { PlatformService } from '../../core/platform/platform.service';
import { SecureLocalService } from '../../core/persistence/secure-local.service';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { WorkspaceLayoutService } from '../../core/workspace/workspace-layout.service';
import { ClearAllDataService } from '../../core/workspace/clear-all-data';
import { ShellChromeService } from '../../core/platform/shell-chrome.service';
import { SmartPasteHotkeyService } from '../../core/platform/smart-paste-hotkey.service';
import type { DesktopPreferences, QuickActionInfo } from '../../core/platform/electron-bridge';
import { DesktopPreferencesService } from '../../core/platform/desktop-preferences.service';
import { OnboardingService } from '../../core/platform/onboarding.service';

const TOOL_ID = 'settings';
const KEY_BASE_URL = 'llmBaseUrl';
const KEY_MODEL = 'llmModel';
const KEY_API_KEY = 'llmApiKey';
/** Synthetic key into the shared `hotkeyDrafts`/`hotkeyErrors` maps -- the Desktop Global Smart
 *  Paste Hotkey (DUDE_PRD.md §21 Phase 24 Item 3) is a sibling of, not one of, `quickActions()`'s
 *  clipboard-transform list (see electron/smart-paste-hotkey.ts), so it reuses the same draft/error
 *  UI shape under its own id rather than being folded into that array. */
const SMART_PASTE_HOTKEY_ID = 'smart-paste-hotkey';

type LoadStatus = 'loading' | 'idle';
type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

/**
 * Most of this tool is desktop-only: Stage 4's local LLM proxy (base URL + model + API key) and
 * Stage 5's desktop shell chrome (launch-on-login, clipboard quick-action hotkeys) self-gate their
 * UI behind `PlatformService.isDesktop()` — the registry stays platform-agnostic; individual tools
 * decide what to show. The "General" section (Milestone 294) is the one exception: it must render
 * on the web build too, since the Workspace's "reopen tabs on restart" preference and "clear all
 * local data" apply equally there — DUDE_PRD.md §4.9's web companion remains a first-class,
 * zero-install surface even though desktop is now the canonical product.
 *
 * The LLM fields go through `SecureLocalService`, not `PersistenceService`
 * — even though base URL/model aren't secret, keeping everything in the
 * one OS-keychain-backed store means the main process
 * (electron/llm-bridge.ts) can read the whole config with a single
 * mechanism it already has, with no separate "push config to main" IPC
 * call and no second on-disk store for the non-secret fields.
 */
@Component({
  selector: 'app-settings',
  imports: [ToolShell, ErrorPanel],
  templateUrl: './settings.html',
})
export class Settings {
  private readonly secureLocal = inject(SecureLocalService);
  private readonly shellChrome = inject(ShellChromeService);
  private readonly smartPasteHotkey = inject(SmartPasteHotkeyService);
  protected readonly desktopPrefs = inject(DesktopPreferencesService);
  protected readonly onboarding = inject(OnboardingService);
  protected readonly desktopMessage = signal('');
  private readonly persistence = inject(PersistenceService);
  private readonly clearAllData = inject(ClearAllDataService);
  protected readonly workspaceLayout = inject(WorkspaceLayoutService);
  protected readonly platform = inject(PlatformService);

  protected readonly clearAllStatus = signal<'idle' | 'cleared'>('idle');

  protected onReopenOnRestartToggle(event: Event): void {
    this.workspaceLayout.reopenOnRestart.set((event.target as HTMLInputElement).checked);
  }

  protected async onClearAllLocalData(): Promise<void> {
    if (!confirm('Clear all saved DUDE data from this browser? This cannot be undone.')) return;
    await this.clearAllData.clearAll();
    this.clearAllStatus.set('cleared');
  }

  protected readonly loadStatus = signal<LoadStatus>('loading');
  protected readonly baseUrl = signal('');
  protected readonly model = signal('');
  protected readonly apiKey = signal('');

  protected readonly saveStatus = signal<SaveStatus>('idle');
  protected readonly saveError = signal('');

  // Stage 5: desktop shell chrome.
  protected readonly launchOnLogin = signal(false);
  protected readonly launchOnLoginError = signal('');
  protected readonly quickActions = signal<readonly QuickActionInfo[]>([]);
  protected readonly hotkeyDrafts = signal<Record<string, string>>({});
  protected readonly hotkeyErrors = signal<Record<string, string>>({});

  // Stage 7: BYO relay for cross-network collab — a URL the user configures
  // to self-host, not a credential, so this is a plain `local` preference
  // rather than going through SecureLocalService like the LLM fields above.
  protected readonly relayUrl = this.persistence.signal('settings', 'relayUrl', 'local', '');

  constructor() {
    if (this.platform.isDesktop()) {
      void this.loadConfig();
      void this.loadShellChrome();
      void this.desktopPrefs.load();
    }
  }

  private async loadShellChrome(): Promise<void> {
    const [launchOnLogin, quickActions, smartPasteHotkey] = await Promise.all([
      this.shellChrome.getLaunchOnLogin(),
      this.shellChrome.listQuickActions(),
      this.smartPasteHotkey.getHotkey(),
    ]);
    this.launchOnLogin.set(launchOnLogin);
    this.quickActions.set(quickActions);
    this.hotkeyDrafts.set({
      ...Object.fromEntries(quickActions.map((a) => [a.id, a.hotkey ?? ''])),
      [SMART_PASTE_HOTKEY_ID]: smartPasteHotkey ?? '',
    });
  }

  protected async setDesktopPreference<K extends keyof DesktopPreferences>(key: K, value: DesktopPreferences[K]): Promise<void> {
    const result = await this.desktopPrefs.set({ [key]: value });
    this.desktopMessage.set(result.ok ? 'Saved.' : result.error);
  }

  protected displayChanged(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    void this.setDesktopPreference('preferredDisplayId', value === '' ? null : Number(value));
  }

  protected async checkDesktopUpdates(): Promise<void> {
    const result = await window.dude!.update.checkForUpdates();
    this.desktopMessage.set(result.ok ? 'Update check completed.' : result.error);
  }

  protected async toggleLaunchOnLogin(event: Event): Promise<void> {
    const enabled = (event.target as HTMLInputElement).checked;
    this.launchOnLoginError.set('');
    const result = await this.shellChrome.setLaunchOnLogin(enabled);
    if (!result.ok) {
      this.launchOnLoginError.set(result.error);
      return;
    }
    this.launchOnLogin.set(enabled);
  }

  protected onHotkeyDraftInput(actionId: string, event: Event): void {
    this.hotkeyDrafts.update((drafts) => ({ ...drafts, [actionId]: (event.target as HTMLInputElement).value }));
  }

  protected async saveHotkey(actionId: string): Promise<void> {
    const accelerator = this.hotkeyDrafts()[actionId]?.trim() || null;
    this.hotkeyErrors.update((errors) => ({ ...errors, [actionId]: '' }));

    const result = await this.shellChrome.setQuickActionHotkey(actionId, accelerator);
    if (!result.ok) {
      this.hotkeyErrors.update((errors) => ({
        ...errors,
        [actionId]: result.error === 'registration-failed' ? 'Could not register this hotkey — it may already be in use.' : result.error,
      }));
      return;
    }

    this.quickActions.set(await this.shellChrome.listQuickActions());
  }

  protected clearHotkey(actionId: string): void {
    this.hotkeyDrafts.update((drafts) => ({ ...drafts, [actionId]: '' }));
    void this.saveHotkey(actionId);
  }

  protected readonly smartPasteHotkeyId = SMART_PASTE_HOTKEY_ID;

  protected async saveSmartPasteHotkey(): Promise<void> {
    const accelerator = this.hotkeyDrafts()[SMART_PASTE_HOTKEY_ID]?.trim() || null;
    this.hotkeyErrors.update((errors) => ({ ...errors, [SMART_PASTE_HOTKEY_ID]: '' }));

    const result = await this.smartPasteHotkey.setHotkey(accelerator);
    if (!result.ok) {
      this.hotkeyErrors.update((errors) => ({
        ...errors,
        [SMART_PASTE_HOTKEY_ID]: result.error === 'registration-failed' ? 'Could not register this hotkey — it may already be in use.' : result.error,
      }));
      return;
    }

    this.hotkeyDrafts.update((drafts) => ({ ...drafts, [SMART_PASTE_HOTKEY_ID]: accelerator ?? '' }));
  }

  protected clearSmartPasteHotkey(): void {
    this.hotkeyDrafts.update((drafts) => ({ ...drafts, [SMART_PASTE_HOTKEY_ID]: '' }));
    void this.saveSmartPasteHotkey();
  }

  protected onRelayUrlInput(event: Event): void {
    this.relayUrl.set((event.target as HTMLInputElement).value);
  }

  private async loadConfig(): Promise<void> {
    const [baseUrl, model, apiKey] = await Promise.all([
      this.secureLocal.get(TOOL_ID, KEY_BASE_URL),
      this.secureLocal.get(TOOL_ID, KEY_MODEL),
      this.secureLocal.get(TOOL_ID, KEY_API_KEY),
    ]);
    if (baseUrl.ok && baseUrl.value) this.baseUrl.set(baseUrl.value);
    if (model.ok && model.value) this.model.set(model.value);
    if (apiKey.ok && apiKey.value) this.apiKey.set(apiKey.value);
    this.loadStatus.set('idle');
  }

  protected onBaseUrlChange(event: Event): void {
    this.baseUrl.set((event.target as HTMLInputElement).value);
  }

  protected onModelChange(event: Event): void {
    this.model.set((event.target as HTMLInputElement).value);
  }

  protected onApiKeyChange(event: Event): void {
    this.apiKey.set((event.target as HTMLInputElement).value);
  }

  protected async save(): Promise<void> {
    this.saveStatus.set('saving');
    this.saveError.set('');

    const results = await Promise.all([
      this.secureLocal.set(TOOL_ID, KEY_BASE_URL, this.baseUrl().trim()),
      this.secureLocal.set(TOOL_ID, KEY_MODEL, this.model().trim()),
      this.secureLocal.set(TOOL_ID, KEY_API_KEY, this.apiKey().trim()),
    ]);

    const failure = results.find((r) => !r.ok);
    if (failure && !failure.ok) {
      this.saveError.set(failure.error === 'encryption-unavailable' ? 'Secure storage is unavailable on this system.' : failure.error);
      this.saveStatus.set('error');
      return;
    }

    this.saveStatus.set('saved');
  }

  protected async clear(): Promise<void> {
    await Promise.all([
      this.secureLocal.remove(TOOL_ID, KEY_BASE_URL),
      this.secureLocal.remove(TOOL_ID, KEY_MODEL),
      this.secureLocal.remove(TOOL_ID, KEY_API_KEY),
    ]);
    this.baseUrl.set('');
    this.model.set('');
    this.apiKey.set('');
    this.saveStatus.set('idle');
    this.saveError.set('');
  }
}
