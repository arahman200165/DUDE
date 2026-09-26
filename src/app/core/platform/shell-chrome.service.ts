import { Injectable, inject } from '@angular/core';
import { PlatformService } from './platform.service';
import type { FileAssociations, QuickActionInfo, VoidResult } from './electron-bridge';

/**
 * Renderer-side client for Stage 5's desktop shell chrome: launch-on-login,
 * the clipboard quick-action registry (list + hotkey binding), and native
 * notifications. Bundled into one service since each is a small, single-call
 * wrapper around `window.dude` — no shared state between them.
 */
@Injectable({ providedIn: 'root' })
export class ShellChromeService {
  private readonly platform = inject(PlatformService);

  async getLaunchOnLogin(): Promise<boolean> {
    if (!this.platform.isDesktop()) return false;
    return window.dude!.shell.getLaunchOnLogin();
  }

  async setLaunchOnLogin(enabled: boolean): Promise<VoidResult> {
    if (!this.platform.isDesktop()) return { ok: false, error: 'not-supported' };
    return window.dude!.shell.setLaunchOnLogin(enabled);
  }

  async listQuickActions(): Promise<readonly QuickActionInfo[]> {
    if (!this.platform.isDesktop()) return [];
    return window.dude!.quickActions.list();
  }

  async setQuickActionHotkey(actionId: string, accelerator: string | null): Promise<VoidResult> {
    if (!this.platform.isDesktop()) return { ok: false, error: 'not-supported' };
    return window.dude!.quickActions.setHotkey(actionId, accelerator);
  }

  async getFileAssociations(): Promise<FileAssociations | null> {
    if (!this.platform.isDesktop()) return null;
    return window.dude!.shell.getFileAssociations();
  }

  async openDefaultApps(): Promise<VoidResult> {
    if (!this.platform.isDesktop()) return { ok: false, error: 'not-supported' };
    return window.dude!.shell.openDefaultApps();
  }

  async notify(title: string, body: string): Promise<VoidResult> {
    if (!this.platform.isDesktop()) return { ok: false, error: 'not-supported' };
    return window.dude!.notifications.show(title, body);
  }
}
