import { randomBytes } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { AGENT_METHODS } from '@dude/contracts';
import type { AgentMethod, AgentMethodMap, AgentResponse } from '@dude/contracts';
import { cleanupTemp, openReady, tempDir } from '../testing/test-utils.js';
import { createRpcServer } from './server.js';

afterEach(cleanupTemp);

const deps = { now: () => new Date(), randomBytes: (n: number) => new Uint8Array(randomBytes(n)) };
let nextId = 1;

function make() {
  const server = createRpcServer(openReady(tempDir()), deps);
  async function call<M extends AgentMethod>(method: M, params: AgentMethodMap[M]['params'] = {} as AgentMethodMap[M]['params']): Promise<AgentResponse<M>> {
    return await server.handle({ id: nextId++, method, params }) as AgentResponse<M>;
  }
  return { server, call };
}

function ok<M extends AgentMethod>(response: AgentResponse<M>): AgentMethodMap[M]['result'] {
  if (!response.ok) throw new Error(`${response.error.code}: ${response.error.message}`);
  return response.result;
}

describe('rpc server envelope', () => {
  it('rejects unknown methods', async () => {
    const { server } = make();
    const r = await server.handle({ id: 7, method: 'fs.deleteEverything', params: {} });
    expect(r).toEqual({ id: 7, ok: false, error: { code: 'unknown-method', message: expect.any(String) } });
    expect((await server.handle({ id: 8, method: 'constructor', params: {} })).ok).toBe(false);
    expect((await server.handle({ id: 9, method: '__proto__', params: {} })).ok).toBe(false);
  });

  it('rejects malformed envelopes', async () => {
    const { server } = make();
    for (const bad of [null, 'x', 5, [], {}, { id: 'a', method: 'store.health' }, { id: 1 }, { id: 1, method: 4 }]) {
      const r = await server.handle(bad);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe('bad-request');
    }
    const r = await server.handle({ id: 3, method: 'store.health', params: 'nope' });
    expect(r.ok).toBe(false);
  });

  it('does not leak stacks on internal errors', async () => {
    const { call } = make();
    const r = await call('docs.set', { name: 'BAD NAME', value: 1 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('internal');
      expect(JSON.stringify(r)).not.toMatch(/\bat \w/);
    }
  });

  it('has a handler for every method (smoke: none answers unknown-method)', async () => {
    const { server } = make();
    for (const method of AGENT_METHODS) {
      if (method === 'store.shutdown') continue;
      const r = await server.handle({ id: 1, method, params: {} });
      if (!r.ok) expect(r.error.code).not.toBe('unknown-method');
    }
  });
});

describe('rpc server dispatch', () => {
  it('round-trips kv.commit to store.hydrate', async () => {
    const { call } = make();
    expect(ok(await call('kv.commit', { mutations: [{ namespace: 'tool.a', key: 'k', value: { x: 1 }, policy: 'local' }] }))).toEqual({ count: 1 });
    const boot = ok(await call('store.hydrate'));
    expect(boot.status).toBe('ready');
    expect(boot.device?.displayName).toBeTruthy();
    expect(boot.kv).toEqual([{ namespace: 'tool.a', key: 'k', value: { x: 1 } }]);
    expect(boot.records).toEqual([]);
  });

  it('commits entities and reports them in hydrate and health', async () => {
    const { call } = make();
    const res = ok(await call('entity.commit', { entityType: 'favorite', entityId: 'tool:x', op: 'upsert', payload: { id: 'tool:x', kind: 'tool', targetId: 'x', order: 0 } }));
    expect(res).toMatchObject({ ok: true, localRevision: 1 });
    expect(ok(await call('store.hydrate')).records).toHaveLength(1);
    expect(ok(await call('store.health')).outbox.pending).toBe(1);
    const bad = ok(await call('entity.commit', { entityType: 'nope', entityId: 'x', op: 'upsert', payload: {} }));
    expect(bad.ok).toBe(false);
    const many = ok(await call('entity.importMany', { entityType: 'favorite', items: [
      { entityId: 'tool:a', payload: { id: 'tool:a', kind: 'tool', targetId: 'a', order: 1 } },
      { entityId: 'tool:b', payload: { id: 'tool:b', kind: 'tool', targetId: 'b', order: 2 } },
    ] }));
    expect(many).toMatchObject({ ok: true, count: 2 });
  });

  it('serves history, journal, docs, secrets and reset', async () => {
    const { call } = make();
    expect(ok(await call('history.add', { entry: { id: 'h1', toolId: 't', createdAt: Date.now(), sizeBytes: 5, payload: { a: 1 } } }))).toMatchObject({ ok: true });
    expect(ok(await call('history.list', { toolId: 't' }))).toHaveLength(1);
    expect(ok(await call('history.get', { id: 'zzz' }))).toBeNull();

    const planId = '00000000-0000-4000-8000-000000000001';
    ok(await call('journal.append', { engine: 'fs', entry: { planId, appliedAt: '2025-01-01T00:00:00.000Z' } }));
    expect(ok(await call('journal.get', { engine: 'fs', planId }))).toMatchObject({ planId });
    expect(ok(await call('journal.trim', { engine: 'fs', keep: 0 })).removed).toHaveLength(1);

    ok(await call('docs.set', { name: 'preferences', value: { a: 1 } }));
    expect(ok(await call('docs.get', { name: 'preferences' }))).toEqual({ a: 1 });

    const status = ok(await call('secrets.set', { purpose: 'ai.llmApiKey', ciphertext: new Uint8Array([4, 5]) }));
    expect(status.isSet).toBe(true);
    expect(JSON.stringify(status)).not.toMatch(/ciphertext/);
    expect(ok(await call('secrets.getCiphertext', { purpose: 'ai.llmApiKey' })).ciphertext).toEqual(new Uint8Array([4, 5]));
    const badPurpose = await call('secrets.status', { purpose: 'other' });
    expect(badPurpose.ok).toBe(false);

    const preview = ok(await call('reset.preview', { kind: 'clear-data' }));
    expect(ok(await call('reset.apply', { kind: 'clear-data', digest: 'wrong' }))).toEqual({ ok: false, error: 'stale-preview' });
    expect(ok(await call('reset.apply', { kind: 'clear-data', digest: preview.digest }))).toEqual({ ok: true });
    expect(ok(await call('docs.get', { name: 'preferences' }))).toBeNull();
    expect(ok(await call('secrets.status', { purpose: 'ai.llmApiKey' })).isSet).toBe(true);
  });

  it('renames the device', async () => {
    const { call } = make();
    expect(ok(await call('device.rename', { displayName: 'Desk PC' }))).toEqual({ ok: true, displayName: 'Desk PC' });
    expect(ok(await call('store.hydrate')).device?.displayName).toBe('Desk PC');
  });

  it('tracks the clean-exit marker across launches', async () => {
    const { call } = make();
    expect(ok(await call('store.cleanExit', { action: 'launch' }))).toEqual({ previous: 'none' });
    expect(ok(await call('store.cleanExit', { action: 'launch' }))).toEqual({ previous: 'unclean' });
    expect(ok(await call('store.cleanExit', { action: 'quit' }))).toEqual({ previous: 'unclean' });
    expect(ok(await call('store.cleanExit', { action: 'check' }))).toEqual({ previous: 'clean' });
  });

  it('shutdown checkpoints, then every call returns closed', async () => {
    const { server, call } = make();
    expect(ok(await call('store.shutdown'))).toEqual({ ok: true });
    expect(server.closed).toBe(true);
    for (const method of ['store.health', 'store.hydrate', 'kv.commit'] as const) {
      const r = await call(method);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe('closed');
    }
  });
});

describe('rpc server unavailable mode', () => {
  it('serves only store.health (and shutdown)', async () => {
    const server = createRpcServer(null, { ...deps, unavailable: { status: 'incompatible', message: 'needs a newer DUDE' } });
    const health = await server.handle({ id: 1, method: 'store.health', params: {} });
    expect(health).toMatchObject({ ok: true, result: { status: 'incompatible', message: 'needs a newer DUDE' } });
    for (const method of ['store.hydrate', 'kv.commit', 'docs.get', 'reset.apply']) {
      const r = await server.handle({ id: 2, method, params: {} });
      expect(r).toMatchObject({ ok: false, error: { code: 'unavailable' } });
    }
    expect(await server.handle({ id: 3, method: 'store.shutdown', params: {} })).toMatchObject({ ok: true });
    expect(server.closed).toBe(true);
  });
});
