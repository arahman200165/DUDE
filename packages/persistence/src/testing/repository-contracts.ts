import type {
  EntityCollectionRepository,
  HistoryRecord,
  HistoryRepository,
  HistoryRetention,
  KeyValueRepository,
  NetworkRunRecord,
  NetworkRunRepository,
  NetworkRunRetention,
} from '../repositories/ports.js';

/**
 * Host-neutral test harness: the caller injects vitest's (or any runner's) primitives so adapters
 * outside this package (SQLite, browser) can run the same behavior suites.
 */
export interface ContractHarness {
  describe(name: string, fn: () => void): void;
  it(name: string, fn: () => void | Promise<void>): void;
  expect(value: unknown): any;
}

const META = { policy: 'local', scope: 'environment' } as const;

export function kvRepositoryContract(name: string, factory: () => KeyValueRepository | Promise<KeyValueRepository>, t: ContractHarness): void {
  t.describe(`${name} KeyValueRepository contract`, () => {
    t.it('returns undefined for a missing key and round-trips JSON values', async () => {
      const repo = await factory();
      t.expect(await repo.get('ns', 'a')).toBeUndefined();
      await repo.set('ns', 'a', { x: [1, 'two', null] }, META);
      t.expect(await repo.get('ns', 'a')).toEqual({ x: [1, 'two', null] });
    });
    t.it('overwrites and removes', async () => {
      const repo = await factory();
      await repo.set('ns', 'a', 1, META);
      await repo.set('ns', 'a', 2, META);
      t.expect(await repo.get('ns', 'a')).toBe(2);
      await repo.remove('ns', 'a');
      t.expect(await repo.get('ns', 'a')).toBeUndefined();
      await repo.remove('ns', 'a');
    });
    t.it('isolates namespaces and filters keys by namespace prefix', async () => {
      const repo = await factory();
      await repo.set('tools.a', 'k', 1, META);
      await repo.set('tools.b', 'k', 2, META);
      await repo.set('other', 'k', 3, META);
      t.expect(await repo.get('tools.a', 'k')).toBe(1);
      const keys = await repo.keys('tools');
      t.expect(keys.length).toBe(2);
      t.expect((await repo.keys()).length).toBe(3);
    });
    t.it('snapshots every entry', async () => {
      const repo = await factory();
      await repo.set('n1', 'k1', 'v1', META);
      await repo.set('n2', 'k2', 'v2', META);
      const snap = await repo.snapshot();
      t.expect(snap.length).toBe(2);
      t.expect(snap).toContainEqual({ namespace: 'n1', key: 'k1', value: 'v1' });
    });
  });
}

export interface ContractEntity { id: string; v: number }

export function entityCollectionContract(name: string, factory: () => EntityCollectionRepository<ContractEntity> | Promise<EntityCollectionRepository<ContractEntity>>, t: ContractHarness): void {
  t.describe(`${name} EntityCollectionRepository contract`, () => {
    t.it('upserts, gets and lists', async () => {
      const repo = await factory();
      t.expect(await repo.list()).toEqual([]);
      await repo.upsert({ id: 'a', v: 1 });
      await repo.upsert({ id: 'a', v: 2 });
      await repo.upsert({ id: 'b', v: 3 });
      t.expect(await repo.get('a')).toEqual({ id: 'a', v: 2 });
      t.expect((await repo.list()).length).toBe(2);
      t.expect(await repo.get('missing')).toBeUndefined();
    });
    t.it('increases localRevision on every effective commit', async () => {
      const repo = await factory();
      const r1 = await repo.upsert({ id: 'a', v: 1 });
      const r2 = await repo.upsert({ id: 'a', v: 2 });
      const r3 = await repo.remove('a');
      t.expect(r2.localRevision).toBeGreaterThan(r1.localRevision);
      t.expect(r3.localRevision).toBeGreaterThan(r2.localRevision);
    });
    t.it('removing a missing id does not change the revision', async () => {
      const repo = await factory();
      const r1 = await repo.upsert({ id: 'a', v: 1 });
      const r2 = await repo.remove('nope');
      t.expect(r2.localRevision).toBe(r1.localRevision);
    });
    t.it('imports many values in one commit', async () => {
      const repo = await factory();
      const before = await repo.upsert({ id: 'seed', v: 0 });
      const result = await repo.importMany([{ id: 'a', v: 1 }, { id: 'b', v: 2 }, { id: 'seed', v: 9 }]);
      t.expect(result.localRevision).toBe(before.localRevision + 1);
      t.expect((await repo.list()).length).toBe(3);
      t.expect(await repo.get('seed')).toEqual({ id: 'seed', v: 9 });
    });
  });
}

const HISTORY_LIMITS: HistoryRetention = { maxPerTool: 3, maxTotal: 5, maxAgeMs: 1000, maxEntryBytes: 100 };

function historyEntry(id: string, toolId: string, createdAt: number, sizeBytes = 10): HistoryRecord {
  return { id, toolId, createdAt, sizeBytes, payload: { id } };
}

/** `factory` receives retention limits (see `HISTORY_LIMITS`) and a clock; the clock starts at 100 and may be advanced. */
export function historyRepositoryContract(
  name: string,
  factory: (retention: HistoryRetention, clock: { now(): number; set(ms: number): void }) => HistoryRepository | Promise<HistoryRepository>,
  t: ContractHarness,
): void {
  const make = (): Promise<{ repo: HistoryRepository; clock: { now(): number; set(ms: number): void } }> => {
    let current = 100;
    const clock = { now: () => current, set: (ms: number) => { current = ms; } };
    return Promise.resolve(factory(HISTORY_LIMITS, clock)).then(repo => ({ repo, clock }));
  };
  t.describe(`${name} HistoryRepository contract`, () => {
    t.it('adds, gets and lists newest first', async () => {
      const { repo } = await make();
      await repo.add(historyEntry('a', 'x', 10));
      await repo.add(historyEntry('b', 'y', 20));
      await repo.add(historyEntry('c', 'x', 30));
      t.expect((await repo.listByTool('x')).map(e => e.id)).toEqual(['c', 'a']);
      t.expect((await repo.listRecent(2)).map(e => e.id)).toEqual(['c', 'b']);
      t.expect((await repo.get('b'))?.toolId).toBe('y');
      t.expect(await repo.get('zzz')).toBeUndefined();
    });
    t.it('removes, clears a tool and clears all', async () => {
      const { repo } = await make();
      await repo.add(historyEntry('a', 'x', 10));
      await repo.add(historyEntry('b', 'y', 20));
      await repo.add(historyEntry('c', 'x', 30));
      await repo.remove('a');
      t.expect(await repo.get('a')).toBeUndefined();
      await repo.clearTool('x');
      t.expect((await repo.listRecent(10)).map(e => e.id)).toEqual(['b']);
      await repo.clear();
      t.expect(await repo.listRecent(10)).toEqual([]);
    });
    t.it('rejects entries over maxEntryBytes', async () => {
      const { repo } = await make();
      const result = await repo.add(historyEntry('big', 'x', 10, 101));
      t.expect(result.ok).toBe(false);
      t.expect(await repo.get('big')).toBeUndefined();
    });
    t.it('drops the oldest entries over the per-tool cap', async () => {
      const { repo } = await make();
      for (let i = 1; i <= 4; i++) await repo.add(historyEntry(`h${i}`, 'x', 10 * i));
      t.expect((await repo.listByTool('x')).map(e => e.id)).toEqual(['h4', 'h3', 'h2']);
    });
    t.it('drops the oldest entries over the total cap', async () => {
      const { repo } = await make();
      for (let i = 1; i <= 6; i++) await repo.add(historyEntry(`h${i}`, `tool${i}`, 10 * i));
      t.expect((await repo.listRecent(10)).map(e => e.id)).toEqual(['h6', 'h5', 'h4', 'h3', 'h2']);
    });
    t.it('drops entries older than maxAgeMs', async () => {
      const { repo, clock } = await make();
      await repo.add(historyEntry('old', 'x', 100));
      clock.set(5000);
      await repo.add(historyEntry('new', 'x', 5000));
      t.expect((await repo.listRecent(10)).map(e => e.id)).toEqual(['new']);
    });
  });
}

const NETWORK_LIMITS: NetworkRunRetention = { maxRuns: 3, maxAgeMs: 1000, maxTotalBytes: 100 };

function run(id: string, createdAt: number, sizeBytes = 10): NetworkRunRecord {
  return { id, createdAt, sizeBytes, payload: { id } };
}

export function networkRunRepositoryContract(
  name: string,
  factory: (retention: NetworkRunRetention, clock: { now(): number; set(ms: number): void }) => NetworkRunRepository | Promise<NetworkRunRepository>,
  t: ContractHarness,
): void {
  const make = (): Promise<{ repo: NetworkRunRepository; clock: { now(): number; set(ms: number): void } }> => {
    let current = 100;
    const clock = { now: () => current, set: (ms: number) => { current = ms; } };
    return Promise.resolve(factory(NETWORK_LIMITS, clock)).then(repo => ({ repo, clock }));
  };
  t.describe(`${name} NetworkRunRepository contract`, () => {
    t.it('adds, gets and lists newest first', async () => {
      const { repo } = await make();
      await repo.add(run('a', 10));
      await repo.add(run('b', 20));
      t.expect((await repo.list()).map(r => r.id)).toEqual(['b', 'a']);
      t.expect((await repo.get('a'))?.id).toBe('a');
      t.expect(await repo.get('nope')).toBeUndefined();
    });
    t.it('removes and clears', async () => {
      const { repo } = await make();
      await repo.add(run('a', 10));
      await repo.add(run('b', 20));
      await repo.remove('a');
      t.expect((await repo.list()).map(r => r.id)).toEqual(['b']);
      await repo.clear();
      t.expect(await repo.list()).toEqual([]);
    });
    t.it('rejects a run larger than maxTotalBytes', async () => {
      const { repo } = await make();
      t.expect((await repo.add(run('big', 10, 101))).ok).toBe(false);
      t.expect(await repo.list()).toEqual([]);
    });
    t.it('drops the oldest runs over the run cap', async () => {
      const { repo } = await make();
      for (let i = 1; i <= 4; i++) await repo.add(run(`r${i}`, 10 * i));
      t.expect((await repo.list()).map(r => r.id)).toEqual(['r4', 'r3', 'r2']);
    });
    t.it('drops the oldest runs over the byte cap', async () => {
      const { repo } = await make();
      await repo.add(run('a', 10, 60));
      await repo.add(run('b', 20, 60));
      t.expect((await repo.list()).map(r => r.id)).toEqual(['b']);
    });
    t.it('drops runs older than maxAgeMs', async () => {
      const { repo, clock } = await make();
      await repo.add(run('old', 100));
      clock.set(5000);
      await repo.add(run('new', 5000));
      t.expect((await repo.list()).map(r => r.id)).toEqual(['new']);
    });
  });
}
