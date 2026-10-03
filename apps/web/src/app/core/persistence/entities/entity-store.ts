import { InjectionToken, Signal, inject } from '@angular/core';
import type { EntityCodec } from '@dude/persistence';
import { currentPlatformBridge } from '../../platform/platform-bridge.adapter';
import { BOOT_SNAPSHOT } from '../device-store/boot-snapshot';
import { PersistenceService } from '../persistence.service';
import { OutboxStatusService } from './outbox-status.service';
import { createBrowserEntityCollection } from './browser-entity-store';
import { createDeviceEntityCollection } from './device-entity-store';
import { RemoteEntityRegistry } from './remote-entity-registry';

export type EntityWriteResult =
  | { readonly ok: true; readonly backpressure?: boolean }
  | { readonly ok: false; readonly error: string };

/**
 * A synchronous, signal-backed collection of codec-decoded records. Mutations update `items` at once
 * (optimistic on desktop) and resolve once the store committed them.
 */
export interface EntityCollection<T> {
  readonly items: Signal<readonly T[]>;
  get(id: string): T | undefined;
  upsert(value: T): Promise<EntityWriteResult>;
  remove(id: string): Promise<EntityWriteResult>;
  /** Upserts many records; on desktop one store call (transaction) per chunk of at most 1000. */
  importMany(values: readonly T[]): Promise<EntityWriteResult>;
  /**
   * Applies changes another device made (already written to the Device Store by the agent, so this never commits,
   * journals or runs anything). `upserts` carry raw payloads that the codec decodes. A record with a local write
   * in flight is skipped: the agent has already decided the merged outcome and emits it again after the local commit.
   */
  applyRemote(upserts: readonly RemoteUpsert[], deletes: readonly string[]): void;
}

export interface RemoteUpsert {
  readonly entityId: string;
  readonly payload: unknown;
}

/** How a collection used to live as one blob under a single `local` key; kept for web storage and the desktop one-shot import. */
export interface LegacyBlob<T> {
  readonly namespace: string;
  readonly key: string;
  /** Raw items inside the blob; each is decoded individually by the codec. */
  toItems(blob: unknown): readonly unknown[];
  fromItems(items: readonly T[]): unknown;
}

export interface CollectionOptions<T, C = void> {
  /** Decode context for codecs that need the host (e.g. the home layout's panel catalog). */
  readonly context?: C;
  /** Stable display order for stores that do not preserve insertion order (the device store). */
  readonly compare?: (a: T, b: T) => number;
}

export interface EntityStore {
  collection<T, C = void>(codec: EntityCodec<T, C>, legacy: LegacyBlob<T>, options?: CollectionOptions<T, C>): EntityCollection<T>;
}

export const ENTITY_STORE = new InjectionToken<EntityStore>('DUDE entity store', {
  providedIn: 'root',
  factory: () => {
    const snapshot = inject(BOOT_SNAPSHOT);
    const persistence = inject(PersistenceService);
    const outbox = inject(OutboxStatusService);
    const registry = inject(RemoteEntityRegistry);
    const bridge = currentPlatformBridge();
    const store = bridge?.store;
    if (store && (snapshot.boot || snapshot.degradedReason)) {
      const persist = snapshot.boot?.status === 'ready' && !snapshot.degradedReason;
      return {
        collection: (codec, legacy, options) => {
          const collection = createDeviceEntityCollection({ codec, legacy, options, boot: snapshot.boot, bridge: store, persist, outbox });
          registry.register(codec.entityType, collection);
          return collection;
        },
      };
    }
    return { collection: (codec, legacy, options) => createBrowserEntityCollection(persistence, codec, legacy, options?.context) };
  },
});
