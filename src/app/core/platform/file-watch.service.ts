import { Injectable, inject } from '@angular/core';
import { PlatformService } from './platform.service';
import type { FileWatchEvent } from './electron-bridge';

/** Renderer client for ephemeral, grant-scoped desktop file watches. */
@Injectable({ providedIn: 'root' })
export class FileWatchService {
  private readonly platform = inject(PlatformService);

  async watch(rootPath: string, relativePath: string, recursive = false): Promise<string> {
    if (!this.platform.isDesktop()) throw new Error('File watching is only available in the desktop app.');
    const result = await window.dude!.fileWatch.watch(rootPath, relativePath, recursive);
    if (!result.ok) throw new Error(result.error);
    return result.watchId;
  }

  async unwatch(watchId: string): Promise<void> {
    if (!this.platform.isDesktop()) return;
    await window.dude!.fileWatch.unwatch(watchId);
  }

  /** Returns an unsubscribe function; the caller is responsible for calling it (e.g. in `ngOnDestroy`). */
  onEvent(callback: (event: FileWatchEvent) => void): () => void {
    if (!this.platform.isDesktop()) return () => {};
    return window.dude!.fileWatch.onEvent(callback);
  }
}
