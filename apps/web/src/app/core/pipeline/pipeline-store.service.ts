import { Injectable, computed, inject } from '@angular/core';
import { ENTITY_STORE, type EntityWriteResult } from '../persistence/entities/entity-store';
import { pipelineCodec } from '@dude/persistence';
import { EMPTY_PIPELINE_STORE, Pipeline } from "@dude/domain/core/pipeline/pipeline.model";

/**
 * Saved pipelines live in their own store, not appended to `TOOL_DEFINITIONS` — a pipeline is
 * not a 278th tool (no category, no route in `buildToolRoutes()`). `'__pipelines__'` is a
 * synthetic pseudo-toolId (the same trick `persistence-keys.ts`'s `__consent__` already plays),
 * which gets this store `PersistenceService.clearAll()` participation for free.
 */
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

@Injectable({ providedIn: 'root' })
export class PipelineStoreService {
  private readonly collection = inject(ENTITY_STORE).collection(
    pipelineCodec,
    {
      namespace: '__pipelines__',
      key: 'saved',
      toItems: (blob) => (isRecord(blob) && Array.isArray(blob['pipelines']) ? blob['pipelines'] : []),
      fromItems: (pipelines) => ({ ...EMPTY_PIPELINE_STORE, pipelines }),
    },
    { compare: (a, b) => a.createdAt.localeCompare(b.createdAt) },
  );

  readonly pipelines = computed<readonly Pipeline[]>(() => this.collection.items());

  getById(id: string): Pipeline | undefined {
    return this.collection.get(id);
  }

  /** Optimistic: `pipelines()` updates at once; a failed commit rolls it back and is logged. */
  save(pipeline: Pipeline): Promise<EntityWriteResult> {
    return this.collection.upsert({ ...pipeline, updatedAt: new Date().toISOString() });
  }

  remove(id: string): Promise<EntityWriteResult> {
    return this.collection.remove(id);
  }

  /** Bundle import (Phase 26 Item 14): upsert by id, conflicts already resolved by `planImport`. One transaction on desktop. */
  importPipelines(pipelines: readonly Pipeline[]): Promise<EntityWriteResult> {
    return this.collection.importMany(pipelines);
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
    void this.save(copy);
    return copy;
  }
}
