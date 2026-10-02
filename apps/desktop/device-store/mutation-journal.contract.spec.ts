vi.mock('electron', () => ({ app: { getPath: () => '' }, ipcMain: { handle: vi.fn() }, shell: {} }));

import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, readdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cleanupTemp, openReady, tempDir } from '../../device-agent/src/testing/test-utils';
import { createRpcServer } from '../../device-agent/src/rpc/server';
import { createMutationJournal, drainLegacyJournal, JsonJournal, type MutationJournal } from '../mutation-core';
import { StoreJournal } from './store-journal';
import { createInProcessClient, setDeviceStoreHost } from './store-client';

interface Entry { planId: string; appliedAt: string; title: string; undoneBy?: string }

const deps = { now: () => new Date(), randomBytes: (n: number) => new Uint8Array(randomBytes(n)) };

function installStore(): void {
  const store = openReady(tempDir(), { machineGuid: null });
  setDeviceStoreHost(createInProcessClient(createRpcServer(store, deps).handle));
}

const dirs: string[] = [];
function legacyDir(): string { const dir = mkdtempSync(join(tmpdir(), 'dude-journal-')); dirs.push(dir); return dir; }
const entry = (minute: number, title = `t${minute}`): Entry => ({ planId: randomUUID(), appliedAt: new Date(Date.UTC(2026, 0, 1, 0, minute)).toISOString(), title });

afterEach(() => { setDeviceStoreHost(null); cleanupTemp(); for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

const implementations: Array<[string, () => MutationJournal<Entry>]> = [
  ['JsonJournal', () => { const dir = legacyDir(); return new JsonJournal<Entry>(() => dir, 3); }],
  ['StoreJournal', () => { installStore(); return new StoreJournal<Entry>('fs', 3); }],
];

describe.each(implementations)('MutationJournal contract: %s', (_name, make) => {
  it('lists newest first and reads by id', async () => {
    const journal = make();
    const [a, b, c] = [entry(1), entry(3), entry(2)];
    for (const e of [a, b, c]) await journal.write(e);
    expect((await journal.list()).map((e) => e.title)).toEqual(['t3', 't2', 't1']);
    expect(await journal.read(b.planId)).toEqual(b);
    expect(await journal.read(randomUUID())).toBeNull();
    expect(await journal.read('not-an-id')).toBeNull();
  });

  it('write replaces an existing entry (update)', async () => {
    const journal = make();
    const a = entry(1);
    await journal.write(a);
    await journal.write({ ...a, undoneBy: 'x' });
    expect(await journal.list()).toEqual([{ ...a, undoneBy: 'x' }]);
  });

  it('removes one entry', async () => {
    const journal = make();
    const [a, b] = [entry(1), entry(2)];
    await journal.write(a); await journal.write(b);
    await journal.remove(a.planId);
    expect((await journal.list()).map((e) => e.planId)).toEqual([b.planId]);
  });

  it('trims the oldest beyond the cap and reports each removed entry', async () => {
    const journal = make();
    const all = [entry(1), entry(2), entry(3), entry(4), entry(5)];
    for (const e of all) await journal.write(e);
    const removed: string[] = [];
    await journal.trimTo(undefined, (e) => { removed.push(e.title); });
    expect(removed.sort()).toEqual(['t1', 't2']);
    expect((await journal.list()).map((e) => e.title)).toEqual(['t5', 't4', 't3']);
    await journal.trimTo(1);
    expect((await journal.list()).map((e) => e.title)).toEqual(['t5']);
  });
});

describe('createMutationJournal routing', () => {
  it('uses the JSON directory when the store is not ready and the store when it is', async () => {
    const dir = legacyDir();
    const journal = createMutationJournal<Entry>('sys', dir, 10);
    const degraded = entry(1);
    await journal.write(degraded);
    expect(readdirSync(dir)).toEqual([`${degraded.planId}.json`]);

    installStore();
    expect(await journal.list()).toEqual([]);
    const healthy = entry(2);
    await journal.write(healthy);
    expect(readdirSync(dir)).toEqual([`${degraded.planId}.json`]);
    expect(await journal.read(healthy.planId)).toEqual(healthy);
  });
});

describe('drainLegacyJournal', () => {
  it('does nothing while the store is not ready', async () => {
    const dir = legacyDir();
    const e = entry(1);
    writeFileSync(join(dir, `${e.planId}.json`), JSON.stringify(e));
    expect(await drainLegacyJournal('fs', dir)).toBe(0);
    expect(readdirSync(dir)).toHaveLength(1);
  });

  it('moves entries into the store, deletes the files, and is idempotent', async () => {
    const dir = legacyDir();
    installStore();
    const store = new StoreJournal<Entry>('fs', 10);
    const [a, b, existing] = [entry(1), entry(2), entry(3)];
    writeFileSync(join(dir, `${a.planId}.json`), JSON.stringify(a));
    writeFileSync(join(dir, `${b.planId}.json`), JSON.stringify(b));
    writeFileSync(join(dir, `${existing.planId}.json`), JSON.stringify(existing));
    writeFileSync(join(dir, `${randomUUID()}.json`), '{nope');
    await store.write(existing);

    expect(await drainLegacyJournal('fs', dir)).toBe(3);
    expect(readdirSync(dir)).toHaveLength(1);
    expect((await store.list()).map((e) => e.title)).toEqual(['t3', 't2', 't1']);
    expect(await drainLegacyJournal('fs', dir)).toBe(0);
    expect(await store.list()).toHaveLength(3);
  });

  it('a legacy copy of an entry replaces the stored one (recovers a degraded-session update)', async () => {
    const dir = legacyDir();
    installStore();
    const store = new StoreJournal<Entry>('sys', 10);
    const a = entry(1);
    await store.write(a);
    writeFileSync(join(dir, `${a.planId}.json`), JSON.stringify({ ...a, undoneBy: 'later' }));
    await drainLegacyJournal('sys', dir);
    expect((await store.read(a.planId))?.undoneBy).toBe('later');
  });
});
