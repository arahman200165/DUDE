import { Injectable, computed, inject } from '@angular/core';
import { PersistenceService } from '../persistence/persistence.service';
import { EMPTY_USER_SCRIPT_STORE, UserScriptDefinition, UserScriptStore, migrateUserScriptStore } from './pipeline.model';
import { upsertById } from '../backup/upsert-by-id';

/**
 * A library of user-authored pipeline scripts, independent of any one saved pipeline — a
 * `ScriptPipelineStep` references one by `scriptId` so the same script is reusable across
 * pipelines. `'user-scripts'` is a synthetic pseudo-toolId, same trick as `PipelineStoreService`'s
 * `'__pipelines__'`. Test-run scratch input/output (see the Script Editor's Test panel) is never
 * persisted here — only the script's own source + declared types + metadata.
 */
@Injectable({ providedIn: 'root' })
export class UserScriptStoreService {
  private readonly persistence = inject(PersistenceService);
  private readonly store = this.persistence.signal<UserScriptStore>('user-scripts', 'library', 'local', EMPTY_USER_SCRIPT_STORE, {
    crossTab: 'live',
  });

  constructor() {
    const migrated = migrateUserScriptStore(this.store());
    if (migrated !== this.store()) this.store.set(migrated);
  }

  readonly scripts = computed(() => this.store().scripts);

  getById(id: string): UserScriptDefinition | undefined {
    return this.store().scripts.find((script) => script.id === id);
  }

  save(script: UserScriptDefinition): void {
    const existing = this.store().scripts;
    const index = existing.findIndex((candidate) => candidate.id === script.id);
    const updated = { ...script, updatedAt: new Date().toISOString() };
    const scripts = index === -1 ? [...existing, updated] : existing.map((candidate, i) => (i === index ? updated : candidate));
    this.store.set({ ...this.store(), scripts });
  }

  remove(id: string): void {
    this.store.set({ ...this.store(), scripts: this.store().scripts.filter((script) => script.id !== id) });
  }

  /** Bundle import (Phase 26 Item 14). Imported scripts carry `imported: true` until reviewed. */
  importScripts(scripts: readonly UserScriptDefinition[]): void {
    this.store.set({ ...this.store(), scripts: upsertById(this.store().scripts, scripts) });
  }

  /** The explicit "I've read this code" step that lets an imported script run in pipelines. */
  markReviewed(id: string): void {
    const script = this.getById(id);
    if (!script?.imported) return;
    const { imported: _imported, ...reviewed } = script;
    this.save(reviewed);
  }
}
