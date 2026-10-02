import { inject as injectPlatformBridge } from '@angular/core';
import { PLATFORM_BRIDGE } from './platform-bridge.adapter';
import { Injectable, inject } from '@angular/core';
import { PlatformService } from './platform.service';
import type { VoidResult } from "@dude/contracts/shared/models/platform-bridge.model";

/**
 * Opens a user-saved http(s) link outside the app (DUDE_PRD.md §21 Phase 30H.6). On desktop that
 * goes through the narrow `window.dude.external.open` bridge — Electron denies every in-app window
 * open, and main re-validates the URL and sender itself. On the web the browser's own anchor
 * behavior is used, so this is only called for the desktop path (`isHandledNatively`).
 */
@Injectable({ providedIn: 'root' })
export class ExternalLinkService {
  private readonly platformBridgePort = injectPlatformBridge(PLATFORM_BRIDGE);

  private readonly platform = inject(PlatformService);

  /** True when a click on a plain anchor must be intercepted and routed through the bridge. */
  isHandledNatively(): boolean {
    return this.platform.isDesktop();
  }

  open(url: string): Promise<VoidResult> {
    if (!this.platform.isDesktop()) {
      window.open(url, '_blank', 'noopener,noreferrer');
      return Promise.resolve({ ok: true });
    }
    return this.platformBridgePort.get()!.external.open(url);
  }
}
