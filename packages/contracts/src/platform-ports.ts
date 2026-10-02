import type { PlatformBridge } from "./shared/models/platform-bridge.model.js";

/** A host supplies capabilities; undefined means they are unavailable on that host. */
export interface PlatformBridgePort {
  get(): PlatformBridge | undefined;
}
