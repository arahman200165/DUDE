import { Injectable, inject } from '@angular/core';
import { PlatformService } from './platform.service';
import type { VoidResult } from './electron-bridge';

/**
 * Renderer-side client for the Desktop Global Smart Paste Hotkey (DUDE_PRD.md §21 Phase 24 Item 3)
 * -- mirrors `ShellChromeService`'s shape exactly: small, single-call wrappers around `window.dude`,
 * gated by `PlatformService.isDesktop()`.
 */
@Injectable({ providedIn: 'root' })
export class SmartPasteHotkeyService {
  private readonly platform = inject(PlatformService);

  async getHotkey(): Promise<string | null> {
    if (!this.platform.isDesktop()) return null;
    return window.dude!.smartPaste.getHotkey();
  }

  async setHotkey(accelerator: string | null): Promise<VoidResult> {
    if (!this.platform.isDesktop()) return { ok: false, error: 'not-supported' };
    return window.dude!.smartPaste.setHotkey(accelerator);
  }
}
