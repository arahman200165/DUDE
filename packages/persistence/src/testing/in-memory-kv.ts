import type { KeyValueRepository, KvEntry, KvKey, KvWriteMeta } from '../repositories/ports.js';

const SEP = '\u0000';

/** In-memory KeyValueRepository for tests and degraded mode. Values are structurally cloned on the way in and out. */
export class InMemoryKeyValueRepository implements KeyValueRepository {
  private readonly rows = new Map<string, { namespace: string; key: string; value: unknown; meta: KvWriteMeta }>();

  async get(namespace: string, key: string): Promise<unknown | undefined> {
    const row = this.rows.get(namespace + SEP + key);
    return row === undefined ? undefined : clone(row.value);
  }

  async set(namespace: string, key: string, value: unknown, meta: KvWriteMeta): Promise<void> {
    this.rows.set(namespace + SEP + key, { namespace, key, value: clone(value), meta });
  }

  async remove(namespace: string, key: string): Promise<void> {
    this.rows.delete(namespace + SEP + key);
  }

  async keys(nsPrefix?: string): Promise<KvKey[]> {
    return [...this.rows.values()]
      .filter(r => nsPrefix === undefined || r.namespace.startsWith(nsPrefix))
      .map(r => ({ namespace: r.namespace, key: r.key }));
  }

  async snapshot(): Promise<KvEntry[]> {
    return [...this.rows.values()].map(r => ({ namespace: r.namespace, key: r.key, value: clone(r.value) }));
  }
}

function clone<T>(value: T): T {
  return value === undefined ? value : JSON.parse(JSON.stringify(value));
}
