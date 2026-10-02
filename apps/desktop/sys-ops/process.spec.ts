import { beforeEach, describe, expect, it } from 'vitest';
import type { SysApplyContext, SysOpDefinition } from '../sys-mutation';
import { PROCESS_OPS, registerProcessOps } from './process';

type HelperResult = { ok: true; data: unknown } | { ok: false; error: string; code?: number };
type Handler = (params: Record<string, unknown>) => HelperResult;

let calls: { method: string; params: Record<string, unknown> }[];
let handlers: Record<string, Handler>;

const ok = (data: unknown = { ok: true }): HelperResult => ({ ok: true, data });
const fail = (error: string, code?: number): HelperResult => ({ ok: false, error, ...(code !== undefined ? { code } : {}) });

const ctx: SysApplyContext = {
  elevated: false,
  signal: new AbortController().signal,
  backup: async () => {},
  helper: async (method, params) => {
    calls.push({ method, params: params as Record<string, unknown> });
    const handler = handlers[method];
    return handler ? handler(params as Record<string, unknown>) : fail('Unknown method.');
  },
};

const op = (kind: string) => PROCESS_OPS.find((def) => def.kind === kind) as SysOpDefinition<any>;
const REF = { pid: 4321, startKey: '134000000000000000', name: 'notepad.exe' };
const methods = () => calls.map((call) => call.method);

beforeEach(() => {
  calls = [];
  handlers = {};
});

describe('registration', () => {
  it('registers every process op kind exactly once', () => {
    const kinds: string[] = [];
    registerProcessOps((def) => { kinds.push(def.kind); });
    expect(kinds.sort()).toEqual([
      'process.dump', 'process.end', 'process.end-tree', 'process.restart', 'process.resume',
      'process.set-affinity', 'process.set-priority', 'process.suspend',
    ]);
  });
});

describe('param validation', () => {
  it('rejects a malformed process reference', () => {
    for (const bad of [null, [], {}, { ...REF, pid: 0 }, { ...REF, pid: 1.5 }, { ...REF, startKey: 'abc' }, { ...REF, name: '' }]) {
      expect(() => op('process.end').validate(bad)).toThrow();
    }
    expect(op('process.end').validate(REF)).toEqual(REF);
  });

  it('rejects unknown priority classes and bad affinity masks', () => {
    expect(() => op('process.set-priority').validate({ ...REF, priorityClass: 'turbo' })).toThrow();
    expect(() => op('process.set-affinity').validate({ ...REF, affinityMask: '3' })).toThrow();
    expect(() => op('process.set-affinity').validate({ ...REF, affinityMask: '0x0' })).toThrow();
    expect(op('process.set-affinity').validate({ ...REF, affinityMask: '0xF' }).affinityMask).toBe('0xf');
  });

  it('rejects a relative or missing dump output path', () => {
    expect(() => op('process.dump').validate({ ...REF, outputPath: 'dump.dmp', full: false })).toThrow(/absolute/);
    expect(() => op('process.dump').validate({ ...REF, outputPath: '..\\dump.dmp', full: false })).toThrow(/absolute/);
    expect(() => op('process.dump').validate({ ...REF, outputPath: 'C:\\temp\\a.dmp', full: 'yes' })).toThrow();
    expect(op('process.dump').validate({ ...REF, outputPath: 'C:\\temp\\a.dmp', full: true }).full).toBe(true);
  });
});

describe('process.end', () => {
  it('previews an exact target without typed confirm for ordinary processes', async () => {
    const preview = await op('process.end').preview(REF, ctx);
    expect(preview).toMatchObject({ target: 'notepad.exe (PID 4321)', summary: 'End the process', noUndo: true, requiresElevation: false });
    expect(preview.typedConfirm).toBeUndefined();
    expect(preview.warnings ?? []).toEqual([]);
  });

  it('requires the exact name and warns for critical Windows processes', async () => {
    const preview = await op('process.end').preview({ ...REF, name: 'LSASS.exe' }, ctx);
    expect(preview.typedConfirm).toBe('LSASS.exe');
    expect(preview.warnings).toContain('This is a critical Windows process.');
  });

  it('warns when the target is DUDE itself', async () => {
    const preview = await op('process.end').preview({ ...REF, pid: process.pid }, ctx);
    expect(preview.warnings?.some((warning) => warning.includes('DUDE itself'))).toBe(true);
  });

  it('terminates through the helper with the verified reference', async () => {
    handlers['proc.terminate'] = () => ok();
    const result = await op('process.end').apply(REF, null, ctx);
    expect(result.outcome).toBe('applied');
    expect(calls).toEqual([{ method: 'proc.terminate', params: { pid: 4321, startKey: REF.startKey } }]);
  });

  it('maps 1168 to conflict and access denied to a failure with a relaunch hint', async () => {
    handlers['proc.terminate'] = () => fail('gone', 1168);
    expect(await op('process.end').apply(REF, null, ctx)).toMatchObject({ outcome: 'conflict', message: 'Already exited or PID reused.' });
    handlers['proc.terminate'] = () => fail('Access is denied.', 5);
    const denied = await op('process.end').apply(REF, null, ctx);
    expect(denied.outcome).toBe('failed');
    expect(denied.message).toContain('Relaunch as Administrator');
    handlers['proc.terminate'] = () => fail('boom');
    expect(await op('process.end').apply(REF, null, ctx)).toMatchObject({ outcome: 'failed', message: 'boom' });
  });
});

describe('process.end-tree', () => {
  const tree = [
    { pid: 10, startKey: '1', name: 'child.exe' },
    { pid: 11, startKey: '2', name: 'grandchild.exe' },
    { pid: 12, startKey: '3', name: 'sibling.exe' },
  ];

  it('previews the descendant count and list', async () => {
    handlers['proc.tree'] = () => ok({ descendants: tree });
    const preview = await op('process.end-tree').preview(REF, ctx);
    expect(preview.summary).toBe('End the process and its 3 descendant(s)');
    expect(preview.before).toContain('grandchild.exe (PID 11)');
    expect(preview.noUndo).toBe(true);
  });

  it('caps the listed descendants and requires typed confirm for critical roots', async () => {
    handlers['proc.tree'] = () => ok({ descendants: Array.from({ length: 30 }, (_, i) => ({ pid: 100 + i, startKey: String(i), name: 'x.exe' })) });
    const preview = await op('process.end-tree').preview({ ...REF, name: 'services.exe' }, ctx);
    expect(preview.summary).toContain('30 descendant(s)');
    expect(preview.before).toContain('and 10 more');
    expect(preview.typedConfirm).toBe('services.exe');
  });

  it('blocks the preview when the root has already exited', async () => {
    handlers['proc.tree'] = () => fail('gone', 1168);
    expect((await op('process.end-tree').preview(REF, ctx)).blockedReason).toContain('already exited');
  });

  it('terminates descendants leaf-first, then the root', async () => {
    handlers['proc.tree'] = () => ok({ descendants: tree });
    handlers['proc.terminate'] = () => ok();
    const result = await op('process.end-tree').apply(REF, null, ctx);
    expect(result.outcome).toBe('applied');
    expect(calls.filter((call) => call.method === 'proc.terminate').map((call) => call.params['pid'])).toEqual([12, 11, 10, 4321]);
  });

  it('reports partial failures per child and still ends the root', async () => {
    handlers['proc.tree'] = () => ok({ descendants: tree });
    handlers['proc.terminate'] = (params) => (params['pid'] === 11 ? fail('Access is denied.', 5) : ok());
    const result = await op('process.end-tree').apply(REF, null, ctx);
    expect(result.outcome).toBe('failed');
    expect(result.message).toContain('Ended 3 of 4');
    expect(result.message).toContain('grandchild.exe (PID 11)');
    expect(calls.at(-1)?.params['pid']).toBe(4321);
  });

  it('is a conflict when the root is already gone', async () => {
    handlers['proc.tree'] = () => fail('gone', 1168);
    expect((await op('process.end-tree').apply(REF, null, ctx)).outcome).toBe('conflict');
  });
});

describe('process.restart', () => {
  const info = { imagePath: 'C:\\Windows\\notepad.exe', commandLine: '"C:\\Windows\\notepad.exe" a.txt', currentDirectory: 'C:\\work', environment: { A: '1' } };

  it('is blocked when the command line is unavailable', async () => {
    handlers['proc.startInfo'] = () => ok({ ...info, commandLine: null });
    const preview = await op('process.restart').preview(REF, ctx);
    expect(preview.blockedReason).toBe('Cannot restart: command line unavailable.');
    expect(preview.noUndo).toBe(true);
  });

  it('is blocked when the helper cannot read the process', async () => {
    handlers['proc.startInfo'] = () => fail('Access is denied.', 5);
    expect((await op('process.restart').preview(REF, ctx)).blockedReason).toContain('Cannot restart');
  });

  it('shows the command line and relaunches with the captured launch info', async () => {
    handlers['proc.startInfo'] = () => ok(info);
    handlers['proc.terminate'] = () => ok();
    handlers['proc.create'] = () => ok({ pid: 999, startKey: '5' });
    const preview = await op('process.restart').preview(REF, ctx);
    expect(preview.blockedReason).toBeUndefined();
    expect(preview.after).toBe(info.commandLine);
    calls = [];
    const result = await op('process.restart').apply(REF, preview.precondition, ctx);
    expect(result).toMatchObject({ outcome: 'applied', after: 'Relaunched as PID 999' });
    expect(result.undo).toBeUndefined();
    expect(methods()).toEqual(['proc.terminate', 'proc.create']);
    expect(calls[1].params).toEqual({ imagePath: info.imagePath, commandLine: info.commandLine, currentDirectory: 'C:\\work', environment: { A: '1' } });
  });

  it('does not relaunch when the process is already gone, and reports a failed relaunch', async () => {
    handlers['proc.startInfo'] = () => ok(info);
    const { precondition } = await op('process.restart').preview(REF, ctx);
    handlers['proc.terminate'] = () => fail('gone', 1168);
    expect((await op('process.restart').apply(REF, precondition, ctx)).outcome).toBe('conflict');
    expect(methods()).not.toContain('proc.create');
    handlers['proc.terminate'] = () => ok();
    handlers['proc.create'] = () => fail('The system cannot find the file specified.', 2);
    const result = await op('process.restart').apply(REF, precondition, ctx);
    expect(result.outcome).toBe('failed');
    expect(result.message).toContain('could not be relaunched');
  });
});

describe('process.suspend / process.resume', () => {
  it('records the inverse as undo', async () => {
    handlers['proc.suspend'] = () => ok();
    handlers['proc.resume'] = () => ok();
    const suspended = await op('process.suspend').apply(REF, null, ctx);
    expect(suspended.undo).toEqual({ kind: 'process.resume', params: { pid: 4321, startKey: REF.startKey, name: 'notepad.exe' } });
    const resumed = await op('process.resume').apply(REF, null, ctx);
    expect(resumed.undo).toEqual({ kind: 'process.suspend', params: { pid: 4321, startKey: REF.startKey, name: 'notepad.exe' } });
    expect(methods()).toEqual(['proc.suspend', 'proc.resume']);
  });

  it('is reversible in preview and warns (without typed confirm) for critical processes', async () => {
    const preview = await op('process.suspend').preview({ ...REF, name: 'csrss.exe' }, ctx);
    expect(preview).toMatchObject({ summary: 'Suspend the process', noUndo: false });
    expect(preview.typedConfirm).toBeUndefined();
    expect(preview.warnings?.[0]).toContain('critical');
    expect((await op('process.resume').preview(REF, ctx)).summary).toBe('Resume the process');
  });

  it('maps a vanished process to conflict', async () => {
    handlers['proc.suspend'] = () => fail('gone', 1168);
    expect((await op('process.suspend').apply(REF, null, ctx)).outcome).toBe('conflict');
  });
});

describe('process.set-priority', () => {
  it('records the previous class as undo', async () => {
    handlers['proc.setPriority'] = () => ok({ ok: true, previous: 'normal' });
    const result = await op('process.set-priority').apply({ ...REF, priorityClass: 'high' }, null, ctx);
    expect(result).toMatchObject({ outcome: 'applied', before: 'normal', after: 'high' });
    expect(result.undo).toEqual({ kind: 'process.set-priority', params: { pid: 4321, startKey: REF.startKey, name: 'notepad.exe', priorityClass: 'normal' } });
    expect(calls[0].params).toEqual({ pid: 4321, startKey: REF.startKey, priorityClass: 'high' });
  });

  it('shows before and after in the preview', async () => {
    handlers['proc.startInfo'] = () => ok({ priorityClass: 'below-normal' });
    const preview = await op('process.set-priority').preview({ ...REF, priorityClass: 'high' }, ctx);
    expect(preview).toMatchObject({ before: 'below-normal', after: 'high' });
  });
});

describe('process.set-affinity', () => {
  it('records the previous mask as undo', async () => {
    handlers['proc.setAffinity'] = () => ok({ ok: true, previous: '0xff' });
    const result = await op('process.set-affinity').apply({ ...REF, affinityMask: '0x3' }, null, ctx);
    expect(result).toMatchObject({ outcome: 'applied', before: '0xff', after: '0x3' });
    expect(result.undo?.params).toEqual({ pid: 4321, startKey: REF.startKey, name: 'notepad.exe', affinityMask: '0xff' });
  });

  it('blocks a mask with processors that do not exist in preview', async () => {
    handlers['proc.startInfo'] = () => ok({ affinityMask: '0xff', systemAffinityMask: '0xff' });
    const bad = await op('process.set-affinity').preview({ ...REF, affinityMask: '0x1ff' }, ctx);
    expect(bad.blockedReason).toBe('Affinity mask includes processors that do not exist.');
    const good = await op('process.set-affinity').preview({ ...REF, affinityMask: '0xf' }, ctx);
    expect(good.blockedReason).toBeUndefined();
    expect(good.before).toBe('0xff');
  });

  it('surfaces the helper rejecting an out-of-range mask at apply time', async () => {
    handlers['proc.setAffinity'] = () => fail('Affinity mask includes processors that do not exist.');
    const result = await op('process.set-affinity').apply({ ...REF, affinityMask: '0x1ff' }, null, ctx);
    expect(result).toMatchObject({ outcome: 'failed', message: 'Affinity mask includes processors that do not exist.' });
    expect(result.undo).toBeUndefined();
  });
});

describe('process.dump', () => {
  const params = { ...REF, outputPath: 'C:\\temp\\notepad.dmp', full: false };

  it('previews as a one-way action naming the output path', async () => {
    const preview = await op('process.dump').preview(params, ctx);
    expect(preview).toMatchObject({ summary: 'Write a crash dump to C:\\temp\\notepad.dmp', noUndo: true });
    expect((await op('process.dump').preview({ ...params, full: true }, ctx)).warnings?.length).toBe(1);
  });

  it('reports the bytes written', async () => {
    handlers['proc.dump'] = () => ok({ bytes: 77715 });
    const result = await op('process.dump').apply(params, null, ctx);
    expect(result).toMatchObject({ outcome: 'applied', after: '77715 bytes written' });
    expect(calls[0].params).toEqual({ pid: 4321, startKey: REF.startKey, outputPath: params.outputPath, full: false });
  });

  it('fails cleanly when the helper cannot write the dump', async () => {
    handlers['proc.dump'] = () => fail('The output folder does not exist.');
    expect(await op('process.dump').apply(params, null, ctx)).toMatchObject({ outcome: 'failed', message: 'The output folder does not exist.' });
  });
});
