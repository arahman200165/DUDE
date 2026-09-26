import { Component, computed, inject } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { PipelineStoreService } from '../../../core/pipeline/pipeline-store.service';
import { FavoritesService } from '../../../core/favorites/favorites.service';
import { PipelineSuggestionBanner } from '../pipeline-suggestion-banner/pipeline-suggestion-banner';

@Component({
  selector: 'app-pipeline-list',
  imports: [RouterLink, NgTemplateOutlet, PipelineSuggestionBanner],
  templateUrl: './pipeline-list.html',
})
export class PipelineList {
  private readonly store = inject(PipelineStoreService);
  private readonly router = inject(Router);
  protected readonly favorites = inject(FavoritesService);

  protected readonly pipelines = this.store.pipelines;

  /** Split, not filtered, so a pipeline moving in/out of Pinned never disappears from the list. */
  protected readonly pinnedPipelines = computed(() =>
    this.pipelines().filter((pipeline) => this.favorites.isPipelinePinned(pipeline.id)),
  );
  protected readonly unpinnedPipelines = computed(() =>
    this.pipelines().filter((pipeline) => !this.favorites.isPipelinePinned(pipeline.id)),
  );

  protected togglePin(id: string): void {
    this.favorites.togglePipeline(id);
  }

  protected duplicate(id: string): void {
    const copy = this.store.duplicate(id);
    if (copy) void this.router.navigate(['/pipelines', copy.id]);
  }

  protected remove(id: string, name: string): void {
    if (confirm(`Delete pipeline "${name}"? This cannot be undone.`)) {
      this.store.remove(id);
    }
  }
}
