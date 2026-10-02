import type { CommitResult, EntityCollectionRepository } from '../repositories/ports.js';

export interface InMemoryEntityCollectionOptions {
  /** When true (default) every effective change reports a synthetic outbox op id. */
  journaled?: boolean;
}

/**
 * In-memory EntityCollectionRepository. Each effective mutation bumps one collection-wide
 * `localRevision`; removing a missing id is a no-op that reports the current revision and no op.
 */
export class InMemoryEntityCollection<T> implements EntityCollectionRepository<T> {
  private readonly rows = new Map<string, T>();
  private revision = 0;
  private opCounter = 0;

  constructor(private readonly idOf: (value: T) => string, private readonly options: InMemoryEntityCollectionOptions = {}) {}

  async list(): Promise<T[]> {
    return [...this.rows.values()].map(clone);
  }

  async get(id: string): Promise<T | undefined> {
    const row = this.rows.get(id);
    return row === undefined ? undefined : clone(row);
  }

  async upsert(value: T): Promise<CommitResult> {
    this.rows.set(this.idOf(value), clone(value));
    return this.commit();
  }

  async remove(id: string): Promise<CommitResult> {
    if (!this.rows.delete(id)) return { localRevision: this.revision };
    return this.commit();
  }

  async importMany(values: T[]): Promise<CommitResult> {
    for (const value of values) this.rows.set(this.idOf(value), clone(value));
    return this.commit();
  }

  private commit(): CommitResult {
    this.revision += 1;
    if (this.options.journaled === false) return { localRevision: this.revision };
    this.opCounter += 1;
    return { localRevision: this.revision, outboxOpId: `op-${this.opCounter}` };
  }
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}
