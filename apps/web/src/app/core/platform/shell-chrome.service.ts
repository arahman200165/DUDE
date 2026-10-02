import { inject as injectPlatformBridge } from '@angular/core';
import { PLATFORM_BRIDGE } from './platform-bridge.adapter';
import { Injectable, inject } from '@angular/core';
import { PlatformService } from './platform.service';
import type { FileAssociations, QuickActionInfo, VoidResult } from "@dude/contracts/shared/models/platform-bridge.model";

/**
 * Renderer-side client for Stage 5's desktop shell chrome: launch-on-login,
 * the clipboard quick-action registry (list + hotkey binding), and native
 * notifications. Bundled into one service since each is a small, single-call
 * wrapper around `window.dude` — no shared state between them.
 */
@Injectable({ providedIn: 'root' })
export class ShellChromeService {
  private readonly platformBridgePort = injectPlatformBridge(PLATFORM_BRIDGE);

  private readonly platform = inject(PlatformService);

  async getLaunchOnLogin(): Promise<boolean> {
    if (!this.platform.isDesktop()) return false;
    return this.platformBridgePort.get()!.shell.getLaunchOnLogin();
  }

  async setLaunchOnLogin(enabled: boolean): Promise<VoidResult> {
    if (!this.platform.isDesktop()) return { ok: false, error: 'not-supported' };
    return this.platformBridgePort.get()!.shell.setLaunchOnLogin(enabled);
  }

  async listQuickActions(): Promise<readonly QuickActionInfo[]> {
    if (!this.platform.isDesktop()) return [];
    return this.platformBridgePort.get()!.quickActions.list();
  }

  async setQuickActionHotkey(actionId: string, accelerator: string | null): Promise<VoidResult> {
    if (!this.platform.isDesktop()) return { ok: false, error: 'not-supported' };
    return this.platformBridgePort.get()!.quickActions.setHotkey(actionId, accelerator);
  }

  async getFileAssociations(): Promise<FileAssociations | null> {
    if (!this.platform.isDesktop()) return null;
    return this.platformBridgePort.get()!.shell.getFileAssociations();
  }

  async openDefaultApps(): Promise<VoidResult> {
    if (!this.platform.isDesktop()) return { ok: false, error: 'not-supported' };
    return this.platformBridgePort.get()!.shell.openDefaultApps();
  }

  async notify(title: string, body: string): Promise<VoidResult> {
    if (!this.platform.isDesktop()) return { ok: false, error: 'not-supported' };
    return this.platformBridgePort.get()!.notifications.show(title, body);
  }
}
