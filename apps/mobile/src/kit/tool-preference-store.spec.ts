import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { TOOL_METADATA } from '@dude/tool-registry';
import { ToolInputStore } from '../tools-host/tool-input-store';
import type { SqlConnection, SqlDatabase, SqlValue } from '../storage/sql';
import { MobileStore } from '../storage/store';
import {
  PREFS_KEY, ToolPreferenceStore, defaultPreferenceDecode, resolveToolPreference, type PreferenceToolInfo, type ToolSettingsPort,
} from './tool-preference-store';

const TOOLS: readonly PreferenceToolInfo[] = [
  { id: 'synced', persistence: { preferences: 'local' } },
  { id: 'memory-session', persistence: { preferences: 'session' } },
  { id: 'memory-none', persistence: { preferences: 'none' } },
  { id: 'memory-choice', persistence: { preferences: 'user-choice' } },
  { id: 'secure', persistence: { preferences: 'secure-local' } },
  { id: 'overridden', persistence: { preferences: 'local' }, settingScopes: { token: { scope: 'device' }, scratch: { scope: 'local-only' }, shared: { scope: 'environment' } } },
  { id: 'undeclared' },
];

describe('resolveToolPreference', () => {
  it('local preferences are environment scope and stored in the synced settings KV', () => {
    expect(resolveToolPreference('synced', 'mode', TOOLS)).toEqual({ policy: 'local', scope: 'environment', storage: 'synced-kv' });
  });
  it('session, user-choice and none are local-only and stay in memory', () => {
    for (const id of ['memory-session', 'memory-none', 'memory-choice']) {
      expect(resolveToolPreference(id, 'mode', TOOLS)).toMatchObject({ scope: 'local-only', storage: 'memory' });
    }
  });
  it('secure-local resolves to device scope and is not persisted on mobile', () => {
    expect(resolveToolPreference('secure', 'mode', TOOLS)).toMatchObject({ policy: 'secure-local', scope: 'device', storage: 'memory' });
  });
  it('honours manifest settingScopes overrides per key', () => {
    expect(resolveToolPreference('overridden', 'mode', TOOLS).storage).toBe('synced-kv');
    expect(resolveToolPreference('overridden', 'shared', TOOLS).storage).toBe('synced-kv');
    expect(resolveToolPreference('overridden', 'token', TOOLS)).toMatchObject({ scope: 'device', storage: 'memory' });
    expect(resolveToolPreference('overridden', 'scratch', TOOLS)).toMatchObject({ scope: 'local-only', storage: 'memory' });
  });
  it('treats an undeclared policy and an unknown tool as session (memory only)', () => {
    expect(resolveToolPreference('undeclared', 'mode', TOOLS)).toMatchObject({ policy: 'session', storage: 'memory' });
    expect(resolveToolPreference('no-such-tool', 'mode', TOOLS).storage).toBe('memory');
  });
  it('resolves real manifests: base64 mode syncs, jwt (none) does not', () => {
    expect(resolveToolPreference('base64', 'mode', TOOL_METADATA).storage).toBe('synced-kv');
    expect(resolveToolPreference('jwt', 'mode', TOOL_METADATA).storage).toBe('memory');
  });
});

class FakePort implements ToolSettingsPort {
  readonly rows = new Map<string, unknown>();
  readonly writes: { namespace: string; key: string; value: unknown; meta: unknown }[] = [];
  fail = false;
  async get(namespace: string, key: string) { return this.rows.get(`${namespace}:${key}`); }
  async set(namespace: string, key: string, value: unknown, meta: { readonly policy: 'local'; readonly scope: 'environment' }) {
    if (this.fail) throw new Error('disk full');
    this.rows.set(`${namespace}:${key}`, value); this.writes.push({ namespace, key, value, meta });
  }
}
const make = () => { const memory = new ToolInputStore(); return { memory, store: new ToolPreferenceStore(memory, TOOLS) }; };

describe('ToolPreferenceStore', () => {
  it('keeps local-only preferences in ToolInputStore under the reserved __prefs sub-key and never writes the port', async () => {
    const { memory, store } = make(); const port = new FakePort(); store.bind(port);
    store.write('memory-session', 'mode', 'decode');
    await store.flush();
    expect(store.read('memory-session', 'mode')).toBe('decode');
    expect(memory.get('memory-session')[PREFS_KEY]).toEqual({ mode: 'decode' });
    expect(port.writes).toEqual([]);
    store.write('memory-session', 'indent', 4);
    expect(memory.get('memory-session')[PREFS_KEY]).toEqual({ mode: 'decode', indent: 4 });
    memory.clearAll(); // the background wipe also resets memory-only preferences
    expect(store.read('memory-session', 'mode')).toBeUndefined();
  });
  it('device-scoped keys are never persisted', async () => {
    const { store } = make(); const port = new FakePort(); store.bind(port);
    store.write('secure', 'mode', 'x'); store.write('overridden', 'token', 'x');
    await store.flush();
    expect(port.writes).toEqual([]);
  });
  it('writes environment-scoped keys to the KV under (toolId, key) with the local/environment meta', async () => {
    const { store } = make(); const port = new FakePort(); store.bind(port);
    store.write('synced', 'mode', 'decode');
    expect(store.read('synced', 'mode')).toBe('decode'); // immediate, before the write settles
    await store.flush();
    expect(port.writes).toEqual([{ namespace: 'synced', key: 'mode', value: 'decode', meta: { policy: 'local', scope: 'environment' } }]);
  });
  it('hydrates a stored value, and notifies subscribers', async () => {
    const { store } = make(); const port = new FakePort(); port.rows.set('synced:mode', 'decode');
    store.bind(port);
    let notified = 0; store.subscribe(() => { notified++; });
    await store.hydrate('synced', 'mode');
    expect(store.read('synced', 'mode')).toBe('decode');
    expect(notified).toBe(1);
  });
  it('a local write made while hydrating wins over the stored value', async () => {
    const { store } = make(); const port = new FakePort(); port.rows.set('synced:mode', 'stored');
    store.bind(port);
    const hydrating = store.hydrate('synced', 'mode');
    store.write('synced', 'mode', 'typed');
    await hydrating; await store.flush();
    expect(store.read('synced', 'mode')).toBe('typed');
  });
  it('keeps the in-memory value when the KV write fails, and retries on the next write', async () => {
    const { store } = make(); const port = new FakePort(); store.bind(port);
    port.fail = true; store.write('synced', 'mode', 'a'); await store.flush();
    expect(store.read('synced', 'mode')).toBe('a');
    port.fail = false; store.write('synced', 'mode', 'b'); await store.flush();
    expect(port.rows.get('synced:mode')).toBe('b');
  });
  it('without a port (memory workbench) environment keys live in the cache only', async () => {
    const { store } = make();
    store.write('synced', 'mode', 'a');
    await store.hydrate('synced', 'mode');
    expect(store.read('synced', 'mode')).toBe('a');
  });
  it('rebinding to another context drops cached values and re-reads requested keys from the new context', async () => {
    const { store } = make(); const first = new FakePort(), second = new FakePort();
    first.rows.set('synced:mode', 'one'); second.rows.set('synced:mode', 'two');
    store.bind(first, 'ctx-1'); await store.hydrate('synced', 'mode');
    expect(store.read('synced', 'mode')).toBe('one');
    store.bind(first, 'ctx-1'); // same context: no-op
    expect(store.read('synced', 'mode')).toBe('one');
    store.bind(second, 'ctx-2');
    expect(store.read('synced', 'mode')).toBeUndefined();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(store.read('synced', 'mode')).toBe('two');
  });
  it('refresh adopts a value another device delivered, but not while a write is pending', async () => {
    const { store } = make(); const port = new FakePort();
    store.bind(port); await store.hydrate('synced', 'mode');
    port.rows.set('synced:mode', 'from-hub');
    await store.refresh();
    expect(store.read('synced', 'mode')).toBe('from-hub');
    store.write('synced', 'mode', 'local');
    port.rows.set('synced:mode', 'newer-hub');
    await store.refresh(); // write still pending: skipped
    expect(store.read('synced', 'mode')).toBe('local');
    await store.flush();
  });
  it('defaultPreferenceDecode accepts only the default JSON shape', () => {
    expect(defaultPreferenceDecode('x')('y')).toBe('y');
    expect(defaultPreferenceDecode('x')(3)).toBeNull();
    expect(defaultPreferenceDecode(2)('2')).toBeNull();
    expect(defaultPreferenceDecode(true)(false)).toBe(false);
    expect(defaultPreferenceDecode<string[]>([])({})).toBeNull();
    expect(defaultPreferenceDecode<string[]>([])(['a'])).toEqual(['a']);
  });
});

class NodeSql implements SqlDatabase {
  readonly db = new DatabaseSync(':memory:');
  private queue = Promise.resolve();
  async exec(sql: string): Promise<void> { this.db.exec(sql); }
  async run(sql: string, ...values: SqlValue[]): Promise<void> { this.db.prepare(sql).run(...values); }
  async all<T>(sql: string, ...values: SqlValue[]): Promise<T[]> { return this.db.prepare(sql).all(...values) as T[]; }
  async first<T>(sql: string, ...values: SqlValue[]): Promise<T | null> { return this.db.prepare(sql).get(...values) as T ?? null; }
  async exclusive<T>(work: (tx: SqlConnection) => Promise<T>): Promise<T> {
    const previous = this.queue; let release!: () => void; this.queue = new Promise(resolve => { release = resolve; }); await previous;
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = await work(this); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
    finally { release(); }
  }
  async close(): Promise<void> { this.db.close(); }
}
const databases: NodeSql[] = [];
afterEach(async () => { for (const db of databases.splice(0)) { try { await db.close(); } catch { /* closed */ } } });

describe('environment preferences through the real mobile store', () => {
  it('persists in the settings KV under the web namespace/key and journals a syncable `setting` op', async () => {
    let sequence = 0;
    const db = new NodeSql(); databases.push(db);
    const store = await MobileStore.open(db, { deviceId: 'phone', id: () => `id-${++sequence}`, now: () => 1000, tools: TOOL_METADATA });
    const context = await store.activeContext();
    const repository = store.kvRepository(context.id);
    const port: ToolSettingsPort = { get: (namespace, key) => repository.get(namespace, key), set: (namespace, key, value, meta) => repository.set(namespace, key, value, meta) };
    const preferences = new ToolPreferenceStore(new ToolInputStore(), TOOL_METADATA);
    preferences.bind(port, context.id);
    preferences.write('base64', 'mode', 'decode');
    await preferences.flush();
    expect(await repository.get('base64', 'mode')).toBe('decode');
    const records = await store.listRecords(context.id);
    expect(records.find(record => record.entityType === 'setting' && record.entityId === 'base64:mode')?.payload).toEqual({ namespace: 'base64', key: 'mode', value: 'decode' });
    expect((await store.pending(context.id)).some(op => op.entityType === 'setting' && op.entityId === 'base64:mode')).toBe(true);

    // A fresh store instance (app restart) reads the same value back.
    const restarted = new ToolPreferenceStore(new ToolInputStore(), TOOL_METADATA);
    restarted.bind(port, context.id);
    await restarted.hydrate('base64', 'mode');
    expect(restarted.read('base64', 'mode')).toBe('decode');
  });
  it('a session-policy tool never reaches the KV or the outbox', async () => {
    let sequence = 0;
    const db = new NodeSql(); databases.push(db);
    const store = await MobileStore.open(db, { deviceId: 'phone', id: () => `id-${++sequence}`, now: () => 1000, tools: TOOL_METADATA });
    const context = await store.activeContext();
    const repository = store.kvRepository(context.id);
    const preferences = new ToolPreferenceStore(new ToolInputStore(), TOOL_METADATA);
    preferences.bind({ get: (n, k) => repository.get(n, k), set: (n, k, v, m) => repository.set(n, k, v, m) }, context.id);
    preferences.write('jwt', 'mode', 'verify');
    await preferences.flush();
    expect(await repository.get('jwt', 'mode')).toBeUndefined();
    expect(await store.pending(context.id)).toEqual([]);
  });
});
