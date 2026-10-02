import { inject as injectPlatformBridge } from '@angular/core';
import { PLATFORM_BRIDGE } from './platform-bridge.adapter';
import { Injectable } from '@angular/core';
import type {
  BundleEstimate, BundleOptions, BundleProgress, BundleResult, BundleToggles, BundleWriteResult,
} from "@dude/contracts/system/bundle-types";
import type { ProcessRef } from "@dude/contracts/system/system-types";

const UNAVAILABLE = 'The process diagnostic bundle is only available in Desktop DUDE.';

/**
 * Renderer client for Process Diagnostic Bundle export (Phase 31 Milestone 613). Everything is collected
 * and written by the main process; this only names the process instance, the sections and the save path
 * the native save dialog returned. Failures throw so callers use ordinary try/catch.
 */
@Injectable({ providedIn: 'root' })
export class SystemBundleService {
  private readonly platformBridgePort = injectPlatformBridge(PLATFORM_BRIDGE);

  get available(): boolean { return !!this.platformBridgePort.get()?.sysBundle; }

  private get bridge() {
    const bridge = this.platformBridgePort.get()?.sysBundle;
    if (!bridge) throw new Error(UNAVAILABLE);
    return bridge;
  }

  private unwrap<T>(result: BundleResult<T>): T {
    if (!result.ok) {
      const error = new Error(result.error) as Error & { cancelled?: boolean };
      if (result.cancelled) error.cancelled = true;
      throw error;
    }
    return result.value;
  }

  async estimate(ref: ProcessRef, options: BundleOptions): Promise<BundleEstimate> {
    return this.unwrap(await this.bridge.estimate({ ...ref, options }));
  }

  async write(ref: ProcessRef, exportId: string, sections: BundleToggles, options: BundleOptions, savePath: string): Promise<BundleWriteResult> {
    return this.unwrap(await this.bridge.write({ ...ref, exportId, sections, options, savePath }));
  }

  cancel(exportId: string): Promise<boolean> { return this.bridge.cancel(exportId); }
  reveal(path: string): Promise<boolean> { return this.bridge.reveal(path); }
  onProgress(callback: (event: BundleProgress) => void): () => void { return this.bridge.onProgress(callback); }
}
