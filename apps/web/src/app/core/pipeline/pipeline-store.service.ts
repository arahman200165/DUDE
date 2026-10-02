import { Injectable, computed, inject } from '@angular/core';
import { PersistenceService } from '../persistence/persistence.service';
import { EMPTY_PIPELINE_STORE, Pipeline, PipelineStore, migratePipelineStore } from "@dude/domain/core/pipeline/pipeline.model";
import { upsertById } from "@dude/tool-engine/core/backup/upsert-by-id";

/**
 * Saved pipelines live in their own store, not appended to `TOOL_DEFINITIONS` — a pipeline is
 * not a 278th tool (no category, no route in `buildToolRoutes()`). `'__pipelines__'` is a
 * synthetic pseudo-toolId (the same trick `persistence-keys.ts`'s `__consent__` already plays),
 * which gets this store `PersistenceService.clearAll()` participation for free.
 */
@Injectable({ providedIn: 'root' })
export class PipelineStoreService {
  private readonly persistence = inject(PersistenceService);
  private readonly store = this.persistence.signal<PipelineStore>('__pipelines__', 'saved', 'local', EMPTY_PIPELINE_STORE, { crossTab: 'live' });

  constructor() {
    const migrated = migratePipelineStore(this.store());
    if (migrated !== this.store()) this.store.set(migrated);
  }

  readonly pipelines = computed(() => this.store().pipelines);

  getById(id: string): Pipeline | undefined {
    return this.store().pipelines.find((pipeline) => pipeline.id === id);
  }

  save(pipeline: Pipeline): void {
    const existing = this.store().pipelines;
    const index = existing.findIndex((candidate) => candidate.id === pipeline.id);
    const updated = { ...pipeline, updatedAt: new Date().toISOString() };
    const pipelines = index === -1 ? [...existing, updated] : existing.map((candidate, i) => (i === index ? updated : candidate));
    this.store.set({ ...this.store(), pipelines });
  }

  remove(id: string): void {
    this.store.set({ ...this.store(), pipelines: this.store().pipelines.filter((pipeline) => pipeline.id !== id) });
  }

  /** Bundle import (Phase 26 Item 14): upsert by id, conflicts already resolved by `planImport`. */
  importPipelines(pipelines: readonly Pipeline[]): void {
    this.store.set({ ...this.store(), pipelines: upsertById(this.store().pipelines, pipelines) });
  }

  duplicate(id: string): Pipeline | undefined {
    const source = this.getById(id);
    if (!source) return undefined;

    const now = new Date().toISOString();
    const copy: Pipeline = {
      ...source,
      id: crypto.randomUUID(),
      name: `${source.name} (copy)`,
      createdAt: now,
      updatedAt: now,
      lastRunAt: undefined,
      lastRunStatus: undefined,
    };
    this.save(copy);
    return copy;
  }
}
