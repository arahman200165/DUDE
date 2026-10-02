import { inject as injectPlatformBridge } from '@angular/core';
import { PLATFORM_BRIDGE } from './platform-bridge.adapter';
import { Injectable } from '@angular/core';

export interface RuntimeProbeCommand { readonly id: string; readonly exe: string; readonly args: readonly string[] }
export interface RuntimeProbeResult {
  readonly id: string;
  readonly ok: boolean;
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number | null;
  readonly error?: string;
}

const UNAVAILABLE = 'Running version probes is available in Desktop DUDE.';

/**
 * Renderer client for the desktop runtime version probe (DUDE_PRD.md §21 Phase 31, Milestone 600).
 * `probe` EXECUTES the given programs; callers must only reach it from an explicit, previewed user action.
 */
@Injectable({ providedIn: 'root' })
export class RuntimeProbeService {
  private readonly platformBridgePort = injectPlatformBridge(PLATFORM_BRIDGE);

  get available(): boolean { return !!this.platformBridgePort.get()?.runtime; }

  async probe(commands: readonly RuntimeProbeCommand[]): Promise<readonly RuntimeProbeResult[]> {
    const runtime = this.platformBridgePort.get()?.runtime;
    if (!runtime) throw new Error(UNAVAILABLE);
    return runtime.probe(commands);
  }
}
