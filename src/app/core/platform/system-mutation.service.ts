import { Injectable, signal } from '@angular/core';
import type { SysApplyResult, SysJournalEntry, SysMutationSettings, SysMutResult, SysPlanPreview, SysPlanRequest } from '../../../shared-logic/system/sys-mutation-types';

/**
 * Renderer client for DUDE's Windows system mutation engine (`electron/sys-mutation.ts`,
 * DUDE_PRD.md §5.2.1, Phase 31 Milestone 594). Plans are built main-side from op requests and come
 * back as a `SysPlanPreview`; `confirmAndApply` is the only way to change system state, and it is
 * called solely from `SystemChangePreview`'s explicit confirm step, which first obtains a
 * single-use token for that exact plan (with the typed names for any critical target).
 */
@Injectable({ providedIn: 'root' })
export class SystemMutationService {
  readonly progress = signal<{ planId: string; done: number; total: number } | null>(null);
  private subscribed = false;

  get available(): boolean { return !!window.dude?.sysMutation; }

  private get bridge() {
    const bridge = window.dude?.sysMutation;
    if (!bridge) throw new Error('Changing Windows system state is only available in the desktop app.');
    if (!this.subscribed) {
      this.subscribed = true;
      bridge.onProgress((event) => this.progress.set(event));
    }
    return bridge;
  }

  private unwrap<T>(result: SysMutResult<T>): T {
    if (!result.ok) throw new Error(result.error);
    return result.value;
  }

  async plan(request: SysPlanRequest): Promise<SysPlanPreview> { return this.unwrap(await this.bridge.plan(request)); }
  async planUndo(planId: string): Promise<SysPlanPreview> { return this.unwrap(await this.bridge.planUndo(planId)); }

  /** Step 2 of the contract: token for exactly this plan (and typed names), then apply. Only `SystemChangePreview` calls this. */
  async confirmAndApply(planId: string, typed: readonly string[], options: { acceptNoUndo?: boolean } = {}): Promise<SysApplyResult> {
    const bridge = this.bridge;
    const token = this.unwrap(await bridge.issueToken(planId, typed));
    return this.unwrap(await bridge.apply(planId, token.token, options));
  }

  async cancelApply(planId: string): Promise<boolean> { return this.bridge.cancelApply(planId); }
  async discard(planId: string): Promise<boolean> { return this.bridge.discard(planId); }

  async journal(): Promise<readonly SysJournalEntry[]> { return this.unwrap(await this.bridge.journal()); }
  async getSettings(): Promise<{ settings: SysMutationSettings; backupBytes: number }> { return this.unwrap(await this.bridge.getSettings()); }
  async setSettings(patch: Partial<SysMutationSettings>): Promise<SysMutationSettings> { return this.unwrap(await this.bridge.setSettings(patch)); }
  async purgeBackups(planId?: string): Promise<void> { this.unwrap(await this.bridge.purgeBackups(planId)); }
}
