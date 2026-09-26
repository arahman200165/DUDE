import { Component, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { CATEGORY_METADATA } from '../../../shared/models/tool-category.model';
import { ToolDefinition } from '../../../shared/models/tool-definition.model';
import { PipelineStepResult, PipelineValue } from '../../../shared/models/pipeline-step.model';
import { ToolRegistryService } from '../../../core/registry/tool-registry.service';
import { searchTools } from '../../../core/registry/tool-search';
import { ToolLauncherService } from '../../../core/registry/tool-launcher.service';
import { PipelineStepRegistryService } from '../../../core/pipeline/pipeline-step-registry.service';
import { CategoryIcon } from '../../../shared/components/category-icon/category-icon';
import { ErrorPanel } from '../../../shared/components/error-panel/error-panel';

/**
 * Quick Run (DUDE_PRD.md §21 Phase 24 Item 12, renamed from the PRD's "Quick Actions" to avoid
 * colliding with the already-shipped Electron feature of that name — see
 * `electron/hotkey-bridge.ts`) — the `/quick-run` route, a 5th sanctioned shell exception matching
 * Smart Paste/Pipelines/Workspace/History's own-route precedent (see `shell/AGENTS.md`). Executes
 * via the exact same `PipelineStep.run(input)` contract Pipelines already uses — zero new execution
 * machinery, just a thinner, single-step, no-navigation shell around a call Pipelines makes today.
 *
 * Scoped to text-accepting steps only: a bare textarea can't reasonably represent an arbitrary
 * `json`-shaped config input (the generator-style tools -- asymmetric-key-generator,
 * cuid-generator, lorem-ipsum-generator, etc.), so those simply have no Quick Run affordance,
 * mirroring how Pipelines itself documents its own eligible-subset exclusions.
 */
@Component({
  selector: 'app-quick-run-list',
  imports: [CategoryIcon, ErrorPanel],
  templateUrl: './quick-run-list.html',
})
export class QuickRunList {
  private readonly registry = inject(ToolRegistryService);
  private readonly launcher = inject(ToolLauncherService);
  private readonly stepRegistry = inject(PipelineStepRegistryService);
  private readonly route = inject(ActivatedRoute);

  protected readonly meta = CATEGORY_METADATA;
  protected readonly registryReady = signal(false);
  protected readonly query = signal('');
  protected readonly selectedToolId = signal<string | null>(null);
  protected readonly input = signal('');
  protected readonly result = signal<PipelineStepResult | null>(null);
  protected readonly running = signal(false);

  constructor() {
    void this.stepRegistry.ensureLoaded().then(() => this.registryReady.set(true));

    // Deep-link from the command palette's "⚡ Quick Run" affordance (`/quick-run?tool=<id>`),
    // mirroring `HistoryPage`'s own `?tool=<id>` seeding pattern -- read once the registry is
    // ready, not reactively, since this is a one-shot "arrived here with a specific tool in mind."
    effect(() => {
      if (!this.registryReady()) return;
      const toolId = this.route.snapshot.queryParamMap.get('tool');
      if (toolId && this.stepRegistry.get(toolId)?.accepts.includes('text')) this.select(toolId);
    });
  }

  protected readonly eligibleTools = computed<readonly ToolDefinition[]>(() => {
    if (!this.registryReady()) return [];
    const textAcceptingIds = new Set(
      this.stepRegistry.eligibleToolIds().filter((id) => this.stepRegistry.get(id)?.accepts.includes('text')),
    );
    const candidates = this.registry.getAll().filter((tool) => textAcceptingIds.has(tool.id));
    return searchTools(candidates, this.query());
  });

  protected readonly selectedTool = computed<ToolDefinition | undefined>(() => {
    const id = this.selectedToolId();
    return id ? this.registry.getById(id) : undefined;
  });

  protected onQueryInput(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  protected select(toolId: string): void {
    this.selectedToolId.set(toolId);
    this.input.set('');
    this.result.set(null);
  }

  protected back(): void {
    this.selectedToolId.set(null);
  }

  protected onInputChange(event: Event): void {
    this.input.set((event.target as HTMLTextAreaElement).value);
  }

  protected async run(): Promise<void> {
    const toolId = this.selectedToolId();
    const step = toolId ? this.stepRegistry.get(toolId) : undefined;
    if (!step) return;

    this.running.set(true);
    this.result.set(null);
    try {
      const value: PipelineValue = { type: 'text', value: this.input() };
      this.result.set(await step.run(value));
    } finally {
      this.running.set(false);
    }
  }

  protected formatOutput(output: unknown): string {
    return typeof output === 'string' ? output : JSON.stringify(output, null, 2);
  }

  protected openFullTool(): void {
    const tool = this.selectedTool();
    if (tool) this.launcher.open(tool);
  }
}
