/**
 * Minimal in-memory CacheStorage for specs (jsdom has none). Holds request URLs only. The offline
 * services never read response bodies from Cache Storage, just which URLs exist.
 */
export class FakeCache {
  readonly urls = new Set<string>();

  async keys(): Promise<readonly Request[]> {
    return [...this.urls].map((url) => ({ url }) as Request);
  }

  async delete(request: Request | string): Promise<boolean> {
    return this.urls.delete(typeof request === 'string' ? request : request.url);
  }
}

export class FakeCacheStorage {
  readonly stores = new Map<string, FakeCache>();
  readonly deleted: string[] = [];

  seed(name: string, urls: readonly string[]): this {
    const cache = this.stores.get(name) ?? new FakeCache();
    for (const url of urls) cache.urls.add(url);
    this.stores.set(name, cache);
    return this;
  }

  async keys(): Promise<string[]> {
    return [...this.stores.keys()];
  }

  async open(name: string): Promise<FakeCache> {
    const cache = this.stores.get(name) ?? new FakeCache();
    this.stores.set(name, cache);
    return cache;
  }

  async delete(name: string): Promise<boolean> {
    this.deleted.push(name);
    return this.stores.delete(name);
  }
}
