import { Injectable, inject, signal } from '@angular/core';
import type { BackgroundAgentResult, BackgroundAgentStatus, PlatformBridge } from '@dude/contracts';

type DeviceBridge = PlatformBridge['device'];
import { PLATFORM_BRIDGE } from '../platform/platform-bridge.adapter';

/**
 * The resident background Device Agent on desktop (Settings > This Device). On web there is no agent:
 * `available` is false and every action is a no-op. Main owns the real state; this service only
 * mirrors the last status it was given.
 */
@Injectable({ providedIn: 'root' })
export class DeviceAgentService {
  private readonly bridge = inject(PLATFORM_BRIDGE);

  readonly available = typeof this.bridge.get()?.device?.agentStatus === 'function';
  readonly status = signal<BackgroundAgentStatus | null>(null);
  readonly busy = signal(false);
  /** Plain-language reason the last action did not work, or null. */
  readonly error = signal<string | null>(null);

  async refresh(): Promise<void> {
    const device = this.bridge.get()?.device;
    if (!this.available || !device) return;
    try { this.status.set(await device.agentStatus()); } catch { /* keep the last known status */ }
  }

  setAutostart(enabled: boolean): Promise<void> {
    return this.act((device) => device.setAgentAutostart(enabled));
  }

  stop(): Promise<void> {
    return this.act((device) => device.stopAgent());
  }

  start(): Promise<void> {
    return this.act((device) => device.startAgent());
  }

  private async act(run: (device: DeviceBridge) => Promise<BackgroundAgentResult>): Promise<void> {
    const device = this.bridgeDevice();
    if (!device || this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const result = await run(device);
      if (result.ok) this.status.set(result.status);
      else { this.error.set(result.error); await this.refresh(); }
    } catch {
      this.error.set('That did not complete.');
    } finally {
      this.busy.set(false);
    }
  }

  private bridgeDevice(): DeviceBridge | null { return this.available ? this.bridge.get()?.device ?? null : null; }
}
