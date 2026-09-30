import { Injectable, signal } from '@angular/core';
import type { PowerShellCmdletDefinition } from '../../../shared-logic/system/powershell-builder';
import type { PowerShellHistoryEntry, PowerShellRunEvent, PowerShellRunPreview } from '../../../shared-logic/system/powershell-types';

/**
 * Renderer client for the desktop PowerShell workbench (`electron/powershell-workbench.ts`, DUDE_PRD.md §5.2.1,
 * Milestone 612). Building, editing, loading the catalog and restoring history never call `run`. `confirmAndRun` is
 * the only way to start pwsh: it first obtains a single-use token for exactly this preview, and it is called only
 * from the tool's explicit "Run this script" step.
 */
@Injectable({ providedIn: 'root' })
export class PowerShellWorkbenchService {
  /** Events for the current run, streamed by main to this window only. */
  readonly event = signal<PowerShellRunEvent | null>(null);
  private unsubscribe: (() => void) | null = null;

  get available(): boolean { return !!window.dude?.powershell; }

  private get bridge() {
    const bridge = window.dude?.powershell;
    if (!bridge) throw new Error('Running PowerShell is only available in the desktop app.');
    return bridge;
  }

  /** Subscribes once; returns the unsubscribe function. */
  listen(callback: (event: PowerShellRunEvent) => void): () => void {
    this.unsubscribe?.();
    this.unsubscribe = this.bridge.onEvent((event) => { this.event.set(event); callback(event); });
    return () => { this.unsubscribe?.(); this.unsubscribe = null; };
  }

  catalog(refresh = false): Promise<{ readonly version: string; readonly commands: readonly PowerShellCmdletDefinition[] }> { return this.bridge.catalog(refresh); }
  preview(script: string, cwd: string): Promise<PowerShellRunPreview> { return this.bridge.preview(script, cwd); }
  discard(previewId: string): Promise<boolean> { return this.bridge.discard(previewId); }

  /** Step 2 of the contract: a token for exactly this preview, then start. */
  async confirmAndRun(previewId: string, timeoutMs: number): Promise<{ readonly runId: string }> {
    const bridge = this.bridge;
    const { token } = await bridge.confirm(previewId);
    return bridge.run(previewId, token, timeoutMs);
  }

  cancel(runId: string): Promise<boolean> { return this.bridge.cancel(runId); }
  history(): Promise<readonly PowerShellHistoryEntry[]> { return this.bridge.history(); }
  clearHistory(): Promise<void> { return this.bridge.clearHistory(); }
}
