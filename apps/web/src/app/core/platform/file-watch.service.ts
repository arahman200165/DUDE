import { inject as injectPlatformBridge } from '@angular/core';
import { PLATFORM_BRIDGE } from './platform-bridge.adapter';
import { Injectable, inject } from '@angular/core';
import { PlatformService } from './platform.service';
import type { FileWatchEvent } from "@dude/contracts/shared/models/platform-bridge.model";

/** Renderer client for ephemeral, grant-scoped desktop file watches. */
@Injectable({ providedIn: 'root' })
export class FileWatchService {
  private readonly platformBridgePort = injectPlatformBridge(PLATFORM_BRIDGE);

  private readonly platform = inject(PlatformService);

  async watch(rootPath: string, relativePath: string, recursive = false): Promise<string> {
    if (!this.platform.isDesktop()) throw new Error('File watching is only available in the desktop app.');
    const result = await this.platformBridgePort.get()!.fileWatch.watch(rootPath, relativePath, recursive);
    if (!result.ok) throw new Error(result.error);
    return result.watchId;
  }

  async unwatch(watchId: string): Promise<void> {
    if (!this.platform.isDesktop()) return;
    await this.platformBridgePort.get()!.fileWatch.unwatch(watchId);
  }

  /** Returns an unsubscribe function; the caller is responsible for calling it (e.g. in `ngOnDestroy`). */
  onEvent(callback: (event: FileWatchEvent) => void): () => void {
    if (!this.platform.isDesktop()) return () => {};
    return this.platformBridgePort.get()!.fileWatch.onEvent(callback);
  }
}
