import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ToolDefinition } from '../../../shared/models/tool-definition.model';
import { PipelineStep, PipelineStepResult } from '../../../shared/models/pipeline-step.model';
import { ToolRegistryService } from '../../../core/registry/tool-registry.service';
import { loadPipelineStep } from '../../../core/pipeline/pipeline-step-loader';
import { runQuickRun } from '../../../core/pipeline/quick-run';
import { FavoritesService } from '../../../core/favorites/favorites.service';
import { UsageService } from '../../../core/usage/usage.service';
import { DashboardPanel } from '../../../shared/components/dashboard-panel/dashboard-panel';
import { ErrorPanel } from '../../../shared/components/error-panel/error-panel';

const CANDIDATE_LIMIT = 8;

/**
 * Home's compact Quick Run surface (DUDE_PRD.md §21 Phase 30D.1/30G.1) — one shared input plus a
 * bounded row of eligible-tool chips, running through the same `runQuickRun` execution helper the
 * standalone `/quick-run` route uses. Deliberately scoped to the user's own favorited/most-used
 * tools (a small, bounded candidate set) rather than the full registry: checking pipeline-step
 * eligibility per-candidate via `loadPipelineStep` avoids forcing
 * `PipelineStepRegistryService.ensureLoaded()`'s eager, whole-registry load (~225 dynamic imports)
 * on every visit to Home, which the standalone `/quick-run` route already accepts as its own
 * one-time cost but Home — the app's default route — should not pay just to render this panel.
 * "Open full Quick Run" hands off anything beyond this compact set to the full route.
 */
@Component({
  selector: 'app-quick-run-panel',
  imports: [DashboardPanel, ErrorPanel],
  templateUrl: './quick-run-panel.html',
})
export class QuickRunPanel {
  private readonly router = inject(Router);
  private readonly registry = inject(ToolRegistryService);
  private readonly favorites = inject(FavoritesService);
  private readonly usage = inject(UsageService);
  private readonly steps = new Map<string, PipelineStep | undefined>();

  protected readonly loading = signal(true);
  protected readonly eligibleTools = signal<readonly ToolDefinition[]>([]);
  protected readonly input = signal('');
  protected readonly runningToolId = signal<string | null>(null);
  protected readonly result = signal<{ toolId: string; result: PipelineStepResult } | null>(null);

  /** Exposed so specs can await candidate resolution instead of polling `whenStable()`. */
  readonly ready: Promise<void>;

  constructor() {
    this.ready = this.loadCandidates();
  }

  private async loadCandidates(): Promise<void> {
    const favoriteIds = this.favorites.pinnedTools().map((tool) => tool.id);
    const usedIds = this.usage.mostFrequent(CANDIDATE_LIMIT);
    const candidateIds = [...new Set([...favoriteIds, ...usedIds])].slice(0, CANDIDATE_LIMIT);

    const resolved = await Promise.all(
      candidateIds.map(async (id) => {
        const step = await loadPipelineStep(id);
        this.steps.set(id, step);
        return step?.accepts.includes('text') ? this.registry.getById(id) : undefined;
      }),
    );
    this.eligibleTools.set(resolved.filter((tool): tool is ToolDefinition => tool !== undefined));
    this.loading.set(false);
  }

  protected onInputChange(event: Event): void {
    this.input.set((event.target as HTMLTextAreaElement).value);
  }

  protected toolTitle(toolId: string): string {
    return this.registry.getById(toolId)?.title ?? toolId;
  }

  protected async run(toolId: string): Promise<void> {
    this.runningToolId.set(toolId);
    this.result.set(null);
    try {
      const result = await runQuickRun(this.steps.get(toolId), this.input());
      if (result) this.result.set({ toolId, result });
    } finally {
      this.runningToolId.set(null);
    }
  }

  protected formatOutput(output: unknown): string {
    return typeof output === 'string' ? output : JSON.stringify(output, null, 2);
  }

  protected openFullQuickRun(): void {
    void this.router.navigateByUrl('/quick-run');
  }
}
