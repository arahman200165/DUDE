import { inject as injectPlatformBridge } from '@angular/core';
import { PLATFORM_BRIDGE } from './platform-bridge.adapter';
import { Injectable, signal } from '@angular/core';
import type { PwshStatus } from "@dude/contracts/system/system-types";

/** Whether PowerShell 7 is installed (native-system capability). Cached after the first lookup. */
@Injectable({ providedIn: 'root' })
export class PwshStatusService {
  private readonly platformBridgePort = injectPlatformBridge(PLATFORM_BRIDGE);

  readonly status = signal<PwshStatus | null>(null);
  private pending: Promise<PwshStatus> | null = null;

  async refresh(force = false): Promise<PwshStatus> {
    const cached = this.status();
    if (cached && !force) return cached;
    if (this.pending && !force) return this.pending;
    const pending = this.load(force).finally(() => { if (this.pending === pending) this.pending = null; });
    this.pending = pending;
    return pending;
  }

  ensureLoaded(): Promise<PwshStatus> { return this.refresh(false); }

  private async load(force: boolean): Promise<PwshStatus> {
    const sys = this.platformBridgePort.get()?.sys;
    let status: PwshStatus;
    if (!sys) status = { available: false, reason: 'Desktop only' };
    else {
      try { status = await sys.pwshStatus(force); } catch (error) { status = { available: false, reason: error instanceof Error ? error.message : String(error) }; }
    }
    this.status.set(status);
    return status;
  }
}
