import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { unzipSync, strFromU8 } from 'fflate';

const mock = vi.hoisted(() => ({
  userData: '',
  handles: new Map<string, (...args: any[]) => any>(),
  window: {} as object | null,
  revealed: [] as string[],
}));
vi.mock('electron', () => ({
  app: { getPath: () => mock.userData, getVersion: () => '9.9.9', isPackaged: false },
  BrowserWindow: { fromWebContents: () => mock.window },
  dialog: { showSaveDialog: vi.fn(), showOpenDialog: vi.fn() },
  ipcMain: { handle: (channel: string, handler: (...args: any[]) => any) => mock.handles.set(channel, handler) },
  shell: { showItemInFolder: (path: string) => mock.revealed.push(path) },
}));

const state = vi.hoisted(() => ({
  calls: [] as { method: string; params: any }[],
  elevated: true,
  failMethods: new Set<string>(),
  onDump: null as null | (() => Promise<void> | void),
  events: [] as any[],
  hideAfterLists: null as number | null,
  lists: 0,
}));
vi.mock('./sys-helper', () => ({
  sysHelper: () => ({
    call: async (method: string, params: any) => {
      state.calls.push({ method, params });
      if (state.failMethods.has(method)) return { ok: false, error: `${method} failed` };
      return respond(method, params);
    },
  }),
}));

const proc = (pid: number, parentPid: number, name: string, startKey: string) => ({
  pid, parentPid, name, sessionId: 1, threadCount: 3, handleCount: 40, createTimeMs: 1_000 + pid, startKey,
  kernelTime100ns: 0, userTime100ns: 0, workingSetBytes: 2_000_000, privateBytes: 8_000_000, basePriority: 8,
});
let cpuTicks = 0;
const FS = require('node:fs') as typeof import('node:fs');

async function respond(method: string, params: any): Promise<unknown> {
  switch (method) {
    case 'helper.info': return { ok: true, data: { version: '1', pid: 1, elevated: state.elevated, arch: 'x64' } };
    case 'process.list': {
      cpuTicks += 10_000_000;
      state.lists++;
      const hidden = state.hideAfterLists !== null && state.lists > state.hideAfterLists;
      return { ok: true, data: { sampledAtMs: Date.now(), logicalProcessors: 4, processes: [
        proc(50, 4, 'parent.exe', '500'), ...(hidden ? [] : [{ ...proc(100, 50, 'app.exe', '1000'), kernelTime100ns: cpuTicks }]), proc(200, 100, 'child.exe', '2000'), proc(300, 4, 'other.exe', '3000'),
      ] } };
    }
    case 'process.detail': return { ok: true, data: { pid: 100, startKey: '1000', imagePath: 'C:\\app\\app.exe', commandLine: 'app.exe --flag', currentDirectory: 'C:\\app', environment: { A: '1', SECRET: 'hunter2' }, user: null, integrityLevel: 'medium', elevated: false, wow64: false, priorityClass: 'normal', affinityMask: '0xf', systemAffinityMask: '0xf', errors: {} } };
    case 'process.modules': return { ok: true, data: { modules: [{ name: 'app.exe', path: 'C:\\app\\app.exe', baseAddress: '0x1000', size: 4096 }] } };
    case 'file.version': return { ok: true, data: { fixed: { fileVersion: '1.2.3.4', productVersion: '1.2' }, strings: { CompanyName: 'Acme' } } };
    case 'file.signature': return { ok: true, data: { status: 'signed', signer: 'Acme Inc' } };
    case 'process.threads': return { ok: true, data: { threads: [{ tid: 1, startAddress: '0x1', priority: 8, basePriority: 8, state: 'Waiting', waitReason: 'UserRequest', kernelTime100ns: 0, userTime100ns: 0, createTimeMs: 0 }] } };
    case 'process.handles': return { ok: true, data: { handles: [{ handle: '0x4', type: 'File', name: 'C:\\x' }], truncated: false } };
    case 'net.tcp': return { ok: true, data: { entries: [{ protocol: 'tcp', family: 4, localAddress: '127.0.0.1', localPort: 8080, remoteAddress: '0.0.0.0', remotePort: 0, state: 'LISTEN', pid: 100 }, { protocol: 'tcp', family: 4, localAddress: '127.0.0.1', localPort: 9, state: 'LISTEN', pid: 300 }] } };
    case 'net.udp': return { ok: true, data: { entries: [{ protocol: 'udp', family: 4, localAddress: '0.0.0.0', localPort: 5353, pid: 100 }] } };
    case 'evt.query': return { ok: true, data: { events: String(params.xpath).includes('Execution') ? state.events.filter((e) => e.processId === 100) : state.events, truncated: false } };
    case 'proc.dump': {
      FS.writeFileSync(params.outputPath, Buffer.concat([Buffer.from('MDMP'), Buffer.alloc(2_500_000, 7)]));
      await state.onDump?.();
      return { ok: true, data: { bytes: 2_500_004 } };
    }
    default: return { ok: false, error: `unexpected ${method}` };
  }
}

import { grantSavePath } from './fs-grants';
import { estimateBundle, registerSysBundleHandlers, validateWriteRequest, writeBundle, type BundleOwner } from './sys-bundle';
import { allSectionsOn, DEFAULT_BUNDLE_OPTIONS, type BundleToggles } from '../src/shared-logic/system/bundle-types';

let dir: string;
const owner = (): BundleOwner & { sent: any[] } => { const sent: any[] = []; return { id: 1, sent, isDestroyed: () => false, send: (_c: string, p: unknown) => { sent.push(p); } }; };
const fast = { ...DEFAULT_BUNDLE_OPTIONS, sampleSeconds: 1 };
const only = (...ids: (keyof BundleToggles)[]): BundleToggles => ({ ...(Object.fromEntries(Object.keys(allSectionsOn()).map((k) => [k, false])) as any), ...Object.fromEntries(ids.map((id) => [id, true])) });
const request = (over: Record<string, unknown> = {}) => ({ pid: 100, startKey: '1000', exportId: 'export-0001', sections: only('target', 'tree', 'cmdline', 'env', 'modules', 'threads', 'handles', 'ports', 'events', 'minidump'), options: fast, savePath: join(dir, 'bundle.zip'), ...over });
const stagingFiles = () => (existsSync(join(mock.userData, 'bundle-staging')) ? readdirSync(join(mock.userData, 'bundle-staging')) : []);
const unzip = (path: string) => unzipSync(new Uint8Array(readFileSync(path)));
const dumpCalls = () => state.calls.filter((c) => c.method === 'proc.dump');

beforeEach(() => {
  mock.handles.clear();
  mock.window = {};
  mock.revealed = [];
  dir = mkdtempSync(join(tmpdir(), 'dude-bundle-'));
  mock.userData = mkdtempSync(join(tmpdir(), 'dude-bundle-ud-'));
  state.calls = []; state.elevated = true; state.failMethods.clear(); state.onDump = null; state.events = []; state.hideAfterLists = null; state.lists = 0;
});
afterEach(() => { rmSync(dir, { recursive: true, force: true }); rmSync(mock.userData, { recursive: true, force: true }); });

describe('validateWriteRequest', () => {
  it('rejects bad ids, no sections, relative save paths and clamps options', () => {
    expect(() => validateWriteRequest(request({ pid: 0 }))).toThrow();
    expect(() => validateWriteRequest(request({ startKey: 'abc' }))).toThrow();
    expect(() => validateWriteRequest(request({ exportId: '../x' }))).toThrow();
    expect(() => validateWriteRequest(request({ sections: only() }))).toThrow(/at least one/i);
    expect(() => validateWriteRequest(request({ savePath: 'bundle.zip' }))).toThrow(/save/i);
    expect(validateWriteRequest(request({ options: { eventHours: 99999, sampleSeconds: -4, fullDump: 'yes' } })).options).toEqual({ eventHours: 168, sampleSeconds: 1, fullDump: false });
  });
});

describe('IPC surface', () => {
  const frame = {};
  const event = () => {
    const listeners = new Map<string, () => void>();
    return { listeners, sender: { id: 1, isDestroyed: () => false, send: vi.fn(), mainFrame: frame, once: (name: string, fn: () => void) => { listeners.set(name, fn); }, removeListener: (name: string) => { listeners.delete(name); } }, senderFrame: frame };
  };

  it('rejects every channel from a sender that is not an app window or is a subframe', async () => {
    registerSysBundleHandlers();
    mock.window = null;
    for (const channel of ['dude:sys-bundle:estimate', 'dude:sys-bundle:write']) expect(await mock.handles.get(channel)!(event(), request())).toEqual({ ok: false, error: 'Request rejected.' });
    expect(await mock.handles.get('dude:sys-bundle:cancel')!(event(), 'export-0001')).toBe(false);
    mock.window = {};
    const sub = event();
    sub.senderFrame = {};
    expect(await mock.handles.get('dude:sys-bundle:write')!(sub, request())).toEqual({ ok: false, error: 'Request rejected.' });
    expect(state.calls).toEqual([]);
  });

  it('requires a save-dialog grant, spends it, and never dumps without one', async () => {
    registerSysBundleHandlers();
    const write = mock.handles.get('dude:sys-bundle:write')!;
    const denied = await write(event(), request());
    expect(denied.ok).toBe(false);
    expect(denied.error).toMatch(/save/i);
    expect(dumpCalls()).toHaveLength(0);
    expect(existsSync(join(dir, 'bundle.zip'))).toBe(false);

    grantSavePath(join(dir, 'bundle.zip'));
    const granted = await write(event(), request({ sections: only('target', 'minidump') }));
    expect(granted.ok).toBe(true);
    expect(dumpCalls()).toHaveLength(1);
    expect(existsSync(join(dir, 'bundle.zip'))).toBe(true);
    // Single use: the same path needs a fresh dialog.
    const again = await write(event(), request({ exportId: 'export-0002', sections: only('target', 'minidump') }));
    expect(again.ok).toBe(false);
    expect(dumpCalls()).toHaveLength(1);
    // Only the exact file was granted.
    grantSavePath(join(dir, 'bundle.zip'));
    const other = await write(event(), request({ exportId: 'export-0003', savePath: join(dir, 'other.zip') }));
    expect(other.ok).toBe(false);
  });

  it('reveals only the last file it wrote', async () => {
    registerSysBundleHandlers();
    const reveal = mock.handles.get('dude:sys-bundle:reveal')!;
    expect(await reveal(event(), join(dir, 'bundle.zip'))).toBe(false);
    grantSavePath(join(dir, 'bundle.zip'));
    await mock.handles.get('dude:sys-bundle:write')!(event(), request({ sections: only('target') }));
    expect(await reveal(event(), join(dir, 'elsewhere.zip'))).toBe(false);
    expect(await reveal(event(), join(dir, 'bundle.zip'))).toBe(true);
    expect(mock.revealed).toEqual([join(dir, 'bundle.zip')]);
  });

  it('aborts a running export when the window is destroyed and leaves no partial or staging file', async () => {
    registerSysBundleHandlers();
    const ev = event();
    grantSavePath(join(dir, 'bundle.zip'));
    state.onDump = async () => { ev.listeners.get('destroyed')!(); };
    const result = await mock.handles.get('dude:sys-bundle:write')!(ev, request());
    expect(result.ok).toBe(false);
    expect(result.cancelled).toBe(true);
    expect(stagingFiles()).toEqual([]);
    expect(readdirSync(dir)).toEqual([]);
  });
});

describe('estimateBundle', () => {
  it('returns per-section field lists and sizes, and prices a full dump from private bytes', async () => {
    const estimate = await estimateBundle({ pid: 100, startKey: '1000', options: DEFAULT_BUNDLE_OPTIONS });
    expect(estimate.target.name).toBe('app.exe');
    expect(estimate.sections.map((s) => s.id)).toHaveLength(11);
    expect(estimate.sections.every((s) => s.fields.length > 0 && s.estimateBytes > 0)).toBe(true);
    expect(estimate.counts.ports).toBe(2);
    expect(estimate.counts.treeNodes).toBe(3);
    const full = await estimateBundle({ pid: 100, startKey: '1000', options: { ...DEFAULT_BUNDLE_OPTIONS, fullDump: true } });
    expect(full.sections.find((s) => s.id === 'minidump')!.estimateBytes).toBeGreaterThan(8_000_000);
    expect(dumpCalls()).toHaveLength(0);
  });

  it('flags handles when not elevated and rejects a mismatched start key', async () => {
    state.elevated = false;
    expect((await estimateBundle({ pid: 100, startKey: '1000', options: {} })).sections.find((s) => s.id === 'handles')!.note).toMatch(/elevated/i);
    await expect(estimateBundle({ pid: 100, startKey: '999', options: {} })).rejects.toThrow(/exited|reused/i);
  });
});

describe('writeBundle', () => {
  it('writes every selected section, streams a readable minidump and deletes the staging file', async () => {
    const o = owner();
    const result = await writeBundle(o, validateWriteRequest(request()), new AbortController().signal);
    expect(existsSync(`${result.path}.part`)).toBe(false);
    const files = unzip(result.path);
    expect(Object.keys(files).sort()).toEqual(['cmdline.txt', 'env.json', 'events.json', 'handles.json', 'manifest.json', 'modules.json', 'ports.json', 'process.dmp', 'target.json', 'threads.json', 'tree.json']);
    const manifest = JSON.parse(strFromU8(files['manifest.json']));
    expect(manifest.dudeVersion).toBe('9.9.9');
    expect(manifest.target).toEqual({ pid: 100, startKey: '1000', name: 'app.exe' });
    expect(manifest.errors).toEqual([]);
    expect(manifest.sections.every((s: any) => s.status === 'ok')).toBe(true);
    expect(strFromU8(files['process.dmp'].subarray(0, 4))).toBe('MDMP');
    expect(files['process.dmp'].length).toBe(2_500_004);
    expect(strFromU8(files['cmdline.txt'])).toContain('app.exe --flag');
    expect(JSON.parse(strFromU8(files['env.json']))).toEqual({ A: '1', SECRET: 'hunter2' });
    expect(JSON.parse(strFromU8(files['ports.json'])).entries.map((e: any) => e.localPort).sort()).toEqual([5353, 8080]);
    const modules = JSON.parse(strFromU8(files['modules.json'])).modules;
    expect(modules[0]).toMatchObject({ fileVersion: '1.2.3.4', company: 'Acme', signature: { status: 'signed' } });
    const tree = JSON.parse(strFromU8(files['tree.json']));
    expect(tree.ancestors.map((p: any) => p.pid)).toEqual([50]);
    expect(tree.descendants.map((p: any) => p.pid)).toEqual([200]);
    expect(stagingFiles()).toEqual([]);
    expect(o.sent.at(-1)).toMatchObject({ phase: 'done' });
  });

  it('omits toggled-off sections entirely, including the dump', async () => {
    const result = await writeBundle(owner(), validateWriteRequest(request({ sections: only('target', 'ports') })), new AbortController().signal);
    expect(Object.keys(unzip(result.path)).sort()).toEqual(['manifest.json', 'ports.json', 'target.json']);
    expect(dumpCalls()).toHaveLength(0);
  });

  it('records a failing section in the manifest without failing the export', async () => {
    state.failMethods.add('process.modules');
    const result = await writeBundle(owner(), validateWriteRequest(request()), new AbortController().signal);
    const files = unzip(result.path);
    expect(files['modules.json']).toBeUndefined();
    expect(files['process.dmp']).toBeDefined();
    const manifest = JSON.parse(strFromU8(files['manifest.json']));
    expect(manifest.errors).toEqual([{ section: 'modules', message: 'process.modules failed' }]);
    expect(manifest.sections.find((s: any) => s.id === 'modules')).toMatchObject({ status: 'error', bytes: 0 });
  });

  it('records a failing dump as a section error and still deletes its staging file', async () => {
    state.failMethods.add('proc.dump');
    const result = await writeBundle(owner(), validateWriteRequest(request()), new AbortController().signal);
    const manifest = JSON.parse(strFromU8(unzip(result.path)['manifest.json']));
    expect(manifest.errors.map((e: any) => e.section)).toEqual(['minidump']);
    expect(stagingFiles()).toEqual([]);
  });

  it('skips handles with a note when not elevated', async () => {
    state.elevated = false;
    const result = await writeBundle(owner(), validateWriteRequest(request({ sections: only('handles') })), new AbortController().signal);
    const files = unzip(result.path);
    expect(state.calls.some((c) => c.method === 'process.handles')).toBe(false);
    expect(JSON.parse(strFromU8(files['handles.json'])).note).toMatch(/elevated/i);
    expect(JSON.parse(strFromU8(files['manifest.json'])).sections[0]).toMatchObject({ id: 'handles', status: 'skipped' });
  });

  it('aborts on an identity mismatch before collecting or dumping anything', async () => {
    await expect(writeBundle(owner(), validateWriteRequest(request({ startKey: '424242' })), new AbortController().signal)).rejects.toThrow(/exited|reused/i);
    expect(dumpCalls()).toHaveLength(0);
    expect(state.calls.some((c) => c.method === 'process.detail')).toBe(false);
    expect(readdirSync(dir)).toEqual([]);
  });

  it('never dumps when the process is gone at the pre-dump identity re-check', async () => {
    state.hideAfterLists = 1;
    const result = await writeBundle(owner(), validateWriteRequest(request({ sections: only('target', 'minidump') })), new AbortController().signal);
    expect(dumpCalls()).toHaveLength(0);
    const manifest = JSON.parse(strFromU8(unzip(result.path)['manifest.json']));
    expect(manifest.errors).toEqual([{ section: 'minidump', message: expect.stringMatching(/exited|reused/i) }]);
  });

  it('samples CPU and memory once per second using the shared CPU-delta math', async () => {
    const result = await writeBundle(owner(), validateWriteRequest(request({ sections: only('samples'), options: { ...fast, sampleSeconds: 1 } })), new AbortController().signal);
    const samples = JSON.parse(strFromU8(unzip(result.path)['samples.json']));
    expect(samples.samples).toHaveLength(2);
    expect(samples.samples[0].cpuPercent).toBeNull();
    expect(typeof samples.samples[1].cpuPercent).toBe('number');
    expect(samples.samples[1].workingSetBytes).toBe(2_000_000);
  }, 10_000);

  it('keeps events from this PID or naming the image and drops the rest', async () => {
    const event = (recordId: string, over: Record<string, unknown>) => ({ recordId, timeCreated: `2026-01-01T00:00:0${recordId}Z`, level: 'error', providerName: 'p', eventId: 1, task: '', opcode: '', keywords: [], channel: 'Application', computer: 'x', userSid: null, processId: 5, threadId: 1, activityId: null, relatedActivityId: null, message: 'unrelated', xml: '<x/>', ...over });
    state.events = [event('1', { processId: 100 }), event('2', { message: 'Faulting application app.exe crashed' }), event('3', {})];
    const result = await writeBundle(owner(), validateWriteRequest(request({ sections: only('events') })), new AbortController().signal);
    const events = JSON.parse(strFromU8(unzip(result.path)['events.json']));
    expect(events.events.map((e: any) => e.recordId).sort()).toEqual(['1', '2']);
    expect(events.events[0].xml).toBeUndefined();
    const query = state.calls.find((c) => c.method === 'evt.query')!;
    expect(query.params.xpath).toContain('timediff(@SystemTime) <= 86400000');
  });

  it('removes the partial file, the staging dump and the grant target when the save location cannot be written', async () => {
    const result = writeBundle(owner(), validateWriteRequest(request({ savePath: join(dir, 'missing-folder', 'bundle.zip') })), new AbortController().signal);
    await expect(result).rejects.toThrow();
    expect(stagingFiles()).toEqual([]);
    expect(readdirSync(dir)).toEqual([]);
  });

  it('cancelling while the dump runs deletes the staging file and produces no bundle', async () => {
    const controller = new AbortController();
    state.onDump = () => controller.abort();
    await expect(writeBundle(owner(), validateWriteRequest(request()), controller.signal)).rejects.toThrow(/cancelled/i);
    expect(stagingFiles()).toEqual([]);
    expect(readdirSync(dir)).toEqual([]);
  });
});
