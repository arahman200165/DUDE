import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { UsageService } from '../../../core/usage/usage.service';
import { ToolRegistryService } from '../../../core/registry/tool-registry.service';
import { PipelineStepRegistryService } from '../../../core/pipeline/pipeline-step-registry.service';
import { PipelineSuggestionHandoffService } from '../../../core/pipeline/pipeline-suggestion-handoff.service';
import { SuggestionDismissalService } from '../../../core/suggestions/suggestion-dismissal.service';
import { findPipelineSuggestions, suggestionKey } from '../../../core/suggestions/pipeline-suggestions';

const MAX_CANDIDATES = 5;

/**
 * Pipeline Suggestions (DUDE_PRD.md §21 Phase 24 Item 10) — mounted on the Pipelines list, inside
 * the already-sanctioned `pipelines/` shell exception. Unlike `RelatedToolsPanel` (which mounts on
 * every tool page and must never force-load the pipeline-step registry — see
 * `core/suggestions/AGENTS.md`), this component only ever mounts on `/pipelines`, the same scope
 * `PipelineBuilder` itself already eagerly loads that registry for, so calling `ensureLoaded()`
 * here is the same cost the user is already paying by being on this page.
 */
@Component({
  selector: 'app-pipeline-suggestion-banner',
  templateUrl: './pipeline-suggestion-banner.html',
})
export class PipelineSuggestionBanner {
  private readonly usage = inject(UsageService);
  private readonly registry = inject(ToolRegistryService);
  private readonly stepRegistry = inject(PipelineStepRegistryService);
  private readonly dismissal = inject(SuggestionDismissalService);
  private readonly handoff = inject(PipelineSuggestionHandoffService);
  private readonly router = inject(Router);

  /** Flips once the eagerly-triggered load below resolves, giving `topSuggestion` a dependency to re-run against. */
  private readonly stepRegistryLoaded = signal(false);

  constructor() {
    void this.stepRegistry.ensureLoaded().then(() => this.stepRegistryLoaded.set(true));
  }

  protected readonly topSuggestion = computed(() => {
    this.stepRegistryLoaded();
    const eligible = new Set(this.stepRegistry.eligibleToolIds());
    const candidates = findPipelineSuggestions(this.usage.recentLogRaw(), eligible, MAX_CANDIDATES);
    return candidates.find((candidate) => !this.dismissal.isDismissed(suggestionKey(candidate.toolIds)));
  });

  protected readonly suggestionLabel = computed(() => {
    const suggestion = this.topSuggestion();
    if (!suggestion) return '';
    return suggestion.toolIds.map((toolId) => this.registry.getById(toolId)?.title ?? toolId).join(' → ');
  });

  protected dismiss(): void {
    const suggestion = this.topSuggestion();
    if (suggestion) this.dismissal.dismiss(suggestionKey(suggestion.toolIds));
  }

  protected saveAsPipeline(): void {
    const suggestion = this.topSuggestion();
    if (!suggestion) return;
    this.handoff.offer(suggestion.toolIds);
    void this.router.navigate(['/pipelines/new']);
  }
}
