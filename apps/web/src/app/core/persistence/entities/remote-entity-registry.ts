import { Injectable } from '@angular/core';
import type { EntityCollection, RemoteUpsert } from './entity-store';

type RemoteTarget = Pick<EntityCollection<unknown>, 'applyRemote'>;

/**
 * Lets the remote-changes port reach the entity collection of a record type without core naming any service.
 * A collection is created lazily (first inject of its service), and its boot records are stale once the agent
 * has applied remote changes, so changes for a type with no collection yet are kept and replayed on registration.
 */
@Injectable({ providedIn: 'root' })
export class RemoteEntityRegistry {
  private readonly targets = new Map<string, RemoteTarget>();
  private readonly backlog = new Map<string, { upserts: Map<string, RemoteUpsert>; deletes: Set<string> }>();

  register(entityType: string, target: RemoteTarget): void {
    this.targets.set(entityType, target);
    const waiting = this.backlog.get(entityType);
    if (!waiting) return;
    this.backlog.delete(entityType);
    target.applyRemote([...waiting.upserts.values()], [...waiting.deletes]);
  }

  /** Routes a batch to the collection of `entityType`, or holds it until that collection exists. */
  dispatch(entityType: string, upserts: readonly RemoteUpsert[], deletes: readonly string[]): void {
    const target = this.targets.get(entityType);
    if (target) {
      target.applyRemote(upserts, deletes);
      return;
    }
    let waiting = this.backlog.get(entityType);
    if (!waiting) this.backlog.set(entityType, (waiting = { upserts: new Map(), deletes: new Set() }));
    for (const u of upserts) {
      waiting.deletes.delete(u.entityId);
      waiting.upserts.set(u.entityId, u);
    }
    for (const id of deletes) {
      waiting.upserts.delete(id);
      waiting.deletes.add(id);
    }
  }
}
