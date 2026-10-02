import { inject as injectPlatformBridge } from '@angular/core';
import { PLATFORM_BRIDGE } from './platform-bridge.adapter';
import { Injectable, inject, signal } from '@angular/core';
import { CommandPaletteService } from '../../shell/command-palette/command-palette.service';
import { PlatformService } from './platform.service';
import type { VoidResult } from "@dude/contracts/shared/models/platform-bridge.model";

/** Keeps the same palette usable in both the normal window and the temporary launcher window. */
@Injectable({ providedIn: 'root' })
export class QuickLauncherService {
  private readonly platformBridgePort = injectPlatformBridge(PLATFORM_BRIDGE);

  private readonly platform = inject(PlatformService);
  private readonly palette = inject(CommandPaletteService);
  readonly compact = signal(false);
  private active = false;

  constructor() {
    if (!this.platform.isDesktop()) return;
    this.platformBridgePort.get()!.quickLauncher.onOpen(({ compact }) => {
      this.active = true;
      this.compact.set(compact);
      this.palette.open();
    });
    this.platformBridgePort.get()!.quickLauncher.onDismissed(() => {
      this.active = false;
      this.compact.set(false);
      this.palette.close();
    });
    this.palette.closed.subscribe((reason) => {
      if (!this.active) return;
      const compact = this.compact();
      this.active = false;
      this.compact.set(false);
      if (compact) {
        if (reason === 'execute') void this.platformBridgePort.get()!.quickLauncher.promote();
        else void this.platformBridgePort.get()!.quickLauncher.dismiss();
      }
    });
    this.platformBridgePort.get()!.quickLauncher.ready();
  }

  async promote(): Promise<void> {
    if (!this.compact()) return;
    this.active = false;
    this.compact.set(false);
    this.palette.close();
    await this.platformBridgePort.get()!.quickLauncher.promote();
  }

  getHotkey(): Promise<string | null> {
    return this.platform.isDesktop() ? this.platformBridgePort.get()!.quickLauncher.getHotkey() : Promise.resolve(null);
  }

  setHotkey(accelerator: string | null): Promise<VoidResult> {
    return this.platform.isDesktop()
      ? this.platformBridgePort.get()!.quickLauncher.setHotkey(accelerator)
      : Promise.resolve({ ok: false, error: 'desktop-only' });
  }
}
