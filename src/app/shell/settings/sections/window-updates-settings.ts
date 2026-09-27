import { Component, inject, signal } from '@angular/core';
import { ErrorPanel } from '../../../shared/components/error-panel/error-panel';
import { ShellChromeService } from '../../../core/platform/shell-chrome.service';
import { DESKTOP_PREFERENCE_DEFAULTS, DesktopPreferencesService } from '../../../core/platform/desktop-preferences.service';
import type { DesktopPreferences } from '../../../core/platform/electron-bridge';

/**
 * Settings › Window & Updates (desktop-only): tray/login/window behaviour and update policy. Every
 * control saves immediately. `startupDestination` lives in General, so Reset leaves it alone.
 */
@Component({
  selector: 'app-window-updates-settings',
  imports: [ErrorPanel],
  templateUrl: './window-updates-settings.html',
})
export class WindowUpdatesSettings {
  private readonly shellChrome = inject(ShellChromeService);
  protected readonly desktopPrefs = inject(DesktopPreferencesService);

  protected readonly launchOnLogin = signal(false);
  protected readonly launchOnLoginError = signal('');
  protected readonly message = signal('');

  constructor() {
    void this.desktopPrefs.load();
    void this.shellChrome.getLaunchOnLogin().then((enabled) => this.launchOnLogin.set(enabled));
  }

  protected async setPreference<K extends keyof DesktopPreferences>(key: K, value: DesktopPreferences[K]): Promise<void> {
    const result = await this.desktopPrefs.set({ [key]: value });
    this.message.set(result.ok ? 'Saved.' : result.error);
  }

  protected checkbox(event: Event): boolean {
    return (event.target as HTMLInputElement).checked;
  }

  protected selectValue<T extends string>(event: Event): T {
    return (event.target as HTMLSelectElement).value as T;
  }

  protected displayChanged(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    void this.setPreference('preferredDisplayId', value === '' ? null : Number(value));
  }

  protected async toggleLaunchOnLogin(event: Event): Promise<void> {
    const enabled = this.checkbox(event);
    this.launchOnLoginError.set('');
    const result = await this.shellChrome.setLaunchOnLogin(enabled);
    if (!result.ok) {
      this.launchOnLoginError.set(result.error);
      return;
    }
    this.launchOnLogin.set(enabled);
  }

  protected async checkForUpdates(): Promise<void> {
    const result = await window.dude!.update.checkForUpdates();
    this.message.set(result.ok ? 'Update check completed.' : result.error);
  }

  protected async resetToDefaults(): Promise<void> {
    if (!confirm('Reset window and update settings to their defaults?')) return;
    const { startupDestination: _generalOwned, ...defaults } = DESKTOP_PREFERENCE_DEFAULTS;
    const result = await this.desktopPrefs.set(defaults);
    this.message.set(result.ok ? 'Reset to defaults.' : result.error);
  }
}
