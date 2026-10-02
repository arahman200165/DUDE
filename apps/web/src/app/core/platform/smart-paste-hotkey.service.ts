import { inject as injectPlatformBridge } from '@angular/core';
import { PLATFORM_BRIDGE } from './platform-bridge.adapter';
import { Injectable, inject } from '@angular/core';
import { PlatformService } from './platform.service';
import type { VoidResult } from "@dude/contracts/shared/models/platform-bridge.model";

/**
 * Renderer-side client for the Desktop Global Smart Paste Hotkey (DUDE_PRD.md §21 Phase 24 Item 3)
 * -- mirrors `ShellChromeService`'s shape exactly: small, single-call wrappers around `window.dude`,
 * gated by `PlatformService.isDesktop()`.
 */
@Injectable({ providedIn: 'root' })
export class SmartPasteHotkeyService {
  private readonly platformBridgePort = injectPlatformBridge(PLATFORM_BRIDGE);

  private readonly platform = inject(PlatformService);

  async getHotkey(): Promise<string | null> {
    if (!this.platform.isDesktop()) return null;
    return this.platformBridgePort.get()!.smartPaste.getHotkey();
  }

  async setHotkey(accelerator: string | null): Promise<VoidResult> {
    if (!this.platform.isDesktop()) return { ok: false, error: 'not-supported' };
    return this.platformBridgePort.get()!.smartPaste.setHotkey(accelerator);
  }
}
