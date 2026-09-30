import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it, vi } from 'vitest';

const helperPath = resolve('build/windows-sys.exe');
const runnable = process.platform === 'win32' && existsSync(helperPath);
const mock = vi.hoisted(() => ({ userData: '' }));

vi.mock('electron', () => ({
  app: { getPath: () => mock.userData, getVersion: () => 'test', isPackaged: false },
  BrowserWindow: { fromWebContents: () => ({}) },
  ipcMain: { handle: () => undefined },
  shell: { showItemInFolder: () => undefined },
  dialog: {},
}));
vi.mock('./sys-helper', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./sys-helper')>();
  const client = new actual.SysHelperClient(resolve('build/windows-sys.exe'));
  return { ...actual, sysHelper: () => client };
});

import { sysHelper } from './sys-helper';
import { validateWriteRequest, writeBundle } from './sys-bundle';
import { allSectionsOn, DEFAULT_BUNDLE_OPTIONS } from '../src/shared-logic/system/bundle-types';

const SCRIPT = "const s=require('net').createServer().listen(0,'127.0.0.1',()=>{console.log(s.address().port)});setInterval(()=>{},1000)";

describe.skipIf(!runnable)('process diagnostic bundle against the real helper and a spawned process', () => {
  it('collects, streams a valid minidump and writes a readable ZIP', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dude-bundle-real-'));
    mock.userData = mkdtempSync(join(tmpdir(), 'dude-bundle-real-ud-'));
    const child: ChildProcess = spawn(process.execPath, ['-e', SCRIPT], { stdio: ['ignore', 'pipe', 'ignore'], env: { ...process.env, DUDE_BUNDLE_MARK: 'real-check-7f3' } });
    try {
      const port = await new Promise<number>((ok, fail) => { child.once('error', fail); child.stdout!.once('data', (chunk) => ok(Number(String(chunk).trim()))); });
      const list = await sysHelper().call('process.list', {});
      if (!list.ok) throw new Error(list.error);
      const found = (list.data as { processes: { pid: number; startKey: string }[] }).processes.find((p) => p.pid === child.pid)!;
      const savePath = join(dir, 'bundle.zip');
      const events: { phase: string }[] = [];
      const owner = { id: 1, isDestroyed: () => false, send: (_channel: string, payload: { phase: string }) => { events.push(payload); } };
      const request = validateWriteRequest({
        pid: found.pid, startKey: found.startKey, exportId: 'real-export-1', sections: allSectionsOn(), savePath,
        options: { ...DEFAULT_BUNDLE_OPTIONS, sampleSeconds: 2, eventHours: 1 },
      });
      const result = await writeBundle(owner, request, new AbortController().signal);
      const files = unzipSync(new Uint8Array(readFileSync(result.path)));
      const manifest = JSON.parse(strFromU8(files['manifest.json']));
      console.log('bundle', result.bytes, 'bytes;', manifest.sections.map((s: { id: string; status: string; bytes: number }) => `${s.id}:${s.status}:${s.bytes}`).join(' '), 'errors:', JSON.stringify(manifest.errors));
      // Every section that ran must have produced an entry; failures are reported, never fatal.
      const failed = new Set<string>(manifest.errors.map((e: { section: string }) => e.section));
      for (const section of manifest.sections as { id: string; file: string }[]) if (!failed.has(section.id)) expect(files[section.file], section.file).toBeDefined();
      expect(failed.has('minidump')).toBe(false);
      expect(strFromU8(files['process.dmp'].subarray(0, 4))).toBe('MDMP');
      expect(files['process.dmp'].length).toBeGreaterThan(10_000);
      expect(strFromU8(files['cmdline.txt'])).toContain('createServer');
      expect(JSON.parse(strFromU8(files['env.json']))['DUDE_BUNDLE_MARK']).toBe('real-check-7f3');
      const ports = JSON.parse(strFromU8(files['ports.json'])).entries as { localPort: number; state?: string }[];
      expect(ports.some((p) => p.localPort === port && p.state === 'LISTEN')).toBe(true);
      const samples = JSON.parse(strFromU8(files['samples.json'])).samples;
      expect(samples).toHaveLength(3);
      expect(JSON.parse(strFromU8(files['modules.json'])).modules.length).toBeGreaterThan(3);
      expect(JSON.parse(strFromU8(files['threads.json'])).threads.length).toBeGreaterThan(0);
      expect(JSON.parse(strFromU8(files['tree.json'])).ancestors.length).toBeGreaterThan(0);
      expect(events.at(-1)?.phase).toBe('done');
      const staging = join(mock.userData, 'bundle-staging');
      expect(existsSync(staging) ? readdirSync(staging) : []).toEqual([]);
    } finally {
      child.kill();
      await new Promise<void>((ok) => (child.exitCode !== null || child.killed ? ok() : child.once('exit', () => ok())));
      sysHelper().close();
      rmSync(dir, { recursive: true, force: true });
      rmSync(mock.userData, { recursive: true, force: true });
    }
  }, 120_000);
});
