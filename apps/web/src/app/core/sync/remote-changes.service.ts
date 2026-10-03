import { Injectable, computed, inject, signal } from '@angular/core';
import type { AgentAppliedChange } from '@dude/contracts';
import { findKvBindingForEntity } from '@dude/persistence';
import { activeLocalBackend } from '../persistence/local-backend-registry';
import { RemoteEntityRegistry } from '../persistence/entities/remote-entity-registry';
import type { RemoteUpsert } from '../persistence/entities/entity-store';
import { PersistenceService } from '../persistence/persistence.service';

/** An entity another device changed, for editors that may hold an open copy. */
export interface RemoteChangedKey {
  readonly entityType: string;
  readonly entityId: string;
  readonly at: number;
}

const RECENT_LIMIT = 100;
const RECORD_TYPES = new Set(['favorite', 'pipeline', 'user-script', 'project', 'workspace-template', 'home-layout', 'usage']);
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Renderer-side port for changes the Device Agent applied from the Hub (`AgentAppliedChange`, desktop `sync.onApplied`;
 * the bridge is wired to `apply` in M659). The agent already wrote everything to the Device Store, so applying only
 * updates in-memory state: it never commits, journals, runs a pipeline or invokes a tool.
 *
 * - records (favorite, pipeline, user-script, project, workspace-template, home-layout, usage) go to their entity
 *   collection's `applyRemote`; a record with a local write in flight is left alone.
 * - settings and the scratchpad update the kv cache without a write, and open `local` signals adopt the value.
 * - the workspace layout is next-launch: nothing open changes, `syncedLayoutAvailable` turns on instead.
 */
@Injectable({ providedIn: 'root' })
export class RemoteChangesService {
  private readonly registry = inject(RemoteEntityRegistry);
  private readonly persistence = inject(PersistenceService);

  private readonly recent = signal<readonly RemoteChangedKey[]>([]);
  private readonly pendingLayout = signal<unknown>(null);
  private readonly layoutPending = signal(false);

  /** Entities changed by another device, newest last (bounded). Editors compare `at` to the moment they opened. */
  readonly recentChanges = this.recent.asReadonly();
  /** True once a synced workspace layout arrived that the open workspace has not adopted (offered by M659). */
  readonly syncedLayoutAvailable = this.layoutPending.asReadonly();
  /** The layout payload waiting for the next launch / explicit load. */
  readonly syncedLayout = computed(() => (this.layoutPending() ? this.pendingLayout() : null));

  /** Latest remote change time for an entity, or 0. */
  changedAt(entityType: string, entityId: string): number {
    let at = 0;
    for (const c of this.recent()) if (c.entityType === entityType && c.entityId === entityId) at = c.at;
    return at;
  }

  dismissSyncedLayout(): void {
    this.layoutPending.set(false);
    this.pendingLayout.set(null);
  }

  apply(changes: readonly AgentAppliedChange[], now: number = Date.now()): void {
    const upserts = new Map<string, RemoteUpsert[]>();
    const deletes = new Map<string, string[]>();
    const touched: RemoteChangedKey[] = [];

    for (const change of changes) {
      const { entityType, entityId } = change;
      if (RECORD_TYPES.has(entityType)) {
        if (change.deleted) push(deletes, entityType, entityId);
        else push(upserts, entityType, { entityId, payload: change.payload });
        touched.push({ entityType, entityId, at: now });
      } else if (entityType === 'setting') {
        const { namespace, key } = settingRef(change);
        if (namespace === undefined || key === undefined) continue;
        this.applyKv(namespace, key, change.deleted ? null : (change.value ?? settingValue(change.payload)));
        touched.push({ entityType, entityId, at: now });
      } else if (entityType === 'workspace-layout') {
        this.pendingLayout.set(change.deleted ? null : change.payload);
        this.layoutPending.set(!change.deleted);
        touched.push({ entityType, entityId, at: now });
      } else if (entityType === 'scratchpad') {
        const binding = findKvBindingForEntity(entityType, entityId);
        if (!binding) continue;
        this.applyKv(binding.namespace, binding.key, change.deleted ? null : change.payload);
        touched.push({ entityType, entityId, at: now });
      }
    }

    for (const [type, list] of upserts) this.registry.dispatch(type, list, deletes.get(type) ?? []);
    for (const [type, ids] of deletes) if (!upserts.has(type)) this.registry.dispatch(type, [], ids);
    if (touched.length > 0) this.recent.update((current) => [...current, ...touched].slice(-RECENT_LIMIT));
  }

  private applyKv(namespace: string, key: string, value: unknown): void {
    const backend = activeLocalBackend();
    // A pending local write wins (the agent re-emits after it commits); a backend without a remote source is the web build.
    if (backend.applyRemote?.(namespace, key, value) !== true) return;
    this.persistence.adoptRemote(namespace, key, value);
  }
}

function push<V>(map: Map<string, V[]>, key: string, value: V): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

function settingValue(payload: unknown): unknown {
  return isRecord(payload) ? payload['value'] : null;
}

function settingRef(change: AgentAppliedChange): { namespace: string | undefined; key: string | undefined } {
  if (change.namespace !== undefined && change.key !== undefined) return { namespace: change.namespace, key: change.key };
  if (isRecord(change.payload) && typeof change.payload['namespace'] === 'string' && typeof change.payload['key'] === 'string') {
    return { namespace: change.payload['namespace'], key: change.payload['key'] };
  }
  const split = change.entityId.indexOf(':');
  return split > 0 ? { namespace: change.entityId.slice(0, split), key: change.entityId.slice(split + 1) } : { namespace: undefined, key: undefined };
}
