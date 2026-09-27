import { Injectable, computed, inject } from '@angular/core';
import { PersistenceService } from '../persistence/persistence.service';
import { ToolRegistryService } from '../registry/tool-registry.service';
import { PipelineStoreService } from '../pipeline/pipeline-store.service';
import { EMPTY_FAVORITES_STORE, migrateFavoritesStore, togglePipelineId, toggleToolId } from './favorites.model';

/**
 * Favorites / Pinned Tools and Pinned Pipelines (DUDE_PRD.md §21 Phase 24 Items 7/8) — one store
 * for both, since it's the same user gesture (an explicit pin/unpin) applied to two id namespaces,
 * deliberately separate from `UsageService`'s automatic signal (declared intent vs. inferred
 * signal are a real distinction worth their own store). See `AGENTS.md` in this directory.
 */
@Injectable({ providedIn: 'root' })
export class FavoritesService {
  private readonly persistence = inject(PersistenceService);
  private readonly registry = inject(ToolRegistryService);
  private readonly pipelineStore = inject(PipelineStoreService);
  private readonly store = this.persistence.signal('__favorites__', 'pinned', 'local', EMPTY_FAVORITES_STORE, { crossTab: 'live' });

  constructor() {
    const migrated = migrateFavoritesStore(this.store());
    // Silently prune pins for tools that no longer exist (retired, or promoted to a shell destination).
    const toolIds = migrated.toolIds.filter((id) => this.registry.getById(id) !== undefined);
    const pruned = toolIds.length === migrated.toolIds.length ? migrated : { ...migrated, toolIds };
    if (pruned !== this.store()) this.store.set(pruned);
  }

  isToolPinned(toolId: string): boolean {
    return this.store().toolIds.includes(toolId);
  }

  toggleTool(toolId: string): void {
    this.store.set(toggleToolId(this.store(), toolId));
  }

  isPipelinePinned(pipelineId: string): boolean {
    return this.store().pipelineIds.includes(pipelineId);
  }

  togglePipeline(pipelineId: string): void {
    this.store.set(togglePipelineId(this.store(), pipelineId));
  }

  /** Pinned tools that still exist in the registry — a deleted tool can't leave a dangling pin. */
  readonly pinnedTools = computed(() =>
    this.store()
      .toolIds.map((id) => this.registry.getById(id))
      .filter((tool) => tool !== undefined),
  );

  /** Pinned pipelines that still exist — a deleted pipeline can't leave a dangling pin. */
  readonly pinnedPipelines = computed(() =>
    this.store()
      .pipelineIds.map((id) => this.pipelineStore.getById(id))
      .filter((pipeline) => pipeline !== undefined),
  );
}
