import { Injectable, computed, inject } from '@angular/core';
import { ENTITY_STORE, type EntityWriteResult } from '../persistence/entities/entity-store';
import { userScriptCodec } from '@dude/persistence';
import { EMPTY_USER_SCRIPT_STORE, UserScriptDefinition } from "@dude/domain/core/pipeline/pipeline.model";

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * A library of user-authored pipeline scripts, independent of any one saved pipeline — a
 * `ScriptPipelineStep` references one by `scriptId` so the same script is reusable across
 * pipelines. `'user-scripts'` is a synthetic pseudo-toolId, same trick as `PipelineStoreService`'s
 * `'__pipelines__'`. Test-run scratch input/output (see the Script Editor's Test panel) is never
 * persisted here — only the script's own source + declared types + metadata.
 */
@Injectable({ providedIn: 'root' })
export class UserScriptStoreService {
  private readonly collection = inject(ENTITY_STORE).collection(
    userScriptCodec,
    {
      namespace: 'user-scripts',
      key: 'library',
      toItems: (blob) => (isRecord(blob) && Array.isArray(blob['scripts']) ? blob['scripts'] : []),
      fromItems: (scripts) => ({ ...EMPTY_USER_SCRIPT_STORE, scripts }),
    },
    { compare: (a, b) => a.createdAt.localeCompare(b.createdAt) },
  );

  readonly scripts = computed<readonly UserScriptDefinition[]>(() => this.collection.items());

  getById(id: string): UserScriptDefinition | undefined {
    return this.collection.get(id);
  }

  save(script: UserScriptDefinition): Promise<EntityWriteResult> {
    return this.collection.upsert({ ...script, updatedAt: new Date().toISOString() });
  }

  remove(id: string): Promise<EntityWriteResult> {
    return this.collection.remove(id);
  }

  /** Bundle import (Phase 26 Item 14). Imported scripts carry `imported: true` until reviewed. */
  importScripts(scripts: readonly UserScriptDefinition[]): Promise<EntityWriteResult> {
    return this.collection.importMany(scripts);
  }

  /** The explicit "I've read this code" step that lets an imported script run in pipelines. */
  markReviewed(id: string): void {
    const script = this.getById(id);
    if (!script?.imported) return;
    const { imported: _imported, ...reviewed } = script;
    void this.save(reviewed);
  }
}
