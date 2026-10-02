import { inject as injectPlatformBridge } from '@angular/core';
import { PLATFORM_BRIDGE } from './platform-bridge.adapter';
import { Injectable, signal } from '@angular/core';
import type { SnapshotDiff, SnapshotHeader } from "@dude/contracts/fs/snapshot-diff";

/**
 * Renderer client for the desktop folder-snapshot library (`apps/desktop/fs-snapshots.ts`, Phase 29
 * Milestone 527). Snapshots are app data; nothing here reads or writes the snapshotted folders.
 */
@Injectable({ providedIn: 'root' })
export class FsSnapshotService {
  private readonly platformBridgePort = injectPlatformBridge(PLATFORM_BRIDGE);

  readonly snapshots = signal<readonly SnapshotHeader[]>([]);

  get available(): boolean { return !!this.platformBridgePort.get()?.fsSnapshots; }

  private get bridge() {
    const bridge = this.platformBridgePort.get()?.fsSnapshots;
    if (!bridge) throw new Error('The snapshot library is only available in the desktop app.');
    return bridge;
  }

  private unwrap<T>(result: { ok: true; value: T } | { ok: false; error: string }): T {
    if (!result.ok) throw new Error(result.error);
    return result.value;
  }

  async refresh(): Promise<void> { if (this.available) this.snapshots.set(this.unwrap(await this.bridge.list())); }
  async exportJson(id: string): Promise<string> { return this.unwrap(await this.bridge.export(id)); }
  async importJson(json: string): Promise<SnapshotHeader> { const header = this.unwrap(await this.bridge.import(json)); await this.refresh(); return header; }
  async remove(id: string): Promise<void> { this.unwrap(await this.bridge.delete(id)); await this.refresh(); }
  async compare(baseId: string, compareId: string): Promise<SnapshotDiff> { return this.unwrap(await this.bridge.compare(baseId, compareId)); }
}
