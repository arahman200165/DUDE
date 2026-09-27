import { Injectable, inject, signal } from '@angular/core';
import { PlatformService } from './platform.service';
import type { DesktopPreferences } from './electron-bridge';

/** Mirrors `electron/desktop-preferences.ts`'s own defaults — used by Settings' "Reset to defaults". */
export const DESKTOP_PREFERENCE_DEFAULTS: DesktopPreferences = {
  closeToTray: true,
  launchMinimized: false,
  startupDestination: 'workspace',
  preferredDisplayId: null,
  rememberWindowBounds: true,
  updateMode: 'auto-download',
  notifyUpdates: true,
  notifyCollaboration: true,
};

@Injectable({ providedIn: 'root' })
export class DesktopPreferencesService {
  private readonly platform = inject(PlatformService);
  private readonly currentSignal = signal<DesktopPreferences>(DESKTOP_PREFERENCE_DEFAULTS);
  readonly current = this.currentSignal.asReadonly();
  readonly displays = signal<readonly { id: number; label: string; primary: boolean }[]>([]);

  async load(): Promise<void> {
    if (!this.platform.isDesktop()) return;
    const [preferences, displays] = await Promise.all([window.dude!.preferences.get(), window.dude!.preferences.displays()]);
    this.currentSignal.set(preferences);
    this.displays.set(displays);
  }

  async set(patch: Partial<DesktopPreferences>): Promise<{ ok: true } | { ok: false; error: string }> {
    if (!this.platform.isDesktop()) return { ok: false, error: 'Desktop only.' };
    const result = await window.dude!.preferences.set(patch);
    if (result.ok) this.currentSignal.set(result.value);
    return result;
  }
}
