import { vi } from 'vitest';
vi.mock('../fs-grants', () => ({ isInsideGrantedRoot: () => true }));
import { beforeEach, describe, expect, it } from 'vitest';
import type { SysApplyContext } from '../sys-mutation';
import { registerFileLockOps } from './file-lock';
import { lockPathMatches } from '../file-locks';

let calls: { method: string; params: object }[];
let terminated = false;
let ownerPresent = true;
const params = { path: 'C:\\work\\held.txt', pid: 4321, startKey: '134000000000000000', name: 'holder.exe' };
const ctx: SysApplyContext = {
  elevated: false, signal: new AbortController().signal, backup: async () => {},
  helper: async (method, args) => {
    calls.push({ method, params: args });
    if (method === 'lock.rmList') return { ok: true, data: { owners: ownerPresent ? [{ pid: 4321, startKey: params.startKey, name: params.name }] : [] } };
    if (method === 'process.list') return { ok: true, data: { processes: [{ pid: 4321, startKey: params.startKey, name: params.name }] } };
    if (method === 'proc.terminate') { terminated = true; return { ok: true, data: {} }; }
    return { ok: false, error: 'Unexpected helper call.' };
  },
};
let op: ReturnType<typeof getOp>;
function getOp(kind = 'lock.end-owner') { let found: any; registerFileLockOps((def) => { if (def.kind === kind) found = def; }); return found; }

beforeEach(() => { calls = []; terminated = false; ownerPresent = true; op = getOp(); });

describe('lock.end-owner confirmation boundary', () => {
  it('preview rechecks both the lock owner and PID start key without terminating', async () => {
    const preview = await op.preview(params, ctx);
    expect(preview.blockedReason).toBeUndefined();
    expect(preview.precondition).toEqual({ pid: params.pid, startKey: params.startKey, path: params.path });
    expect(terminated).toBe(false);
  });

  it('only terminates after apply rechecks the same owner and start key', async () => {
    const preview = await op.preview(params, ctx);
    expect(terminated).toBe(false);
    const applied = await op.apply(params, preview.precondition, ctx);
    expect(applied.outcome).toBe('applied');
    expect(calls.at(-1)).toEqual({ method: 'proc.terminate', params: { pid: params.pid, startKey: params.startKey } });
    expect(terminated).toBe(true);
  });

  it('conflicts if the owner disappeared after preview', async () => {
    const preview = await op.preview(params, ctx);
    ctx.helper = async (method, args) => method === 'lock.rmList'
      ? { ok: true, data: { owners: [] } }
      : { ok: true, data: { processes: [{ pid: params.pid, startKey: params.startKey }] } };
    expect(await op.apply(params, preview.precondition, ctx)).toMatchObject({ outcome: 'conflict' });
    expect(terminated).toBe(false);
  });
});

describe('lock.release (Restart Manager graceful release)', () => {
  const rel = { path: 'C:\\work\\held.txt', restartAfter: false };
  const rmApp = { pid: 4321, startKey: '134000000000000000', name: 'Word', service: '', applicationType: 1, restartable: true, appStatus: 1, sessionId: 1 };
  let owners: object[];
  let released: object[];
  let rmStatus: { shutdownStatus: number; restartStatus: number; rebootReasons: number };
  let releaseOp: any;
  const helper: SysApplyContext['helper'] = async (method, args) => {
    calls.push({ method, params: args });
    if (method === 'lock.rmList') return { ok: true, data: { owners, rebootReasons: rmStatus.rebootReasons } };
    if (method === 'process.list') return { ok: true, data: { processes: [{ pid: 4321, startKey: rmApp.startKey, name: 'WINWORD.EXE' }] } };
    if (method === 'lock.rmRelease') { released.push(args); return { ok: true, data: rmStatus }; }
    return { ok: false, error: 'Unexpected helper call.' };
  };
  const rctx = (): SysApplyContext => ({ ...ctx, helper });

  beforeEach(() => { owners = [rmApp]; released = []; rmStatus = { shutdownStatus: 0, restartStatus: 0, rebootReasons: 0 }; releaseOp = getOp('lock.release'); });

  it('validates exact keys, an absolute path and a boolean restartAfter', () => {
    expect(() => releaseOp.validate({ path: 'relative.txt', restartAfter: false })).toThrow('absolute');
    expect(() => releaseOp.validate({ path: rel.path, restartAfter: 'yes' })).toThrow('boolean');
    expect(() => releaseOp.validate({ path: rel.path, restartAfter: true, force: true })).toThrow('must contain');
    expect(releaseOp.validate(rel)).toEqual(rel);
  });

  it('preview lists the exact apps, never releases, and blocks when nothing holds the path', async () => {
    const preview = await releaseOp.preview(rel, rctx());
    expect(preview.before).toContain('Word (PID 4321');
    expect(preview.noUndo).toBe(true);
    expect(preview.typedConfirm).toBeUndefined();
    expect(released).toEqual([]);
    owners = [];
    expect((await releaseOp.preview(rel, rctx())).blockedReason).toContain('no application');
  });

  it('blocks a critical system process owner and requires a typed name for a critical service or process', async () => {
    owners = [{ ...rmApp, applicationType: 1000 }];
    expect((await releaseOp.preview(rel, rctx())).blockedReason).toContain('critical');
    owners = [{ ...rmApp, applicationType: 3, service: 'RpcSs', name: 'Remote Procedure Call' }];
    expect((await releaseOp.preview(rel, rctx())).typedConfirm).toBe('RpcSs');
    owners = [rmApp];
    const helperCritical: SysApplyContext['helper'] = async (m, a) => m === 'process.list' ? { ok: true, data: { processes: [{ pid: 4321, startKey: rmApp.startKey, name: 'lsass.exe' }] } } : helper(m, a);
    expect((await releaseOp.preview(rel, { ...rctx(), helper: helperCritical })).typedConfirm).toBe('lsass.exe');
  });

  it('only calls lock.rmRelease from apply, after re-listing the same PIDs and start times', async () => {
    const preview = await releaseOp.preview({ ...rel, restartAfter: true }, rctx());
    expect(calls.some((c) => c.method === 'lock.rmRelease')).toBe(false);
    const applied = await releaseOp.apply({ ...rel, restartAfter: true }, preview.precondition, rctx());
    expect(applied.outcome).toBe('applied');
    expect(released).toEqual([{ path: rel.path, restartAfter: true }]);
  });

  it('conflicts without releasing when the locker set changed after the preview', async () => {
    const preview = await releaseOp.preview(rel, rctx());
    owners = [rmApp, { ...rmApp, pid: 9999, startKey: '1' }];
    expect(await releaseOp.apply(rel, preview.precondition, rctx())).toMatchObject({ outcome: 'conflict' });
    owners = [{ ...rmApp, startKey: '2' }];
    expect(await releaseOp.apply(rel, preview.precondition, rctx())).toMatchObject({ outcome: 'conflict' });
    expect(released).toEqual([]);
  });

  it('reports an app that refused or timed out as failed, never applied, and notes a needed reboot', async () => {
    const preview = await releaseOp.preview(rel, rctx());
    rmStatus = { shutdownStatus: 121, restartStatus: 0, rebootReasons: 0 };
    const failed = await releaseOp.apply(rel, preview.precondition, rctx());
    expect(failed.outcome).toBe('failed');
    expect(failed.message).toContain('Nothing was force-closed');
    rmStatus = { shutdownStatus: 0, restartStatus: 0, rebootReasons: 1 };
    expect((await releaseOp.apply(rel, preview.precondition, rctx())).after).toContain('reboot');
  });
});

describe('folder path matching', () => {
  it('accepts a descendant lock path and rejects a similarly prefixed sibling', () => {
    expect(lockPathMatches('C:\\work', 'C:\\work\\held.txt', true)).toBe(true);
    expect(lockPathMatches('C:\\work', 'C:\\work-old\\held.txt', true)).toBe(false);
  });
});
describe('child-process lock fixture', () => {
  it('keeps an open file handle alive until the fixture process is released', async () => {
    const { spawn } = await import('node:child_process');
    const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join, resolve } = await import('node:path');
    const dir = await mkdtemp(join(tmpdir(), 'dude-lock-'));
    const held = join(dir, 'held.txt');
    await writeFile(held, 'locked fixture');
    const child = spawn(process.execPath, [resolve('apps/desktop/__fixtures__/file-lock-holder.cjs'), held], { stdio: ['pipe', 'pipe', 'pipe'] });
    try {
      await new Promise<void>((ok, fail) => {
        child.once('error', fail);
        child.stdout.once('data', (data) => data.toString().includes('ready') ? ok() : fail(new Error('Fixture did not report ready.')));
      });
      expect(child.exitCode).toBeNull();
    } finally {
      child.stdin.end();
      await new Promise<void>((ok) => child.once('exit', () => ok()));
      await rm(dir, { recursive: true, force: true });
    }
  });
});
