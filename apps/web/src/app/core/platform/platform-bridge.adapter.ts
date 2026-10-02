import { InjectionToken } from '@angular/core';
import type { PlatformBridge } from "@dude/contracts/shared/models/platform-bridge.model";
import type { PlatformBridgePort } from "@dude/contracts/platform-ports";

/** Host adapter only. The portable contract never reads Window or Electron APIs. */
export function currentPlatformBridge(): PlatformBridge | undefined {
  return typeof window === 'undefined' ? undefined : window.dude;
}

/** Lazy access preserves availability changes in tests and preload initialization. */
export const PLATFORM_BRIDGE = new InjectionToken<PlatformBridgePort>('DUDE platform bridge', {
  providedIn: 'root',
  factory: () => ({ get: currentPlatformBridge }),
});
