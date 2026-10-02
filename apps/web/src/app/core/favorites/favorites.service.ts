import { Injectable, computed, inject } from '@angular/core';
import { ToolRegistryService } from '../registry/tool-registry.service';
import { PipelineStoreService } from '../pipeline/pipeline-store.service';
import { ENTITY_STORE } from '../persistence/entities/entity-store';
import { favoriteCodec, favoriteItemId, favoritesToItems, itemsToFavorites } from '@dude/persistence';
import type { FavoriteItem, FavoriteKind } from '@dude/persistence';

/**
 * Favorites / Pinned Tools and Pinned Pipelines (DUDE_PRD.md §21 Phase 24 Items 7/8) — one store
 * for both, since it's the same user gesture (an explicit pin/unpin) applied to two id namespaces,
 * deliberately separate from `UsageService`'s automatic signal (declared intent vs. inferred
 * signal are a real distinction worth their own store). See `AGENTS.md` in this directory.
 */
@Injectable({ providedIn: 'root' })
export class FavoritesService {
  private readonly registry = inject(ToolRegistryService);
  private readonly pipelineStore = inject(PipelineStoreService);
  /** One record per pinned item; the legacy blob is still what the web build stores. */
  private readonly collection = inject(ENTITY_STORE).collection(favoriteCodec, {
    namespace: '__favorites__',
    key: 'pinned',
    toItems: (blob) => {
      const store = typeof blob === 'object' && blob !== null ? (blob as { toolIds?: unknown; pipelineIds?: unknown }) : {};
      return favoritesToItems({
        toolIds: Array.isArray(store.toolIds) ? store.toolIds : [],
        pipelineIds: Array.isArray(store.pipelineIds) ? store.pipelineIds : [],
      });
    },
    fromItems: (items) => itemsToFavorites(items),
  });
  private readonly store = computed(() => itemsToFavorites(this.collection.items()));

  constructor() {
    // Silently prune pins for tools that no longer exist (retired, or promoted to a shell destination).
    for (const item of this.collection.items()) {
      if (item.kind === 'tool' && this.registry.getById(item.targetId) === undefined) void this.collection.remove(item.id);
    }
  }

  isToolPinned(toolId: string): boolean {
    return this.store().toolIds.includes(toolId);
  }

  toggleTool(toolId: string): void {
    this.toggle('tool', toolId);
  }

  isPipelinePinned(pipelineId: string): boolean {
    return this.store().pipelineIds.includes(pipelineId);
  }

  togglePipeline(pipelineId: string): void {
    this.toggle('pipeline', pipelineId);
  }

  /** Unpinning removes one record; pinning appends one at the end, so no other record is rewritten. */
  private toggle(kind: FavoriteKind, targetId: string): void {
    const id = favoriteItemId(kind, targetId);
    if (this.collection.get(id)) {
      void this.collection.remove(id);
      return;
    }
    const order = this.collection.items().reduce((max, item) => Math.max(max, item.order), -1) + 1;
    const item: FavoriteItem = { id, kind, targetId, order, pinnedAt: new Date().toISOString() };
    void this.collection.upsert(item);
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
