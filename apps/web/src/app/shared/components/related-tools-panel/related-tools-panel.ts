import { Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ToolDefinition } from '../../models/tool-definition.model';
import { CATEGORY_METADATA } from "@dude/shared-types/shared/models/tool-category.model";
import { ToolRegistryService } from '../../../core/registry/tool-registry.service';
import { UsageService } from '../../../core/usage/usage.service';
import { PipelineStepRegistryService } from '../../../core/pipeline/pipeline-step-registry.service';
import { relatedTools } from "@dude/tool-engine/core/suggestions/related-tools";
import { CategoryIcon } from '../category-icon/category-icon';

const RELATED_LIMIT = 5;

/**
 * Related-Tool Suggestions (DUDE_PRD.md §21 Phase 24 Item 9) — mounted by `ToolShell` below every
 * tool's content, computed from the current `ToolDefinition`. See `core/suggestions/AGENTS.md`.
 */
@Component({
  selector: 'app-related-tools-panel',
  imports: [RouterLink, CategoryIcon],
  templateUrl: './related-tools-panel.html',
})
export class RelatedToolsPanel {
  readonly current = input.required<ToolDefinition>();

  private readonly registry = inject(ToolRegistryService);
  private readonly usage = inject(UsageService);
  private readonly pipelineSteps = inject(PipelineStepRegistryService);
  protected readonly meta = CATEGORY_METADATA;

  /**
   * Deliberately never calls `PipelineStepRegistryService.ensureLoaded()` — this component mounts
   * on every single tool page, and forcing that eager load here would mean visiting any tool
   * triggers ~225 extra dynamic-import chunk loads just for a ranking boost. `eligibleToolIds()` is
   * read as-is: empty (no boost, harmless) until something else — opening `/pipelines` — has
   * already warmed the shared cache, at which point the boost naturally starts applying for free.
   */
  protected readonly related = computed(() =>
    relatedTools(
      this.current(),
      this.registry.getAll(),
      new Set(this.pipelineSteps.eligibleToolIds()),
      (toolId) => this.usage.frequencyOf(toolId),
      RELATED_LIMIT,
    ),
  );
}
