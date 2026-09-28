import { Injectable, signal } from '@angular/core';
import type { ApplyResult, JournalEntry, MutationSettings, PlanPreview } from '../../../shared-logic/fs/fs-types';

/**
 * Renderer client for DUDE's local mutation engine (`electron/fs-mutation.ts`, DUDE_PRD.md §5.2.1,
 * Phase 29 Milestone 524). Plans are built main-side (from a tool's fs job, or the small
 * trash/write/undo builders here) and come back as a `PlanPreview`; `confirmAndApply` is the only
 * way to change files, and it is called solely from `MutationPreview`'s explicit confirm step, which
 * first obtains a single-use token for that exact plan.
 */
@Injectable({ providedIn: 'root' })
export class FsMutationService {
  readonly progress = signal<{ planId: string; done: number; total: number } | null>(null);
  private subscribed = false;

  get available(): boolean { return !!window.dude?.fsMutation; }

  private get bridge() {
    const bridge = window.dude?.fsMutation;
    if (!bridge) throw new Error('Changing files on disk is only available in the desktop app.');
    if (!this.subscribed) {
      this.subscribed = true;
      bridge.onProgress((event) => this.progress.set(event));
    }
    return bridge;
  }

  private unwrap<T>(result: { ok: true; value: T } | { ok: false; error: string }): T {
    if (!result.ok) throw new Error(result.error);
    return result.value;
  }

  async planTrash(root: string, relativePaths: readonly string[], tool: string, title: string): Promise<PlanPreview> {
    return this.unwrap(await this.bridge.planTrash(root, relativePaths, tool, title));
  }

  async planWriteText(root: string, relativePath: string, text: string, tool: string): Promise<PlanPreview> {
    return this.unwrap(await this.bridge.planWriteText(root, relativePath, text, tool));
  }

  async planUndo(planId: string): Promise<PlanPreview> {
    return this.unwrap(await this.bridge.planUndo(planId));
  }

  /** Step 2 of the contract: token for exactly this plan, then apply. Only `MutationPreview` calls this. */
  async confirmAndApply(planId: string, options: { acceptNoUndo?: boolean } = {}): Promise<ApplyResult> {
    const token = await this.bridge.issueToken(planId);
    if (!token.ok) throw new Error(token.error);
    return this.unwrap(await this.bridge.apply(planId, token.token, options));
  }

  async cancelApply(planId: string): Promise<boolean> { return this.bridge.cancelApply(planId); }
  async discard(planId: string): Promise<boolean> { return this.bridge.discard(planId); }

  async journal(): Promise<readonly JournalEntry[]> { return this.unwrap(await this.bridge.journal()); }
  async settings(): Promise<{ settings: MutationSettings; backupBytes: number }> { return this.unwrap(await this.bridge.getSettings()); }
  async setSettings(patch: Partial<MutationSettings>): Promise<MutationSettings> { return this.unwrap(await this.bridge.setSettings(patch)); }
  async purgeBackups(planId?: string): Promise<void> { this.unwrap(await this.bridge.purgeBackups(planId)); }
}
