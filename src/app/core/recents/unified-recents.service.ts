import { Injectable, computed, inject } from '@angular/core';
import { UsageService } from '../usage/usage.service';
import { ToolRegistryService } from '../registry/tool-registry.service';
import { PipelineStoreService } from '../pipeline/pipeline-store.service';
import { WorkspaceLayoutService } from '../workspace/workspace-layout.service';
import { HistoryService } from '../history/history.service';
import { NativeRecentsService } from '../native-recents/native-recents.service';
import { UnifiedRecentEntry } from './unified-recents.model';
import { mergeUnifiedRecents } from './unified-recents';

/**
 * Unified Recents (DUDE_PRD.md §21 Phase 24 Item 13) — a derived, read-only view over
 * `UsageService`, `PipelineStoreService`, `WorkspaceLayoutService`, and `HistoryService`, never a
 * fifth source of truth. This is what lets it honestly show "opened JWT Debugger" (from the
 * uniform, content-free usage log) alongside real content entries only for tools that separately
 * opted into History, without conflating the two different eligibility rules. See `AGENTS.md`.
 */
@Injectable({ providedIn: 'root' })
export class UnifiedRecentsService {
  private readonly usage = inject(UsageService);
  private readonly registry = inject(ToolRegistryService);
  private readonly pipelineStore = inject(PipelineStoreService);
  private readonly workspaceLayout = inject(WorkspaceLayoutService);
  private readonly history = inject(HistoryService);
  private readonly nativeRecents = inject(NativeRecentsService);

  private toolTitle(toolId: string): string {
    return this.registry.getById(toolId)?.title ?? toolId;
  }

  /** A tool that has since been retired (or became a shell destination) silently drops off. */
  private readonly isKnownTool = (entry: { readonly toolId: string }): boolean => this.registry.getById(entry.toolId) !== undefined;

  readonly entries = computed<readonly UnifiedRecentEntry[]>(() => {
    const toolEntries: UnifiedRecentEntry[] = this.usage
      .recentLogRaw()
      .filter(this.isKnownTool)
      .map((e) => ({ kind: 'tool' as const, toolId: e.toolId, title: this.toolTitle(e.toolId), at: e.at }));

    const pipelineEntries: UnifiedRecentEntry[] = this.pipelineStore
      .pipelines()
      .filter((p) => p.lastRunAt)
      .map((p) => ({ kind: 'pipeline' as const, pipelineId: p.id, title: p.name, at: p.lastRunAt! }));

    // `WorkspaceLayoutService.openTabs()` carries no per-tab timestamp -- these deliberately use
    // "now" (recomputed whenever anything reactive re-evaluates this) as an honest "open right
    // now" signal rather than a fabricated historical one. See AGENTS.md.
    const now = new Date().toISOString();
    const workspaceEntries: UnifiedRecentEntry[] = this.workspaceLayout
      .openTabs()
      .filter((toolId) => this.isKnownTool({ toolId }))
      .map((toolId) => ({ kind: 'workspace-tab' as const, toolId, title: this.toolTitle(toolId), at: now }));

    const historyEntries: UnifiedRecentEntry[] = this.history
      .recent()
      .filter(this.isKnownTool)
      .map((e) => ({ kind: 'history' as const, entryId: e.id, toolId: e.toolId, title: this.toolTitle(e.toolId), at: e.createdAt }));

    const nativeFileEntries: UnifiedRecentEntry[] = this.nativeRecents
      .entries()
      .map((e) => ({ kind: 'native-file' as const, path: e.path, title: e.name, at: e.openedAt }));

    return mergeUnifiedRecents(toolEntries, pipelineEntries, workspaceEntries, historyEntries, nativeFileEntries);
  });
}
