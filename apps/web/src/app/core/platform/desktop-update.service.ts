import { inject as injectPlatformBridge } from '@angular/core';
import { PLATFORM_BRIDGE } from './platform-bridge.adapter';
import { Injectable, inject, signal } from '@angular/core';
import { PlatformService } from './platform.service';

/**
 * Renderer-side wrapper for Stage 8's `electron-updater` integration.
 * Structurally mirrors the web `UpdateService` (one ready signal, one action
 * method) but stays entirely separate — the web build's `SwUpdate` path is
 * untouched. The main process (`apps/desktop/update-bridge.ts`) downloads a
 * found update according to the selected policy; this service surfaces both
 * the available and ready-to-install states. Installing is always a user-gated
 * action (`restartAndInstall`), never automatic.
 */
@Injectable({ providedIn: 'root' })
export class DesktopUpdateService {
  private readonly platformBridgePort = injectPlatformBridge(PLATFORM_BRIDGE);

  private readonly platform = inject(PlatformService);

  private readonly updateReadySignal = signal(false);
  readonly updateReady = this.updateReadySignal.asReadonly();
  private readonly updateAvailableSignal = signal(false);
  readonly updateAvailable = this.updateAvailableSignal.asReadonly();

  constructor() {
    if (this.platform.isDesktop()) {
      this.platformBridgePort.get()!.update.onUpdateAvailable(() => {
        void this.platformBridgePort.get()!.preferences.get().then((prefs) => this.updateAvailableSignal.set(prefs.updateMode !== 'auto-download'));
      });
      this.platformBridgePort.get()!.update.onUpdateDownloaded(() => { this.updateAvailableSignal.set(false); this.updateReadySignal.set(true); });
    }
  }

  async downloadUpdate(): Promise<void> {
    if (!this.platform.isDesktop()) return;
    await this.platformBridgePort.get()!.update.downloadUpdate();
  }

  async restartAndInstall(): Promise<void> {
    if (!this.platform.isDesktop()) return;
    await this.platformBridgePort.get()!.update.quitAndInstall();
  }
}
