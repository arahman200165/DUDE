import { randomBytes } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import type { CollabRelayFrame, CollabRelayState } from '@dude/contracts';
import { createCollabRelay } from '../hub/collab-socket.js';
import type { CollabHolder } from '../hub/collab-socket.js';
import type { HubRuntime } from '../hub/index.js';
import { cleanupTemp, openReady, tempDir } from '../testing/test-utils.js';
import { createRpcServer } from './server.js';

afterEach(cleanupTemp);

const NOW = new Date('2026-10-24T12:00:00.000Z');

function holder(): CollabHolder & { frames: CollabRelayFrame[]; states: CollabRelayState[] } {
  const frames: CollabRelayFrame[] = [];
  const states: CollabRelayState[] = [];
  return { id: Symbol('desktop'), frames, states, frame: (f) => { frames.push(f); }, state: (s) => { states.push(s); } };
}

/** An RPC server over a real relay whose gate is blocked, so no socket is ever opened. */
function server(gate: { reason: 'hub-offline' | 'needs-reconcile'; message: string } | null = { reason: 'hub-offline', message: 'offline' }) {
  const collab = createCollabRelay({ gate: () => gate, openSocket: () => Promise.reject(new Error('no network in this spec')) });
  const rpc = createRpcServer(openReady(tempDir()), { now: () => NOW, randomBytes: (n) => new Uint8Array(randomBytes(n)), hub: { collab } as unknown as HubRuntime });
  const call = (method: string, params: unknown, from?: CollabHolder) => rpc.handle({ id: 1, method, params: params as never } as never, from ? { holder: from } : undefined);
  return { call, collab };
}

describe('collab.* (PD-106)', () => {
  it('answers open with the gate refusal as a result, not an error', async () => {
    const { call } = server();
    expect(await call('collab.open', {}, holder())).toEqual({ id: 1, ok: true, result: { ok: false, reason: 'hub-offline', message: 'offline' } });
    const reconcile = server({ reason: 'needs-reconcile', message: 'reconcile' });
    expect(await reconcile.call('collab.open', {}, holder())).toMatchObject({ ok: true, result: { ok: false, reason: 'needs-reconcile' } });
  });

  it('needs a desktop connection to bind to', async () => {
    const { call } = server();
    for (const method of ['collab.open', 'collab.send']) {
      expect(await call(method, { kind: 'binary', base64: 'AQID' })).toMatchObject({ ok: false, error: { code: 'unavailable' } });
    }
    // Closing with no connection has nothing to let go of.
    expect(await call('collab.close', {})).toMatchObject({ ok: true, result: { ok: true } });
  });

  it('answers send from a connection that does not hold the socket with collab-not-open', async () => {
    const { call } = server(null);
    const stranger = holder();
    expect(await call('collab.send', { kind: 'control', text: JSON.stringify({ type: 'subscribe', channel: 1, doc: 'room:r1' }) }, stranger))
      .toMatchObject({ ok: false, error: { code: 'collab-not-open' } });
  });

  it('answers a malformed frame with invalid-params once the connection holds the socket', async () => {
    const { call, collab } = server(null);
    const desktop = holder();
    expect(await call('collab.open', {}, desktop)).toMatchObject({ ok: true, result: { ok: true } });
    for (const params of [{ kind: 'control', text: JSON.stringify({ type: 'hello', protocolVersion: 3, minHubProtocol: 3 }) }, { kind: 'binary', base64: '!!' }, { kind: 'text' }, {}]) {
      expect(await call('collab.send', params, desktop)).toMatchObject({ ok: false, error: { code: 'invalid-params' } });
    }
    expect(await call('collab.close', {}, desktop)).toMatchObject({ ok: true, result: { ok: true } });
    collab.stop();
  });

  it('is unavailable without Hub support', async () => {
    const rpc = createRpcServer(openReady(tempDir()), { now: () => NOW, randomBytes: (n) => new Uint8Array(randomBytes(n)) });
    expect(await rpc.handle({ id: 1, method: 'collab.open', params: {} }, { holder: holder() })).toMatchObject({ ok: false, error: { code: 'unavailable' } });
  });
});
