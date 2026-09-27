import { Component, inject, signal } from '@angular/core';
import { PlatformService } from '../../../core/platform/platform.service';
import { WorkspaceLayoutService } from '../../../core/workspace/workspace-layout.service';
import { DESKTOP_PREFERENCE_DEFAULTS, DesktopPreferencesService } from '../../../core/platform/desktop-preferences.service';
import { OnboardingService } from '../../../core/platform/onboarding.service';

/**
 * Settings › General. "Reopen my tabs on restart" applies on web and desktop alike (DUDE_PRD.md
 * §4.9's web companion stays first-class); startup destination and the setup wizard are desktop-only
 * controls and self-gate on `PlatformService.isDesktop()`.
 */
@Component({
  selector: 'app-general-settings',
  templateUrl: './general-settings.html',
})
export class GeneralSettings {
  protected readonly platform = inject(PlatformService);
  protected readonly workspaceLayout = inject(WorkspaceLayoutService);
  protected readonly desktopPrefs = inject(DesktopPreferencesService);
  protected readonly onboarding = inject(OnboardingService);
  protected readonly message = signal('');

  constructor() {
    if (this.platform.isDesktop()) void this.desktopPrefs.load();
  }

  protected onReopenOnRestartToggle(event: Event): void {
    this.workspaceLayout.reopenOnRestart.set((event.target as HTMLInputElement).checked);
  }

  protected async onStartupDestinationChange(event: Event): Promise<void> {
    const value = (event.target as HTMLSelectElement).value as 'deck' | 'workspace';
    const result = await this.desktopPrefs.set({ startupDestination: value });
    this.message.set(result.ok ? 'Saved.' : result.error);
  }

  protected async resetToDefaults(): Promise<void> {
    if (!confirm('Reset General settings to their defaults?')) return;
    this.workspaceLayout.reopenOnRestart.set(true);
    if (this.platform.isDesktop()) {
      const result = await this.desktopPrefs.set({ startupDestination: DESKTOP_PREFERENCE_DEFAULTS.startupDestination });
      this.message.set(result.ok ? 'Reset to defaults.' : result.error);
    } else {
      this.message.set('Reset to defaults.');
    }
  }
}
