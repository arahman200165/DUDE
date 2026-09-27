import { Component, inject, signal } from '@angular/core';
import { DesktopPreferencesService } from '../../core/platform/desktop-preferences.service';
import { OnboardingService } from '../../core/platform/onboarding.service';
import { ShellChromeService } from '../../core/platform/shell-chrome.service';
import { SecureLocalService } from '../../core/persistence/secure-local.service';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { APP_SETTINGS_NAMESPACE, LLM_API_KEY_KEY, LLM_BASE_URL_KEY, LLM_MODEL_KEY } from '../../core/persistence/app-settings';
import { WorkspaceLayoutService } from '../../core/workspace/workspace-layout.service';
import type { DesktopPreferences, QuickActionInfo } from '../../core/platform/electron-bridge';

const PAGES = ['Welcome', 'Workspace & window', 'Updates & notifications', 'Hotkeys', 'AI provider', 'Collaboration', 'Review'];

@Component({
  selector: 'app-onboarding',
  templateUrl: './onboarding.html',
})
export class Onboarding {
  protected readonly flow = inject(OnboardingService);
  protected readonly desktop = inject(DesktopPreferencesService);
  protected readonly workspace = inject(WorkspaceLayoutService);
  private readonly shell = inject(ShellChromeService);
  private readonly secure = inject(SecureLocalService);
  private readonly persistence = inject(PersistenceService);
  protected readonly pages = PAGES;
  protected readonly launchOnLogin = signal(false);
  protected readonly hotkeys = signal<readonly QuickActionInfo[]>([]);
  protected readonly hotkeyDrafts = signal<Record<string, string>>({});
  protected readonly baseUrl = signal('');
  protected readonly model = signal('');
  protected readonly apiKey = signal('');
  protected readonly relayUrl = this.persistence.signal('settings', 'relayUrl', 'local', '');
  protected readonly message = signal('');
  protected readonly saving = signal(false);

  constructor() { void this.load(); }

  private async load(): Promise<void> {
    await this.desktop.load();
    this.launchOnLogin.set(await this.shell.getLaunchOnLogin());
    const hotkeys = await this.shell.listQuickActions();
    this.hotkeys.set(hotkeys);
    this.hotkeyDrafts.set(Object.fromEntries(hotkeys.map((item) => [item.id, item.hotkey ?? ''])));
    const [url, model, key] = await Promise.all([
      this.secure.get(APP_SETTINGS_NAMESPACE, LLM_BASE_URL_KEY), this.secure.get(APP_SETTINGS_NAMESPACE, LLM_MODEL_KEY), this.secure.get(APP_SETTINGS_NAMESPACE, LLM_API_KEY_KEY),
    ]);
    if (url.ok) this.baseUrl.set(url.value ?? '');
    if (model.ok) this.model.set(model.value ?? '');
    if (key.ok) this.apiKey.set(key.value ?? '');
  }

  protected async preference<K extends keyof DesktopPreferences>(key: K, value: DesktopPreferences[K]): Promise<void> {
    const result = await this.desktop.set({ [key]: value });
    if (!result.ok) this.message.set(result.error);
  }

  protected async login(event: Event): Promise<void> {
    const enabled = (event.target as HTMLInputElement).checked;
    const result = await this.shell.setLaunchOnLogin(enabled);
    if (result.ok) this.launchOnLogin.set(enabled);
    else this.message.set(result.error);
  }

  protected async saveHotkey(id: string): Promise<boolean> {
    const value = this.hotkeyDrafts()[id]?.trim() || null;
    const result = await this.shell.setQuickActionHotkey(id, value);
    if (result.ok) this.hotkeys.set(await this.shell.listQuickActions());
    else this.message.set(result.error);
    return result.ok;
  }

  protected hotkeyInput(id: string, event: Event): void {
    this.hotkeyDrafts.update((drafts) => ({ ...drafts, [id]: (event.target as HTMLInputElement).value }));
  }

  protected displayChanged(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    void this.preference('preferredDisplayId', value === '' ? null : Number(value));
  }

  protected async saveAi(): Promise<boolean> {
    this.saving.set(true);
    this.message.set('');
    const results = await Promise.all([
      this.secure.set(APP_SETTINGS_NAMESPACE, LLM_BASE_URL_KEY, this.baseUrl().trim()),
      this.secure.set(APP_SETTINGS_NAMESPACE, LLM_MODEL_KEY, this.model().trim()),
      this.secure.set(APP_SETTINGS_NAMESPACE, LLM_API_KEY_KEY, this.apiKey().trim()),
    ]);
    this.saving.set(false);
    const error = results.find((result) => !result.ok);
    this.message.set(error && !error.ok ? error.error : 'AI configuration saved.');
    return !error;
  }

  protected async openDefaultApps(): Promise<void> {
    const result = await window.dude!.shell.openDefaultApps();
    if (!result.ok) this.message.set(result.error);
  }

  protected async next(): Promise<void> {
    if (this.flow.step() === 3) {
      for (const action of this.hotkeys()) {
        if ((this.hotkeyDrafts()[action.id]?.trim() || '') !== (action.hotkey ?? '')) {
          if (!await this.saveHotkey(action.id)) return;
        }
      }
    }
    if (this.flow.step() === 4 && !await this.saveAi()) return;
    this.message.set('');
    if (this.flow.step() === PAGES.length - 1) this.flow.complete();
    else this.flow.setStep(this.flow.step() + 1);
  }

  protected back(): void { this.message.set(''); this.flow.setStep(Math.max(0, this.flow.step() - 1)); }
}
