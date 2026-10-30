import { randomBytes } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AgentStandbyStatus } from '@dude/contracts';
import { AGENT_METHODS } from '@dude/contracts';
import { StandbyError } from '../standby/standby-mirror.js';
import type { StandbyPuller } from '../standby/standby-puller.js';
import { cleanupTemp, openReady, tempDir } from '../testing/test-utils.js';
import { createRpcServer } from './server.js';

afterEach(cleanupTemp);

const NOW = new Date('2026-10-29T12:00:00.000Z');
const STATUS: AgentStandbyStatus = {
  phase: 'idle', folder: 'D:\\Standby', deviceId: '0190aaaa-0000-7000-8000-000000000001', lastAttemptAt: null, lastSuccessAt: null, nextRunAt: null, grantedAt: null,
  lastError: null, lastRunBytes: 0, mirrorBytes: 0, repositories: [], progress: null,
};

function server(standby?: Partial<StandbyPuller>) {
  const puller = { status: vi.fn(() => STATUS), pullNow: vi.fn(() => STATUS), setFolder: vi.fn(async () => STATUS), ...standby } as unknown as StandbyPuller;
  const rpc = createRpcServer(openReady(tempDir()), { now: () => NOW, randomBytes: (n) => new Uint8Array(randomBytes(n)), standby: puller });
  const call = (method: string, params: unknown) => rpc.handle({ id: 1, method, params: params as never } as never);
  return { call, puller };
}

describe('standby RPC methods', () => {
  it('are in the closed method table', () => {
    for (const m of ['standby.status', 'standby.pullNow', 'standby.setFolder']) expect(AGENT_METHODS).toContain(m);
  });

  it('read the status and ask for a run through the puller', async () => {
    const { call, puller } = server();
    expect(await call('standby.status', {})).toMatchObject({ ok: true, result: STATUS });
    expect(await call('standby.pullNow', {})).toMatchObject({ ok: true, result: STATUS });
    expect(puller.pullNow).toHaveBeenCalledOnce();
  });

  it('maps a puller refusal to its code', async () => {
    const { call } = server({ pullNow: vi.fn(() => { throw new StandbyError('not-configured', 'Choose a standby folder first.'); }) });
    expect(await call('standby.pullNow', {})).toMatchObject({ ok: false, error: { code: 'not-configured', message: 'Choose a standby folder first.' } });
  });

  it('passes a string or null folder to the puller and rejects anything else before it', async () => {
    const { call, puller } = server();
    expect(await call('standby.setFolder', { folder: 'D:\\Standby' })).toMatchObject({ ok: true });
    expect(await call('standby.setFolder', { folder: null })).toMatchObject({ ok: true });
    expect(puller.setFolder).toHaveBeenNthCalledWith(1, 'D:\\Standby');
    expect(puller.setFolder).toHaveBeenNthCalledWith(2, null);
    for (const bad of [{}, { folder: 5 }, { folder: ['x'] }, { folder: {} }]) {
      expect(await call('standby.setFolder', bad)).toMatchObject({ ok: false, error: { code: 'invalid-params' } });
    }
    expect(puller.setFolder).toHaveBeenCalledTimes(2);
  });

  it('maps a bad folder to folder-unavailable', async () => {
    const { call } = server({ setFolder: vi.fn(async () => { throw new StandbyError('folder-unavailable', 'The standby folder does not exist.'); }) });
    expect(await call('standby.setFolder', { folder: 'D:\\gone' })).toMatchObject({ ok: false, error: { code: 'folder-unavailable' } });
  });

  it('answer unavailable when the agent has no puller', async () => {
    const rpc = createRpcServer(openReady(tempDir()), { now: () => NOW, randomBytes: (n) => new Uint8Array(randomBytes(n)) });
    expect(await rpc.handle({ id: 1, method: 'standby.status', params: {} } as never)).toMatchObject({ ok: false, error: { code: 'unavailable' } });
  });
});
