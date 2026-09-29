import { Component, computed, inject, signal } from '@angular/core';
import { DesktopPreferencesService } from '../../core/platform/desktop-preferences.service';
import { OnboardingService } from '../../core/platform/onboarding.service';
import { ShellChromeService } from '../../core/platform/shell-chrome.service';
import { SecureLocalService } from '../../core/persistence/secure-local.service';
import { APP_SETTINGS_NAMESPACE, LLM_API_KEY_KEY, LLM_BASE_URL_KEY, LLM_MODEL_KEY } from '../../core/persistence/app-settings';
import { WorkspaceLayoutService } from '../../core/workspace/workspace-layout.service';
import type { DesktopPreferences, QuickActionInfo } from '../../core/platform/electron-bridge';
import { ToolRegistryService } from '../../core/registry/tool-registry.service';
import { AppearanceService } from '../../core/appearance/appearance.service';
import { APPEARANCE_AXES, SYSTEM, type AppearancePrefs } from '../../core/appearance/appearance.model';
import { ContributedSectionHost } from '../settings/contributed-section-host/contributed-section-host';

type PageId = 'welcome' | 'appearance' | 'workspace' | 'updates' | 'hotkeys' | 'ai' | 'tool-settings' | 'review';

const PAGES: readonly { readonly id: PageId; readonly title: string }[] = [
  { id: 'welcome', title: 'Welcome' },
  { id: 'appearance', title: 'Appearance' },
  { id: 'workspace', title: 'Workspace & window' },
  { id: 'updates', title: 'Updates & notifications' },
  { id: 'hotkeys', title: 'Hotkeys' },
  { id: 'ai', title: 'AI provider' },
  { id: 'tool-settings', title: 'Tool settings' },
  { id: 'review', title: 'Review' },
];

type AppearanceKey = 'mode' | 'density' | 'contrast';

interface AppearanceRow {
  readonly prefsKey: AppearanceKey;
  readonly axisKey: string;
  readonly label: string;
  readonly options: readonly { readonly value: string; readonly label: string }[];
}

const APPEARANCE_ROW_SPECS: readonly { prefsKey: AppearanceKey; axisKey: string; label: string; allowSystem: boolean }[] = [
  { prefsKey: 'mode', axisKey: 'theme', label: 'Theme', allowSystem: true },
  { prefsKey: 'density', axisKey: 'density', label: 'Density', allowSystem: false },
  { prefsKey: 'contrast', axisKey: 'contrast', label: 'Contrast', allowSystem: true },
];

const capitalize = (value: string): string => value.charAt(0).toUpperCase() + value.slice(1);

@Component({
  selector: 'app-onboarding',
  imports: [ContributedSectionHost],
  templateUrl: './onboarding.html',
})
export class Onboarding {
  protected readonly flow = inject(OnboardingService);
  protected readonly desktop = inject(DesktopPreferencesService);
  protected readonly workspace = inject(WorkspaceLayoutService);
  private readonly shell = inject(ShellChromeService);
  private readonly secure = inject(SecureLocalService);
  protected readonly pages = PAGES;
  /** The active page; a stored/out-of-range step index is clamped so the wizard can never render nothing. */
  protected readonly currentPage = computed(() => PAGES[Math.min(PAGES.length - 1, Math.max(0, this.flow.step()))]);
  protected readonly appearance = inject(AppearanceService);
  /** Theme / density / contrast chip rows; an axis with fewer than two values offers no choice and is hidden. */
  protected readonly appearanceRows: readonly AppearanceRow[] = APPEARANCE_ROW_SPECS.flatMap((spec) => {
    const axis = APPEARANCE_AXES[spec.axisKey];
    if (!axis || axis.values.length < 2) return [];
    const options = axis.values.map((value) => ({ value, label: axis.labels?.[value] ?? capitalize(value) }));
    if (spec.allowSystem) options.push({ value: SYSTEM, label: 'System (follows OS)' });
    return [{ prefsKey: spec.prefsKey, axisKey: spec.axisKey, label: spec.label, options }];
  });
  protected readonly launchOnLogin = signal(false);
  protected readonly hotkeys = signal<readonly QuickActionInfo[]>([]);
  protected readonly hotkeyDrafts = signal<Record<string, string>>({});
  protected readonly baseUrl = signal('');
  protected readonly model = signal('');
  protected readonly apiKey = signal('');
  /** Tool-contributed Settings sections that opted into the wizard (`settingsSection.onboarding`). */
  protected readonly toolSections = inject(ToolRegistryService).settingsSections().filter((section) => section.onboarding);
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

  protected isSelected(row: AppearanceRow, value: string): boolean {
    return this.appearance.prefs()[row.prefsKey] === value;
  }

  /** What `system` currently resolves to for a row. */
  protected resolvedLabel(row: AppearanceRow): string {
    const value = this.appearance.effective()[row.axisKey] ?? APPEARANCE_AXES[row.axisKey].default;
    return row.options.find((option) => option.value === value)?.label ?? capitalize(value);
  }

  protected setAppearance(row: AppearanceRow, value: string): void {
    this.appearance.set({ [row.prefsKey]: value } as Partial<AppearancePrefs>);
  }

  protected async openDefaultApps(): Promise<void> {
    const result = await window.dude!.shell.openDefaultApps();
    if (!result.ok) this.message.set(result.error);
  }

  protected async next(): Promise<void> {
    if (this.currentPage().id === 'hotkeys') {
      for (const action of this.hotkeys()) {
        if ((this.hotkeyDrafts()[action.id]?.trim() || '') !== (action.hotkey ?? '')) {
          if (!await this.saveHotkey(action.id)) return;
        }
      }
    }
    if (this.currentPage().id === 'ai' && !await this.saveAi()) return;
    this.message.set('');
    if (this.currentPage().id === 'review') this.flow.complete();
    else this.flow.setStep(this.flow.step() + 1);
  }

  protected back(): void { this.message.set(''); this.flow.setStep(Math.max(0, this.flow.step() - 1)); }
}
