import { inject as injectPlatformBridge } from '@angular/core';
import { PLATFORM_BRIDGE } from './platform-bridge.adapter';
import { Injectable } from '@angular/core';
import type { SysMutResult, SysSnapshot, SysSnapshotHeader, SysSnapshotKind } from "@dude/contracts/system/sys-mutation-types";

/** Renderer client for the userData snapshot library behind Phase 31's env/PATH/registry diffs. */
@Injectable({ providedIn: 'root' })
export class SystemSnapshotService {
  private readonly platformBridgePort = injectPlatformBridge(PLATFORM_BRIDGE);

  get available(): boolean { return !!this.platformBridgePort.get()?.sysSnapshots; }

  private get bridge() {
    const bridge = this.platformBridgePort.get()?.sysSnapshots;
    if (!bridge) throw new Error('The system snapshot library is only available in the desktop app.');
    return bridge;
  }

  private unwrap<T>(result: SysMutResult<T>): T {
    if (!result.ok) throw new Error(result.error);
    return result.value;
  }

  async list(kind?: SysSnapshotKind): Promise<readonly SysSnapshotHeader[]> { return this.unwrap(await this.bridge.list(kind)); }
  async get(kind: SysSnapshotKind, id: string): Promise<SysSnapshot> { return this.unwrap(await this.bridge.get(kind, id)); }
  async save(kind: SysSnapshotKind, name: string, source: string, data: unknown): Promise<SysSnapshotHeader> { return this.unwrap(await this.bridge.save(kind, name, source, data)); }
  async remove(kind: SysSnapshotKind, id: string): Promise<void> { this.unwrap(await this.bridge.remove(kind, id)); }
  async exportJson(kind: SysSnapshotKind, id: string): Promise<string> { return this.unwrap(await this.bridge.exportJson(kind, id)); }
  async importJson(json: string): Promise<SysSnapshotHeader> { return this.unwrap(await this.bridge.importJson(json)); }
  async usage(): Promise<{ count: number; bytes: number }> { return this.unwrap(await this.bridge.usage()); }
}
