import { Injectable, inject, signal } from '@angular/core';
import { CommandPaletteService } from '../../shell/command-palette/command-palette.service';
import { PlatformService } from './platform.service';
import type { VoidResult } from './electron-bridge';

/** Keeps the same palette usable in both the normal window and the temporary launcher window. */
@Injectable({ providedIn: 'root' })
export class QuickLauncherService {
  private readonly platform = inject(PlatformService);
  private readonly palette = inject(CommandPaletteService);
  readonly compact = signal(false);
  private active = false;

  constructor() {
    if (!this.platform.isDesktop()) return;
    window.dude!.quickLauncher.onOpen(({ compact }) => {
      this.active = true;
      this.compact.set(compact);
      this.palette.open();
    });
    window.dude!.quickLauncher.onDismissed(() => {
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
        if (reason === 'execute') void window.dude!.quickLauncher.promote();
        else void window.dude!.quickLauncher.dismiss();
      }
    });
    window.dude!.quickLauncher.ready();
  }

  async promote(): Promise<void> {
    if (!this.compact()) return;
    this.active = false;
    this.compact.set(false);
    this.palette.close();
    await window.dude!.quickLauncher.promote();
  }

  getHotkey(): Promise<string | null> {
    return this.platform.isDesktop() ? window.dude!.quickLauncher.getHotkey() : Promise.resolve(null);
  }

  setHotkey(accelerator: string | null): Promise<VoidResult> {
    return this.platform.isDesktop()
      ? window.dude!.quickLauncher.setHotkey(accelerator)
      : Promise.resolve({ ok: false, error: 'desktop-only' });
  }
}
