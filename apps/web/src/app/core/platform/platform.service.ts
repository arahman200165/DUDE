import { inject as injectPlatformBridge } from '@angular/core';
import { PLATFORM_BRIDGE, currentPlatformBridge } from './platform-bridge.adapter';
import { Injectable, signal } from '@angular/core';

/**
 * Detects the Electron desktop shell via the flag its preload script injects
 * (`apps/desktop/preload.ts`), never `navigator.userAgent` sniffing. Exported
 * standalone (not just inlined in `PlatformService`) because `app.config.ts`
 * needs the same check at provider-construction time, before DI exists.
 */
export function isElectronRuntime(): boolean {
  return currentPlatformBridge()?.platform.isDesktop === true;
}

/**
 * The app-wide "are we running as the Electron desktop app" primitive (PRD
 * Phase 8 Stage 1). The seam every later desktop-only stage (native file
 * access, secure-local persistence, LLM proxy, tray/collab) conditions on.
 */
@Injectable({ providedIn: 'root' })
export class PlatformService {
  private readonly platformBridgePort = injectPlatformBridge(PLATFORM_BRIDGE);

  private readonly isDesktopSignal = signal(this.platformBridgePort.get()?.platform.isDesktop === true);

  readonly isDesktop = this.isDesktopSignal.asReadonly();

  /**
   * A static, preload-computed flag (DUDE_PRD.md §21 Phase 25 Item 6) -- true only for the one
   * launch immediately following an unclean exit (crash, force-kill, OS shutdown). Read once at
   * construction, the same way `isElectronRuntime()` above is -- it never changes within a session.
   */
  readonly wasRestoredAfterCrash = this.isDesktop() && this.platformBridgePort.get()!.platform.wasRestoredAfterCrash;
}
