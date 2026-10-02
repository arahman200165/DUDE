import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ app: { isPackaged: false } }));
import { SysHelperClient, windowsSysHelperPath, type SysChild } from './sys-helper';

class FakeChild extends EventEmitter {
  stdin = new PassThrough();
  stdout = new PassThrough();
  stderr = new PassThrough();
  killed = false;
  requests: { id: number; method: string; params: unknown }[] = [];
  constructor() {
    super();
    let buffer = '';
    this.stdin.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf8');
      let index: number;
      while ((index = buffer.indexOf('\n')) >= 0) { this.requests.push(JSON.parse(buffer.slice(0, index))); buffer = buffer.slice(index + 1); }
    });
  }
  reply(value: unknown): void { this.stdout.write(`${JSON.stringify(value)}\n`); }
  kill(): void { this.killed = true; this.emit('exit'); }
}
const asChild = (child: FakeChild) => child as unknown as SysChild;
const tick = () => new Promise((resolve) => setImmediate(resolve));

afterEach(() => vi.useRealTimers());

describe('SysHelperClient', () => {
  it('resolves out-of-order responses by id', async () => {
    const child = new FakeChild();
    const client = new SysHelperClient('h', () => asChild(child));
    const a = client.call('process.list', {});
    const b = client.call('net.tcp', undefined);
    await tick();
    expect(child.requests.map((r) => r.id)).toEqual([1, 2]);
    expect(child.requests[1]).toEqual({ id: 2, method: 'net.tcp', params: {} });
    child.reply({ id: 2, ok: true, result: 'second' });
    child.reply({ id: 1, ok: true, result: 'first' });
    expect(await b).toEqual({ ok: true, data: 'second' });
    expect(await a).toEqual({ ok: true, data: 'first' });
  });

  it('handles responses split across chunks and multiple lines per chunk, ignoring unknown ids and junk', async () => {
    const child = new FakeChild();
    const client = new SysHelperClient('h', () => asChild(child));
    const a = client.call('helper.info', {});
    await tick();
    child.stdout.write('not json\n{"id":99,"ok":true,"result":1}\n{"id":1,"ok":tr');
    child.stdout.write('ue,"result":{"x":"é"}}\n');
    expect(await a).toEqual({ ok: true, data: { x: 'é' } });
  });

  it('passes helper-reported errors through with the win32 code', async () => {
    const child = new FakeChild();
    const client = new SysHelperClient('h', () => asChild(child));
    const a = client.call('reg.enumKey', {});
    const b = client.call('reg.enumKey', {});
    await tick();
    child.reply({ id: 1, ok: false, error: 'Access is denied.', code: 5 });
    child.reply({ id: 2, ok: false, error: 'bad' });
    expect(await a).toEqual({ ok: false, error: 'Access is denied.', code: 5 });
    expect(await b).toEqual({ ok: false, error: 'bad' });
  });

  it('times out and drops the pending id', async () => {
    vi.useFakeTimers();
    const child = new FakeChild();
    const client = new SysHelperClient('h', () => asChild(child));
    const result = client.call('process.list', {}, 500);
    await vi.advanceTimersByTimeAsync(501);
    expect(await result).toEqual({ ok: false, error: 'Windows system helper timed out.' });
    child.reply({ id: 1, ok: true, result: 'late' }); // must be ignored without throwing
    await vi.advanceTimersByTimeAsync(1);
  });

  it('fails every pending call on exit, then respawns lazily', async () => {
    const children: FakeChild[] = [];
    const client = new SysHelperClient('h', () => { const c = new FakeChild(); children.push(c); return asChild(c); });
    const a = client.call('process.list', {});
    const b = client.call('net.udp', {});
    await tick();
    children[0].emit('exit');
    expect(await a).toEqual({ ok: false, error: 'Windows system helper exited.' });
    expect(await b).toEqual({ ok: false, error: 'Windows system helper exited.' });
    expect(children).toHaveLength(1);
    const c = client.call('helper.info', {});
    await tick();
    expect(children).toHaveLength(2);
    children[1].reply({ id: 3, ok: true, result: 'again' });
    expect(await c).toEqual({ ok: true, data: 'again' });
  });

  it('reports a missing binary', async () => {
    const child = new FakeChild();
    const client = new SysHelperClient('missing.exe', () => asChild(child));
    const result = client.call('helper.info', {});
    await tick();
    child.emit('error', Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' }));
    expect(await result).toEqual({ ok: false, error: 'Windows system helper is not installed.' });
    const thrower = new SysHelperClient('x', () => { throw new Error('boom'); });
    expect(await thrower.call('helper.info', {})).toEqual({ ok: false, error: 'Windows system helper is not installed.' });
  });

  it('kills the child when one stdout line exceeds 64 MB', async () => {
    const child = new FakeChild();
    const client = new SysHelperClient('h', () => asChild(child));
    const result = client.call('process.list', {});
    await tick();
    const block = 'x'.repeat(1024 * 1024);
    for (let i = 0; i < 65; i++) child.stdout.write(block);
    expect(await result).toEqual({ ok: false, error: 'Windows system helper exited.' });
    expect(child.killed).toBe(true);
  });

  it('close() ends stdin, kills the child, and fails pending calls', async () => {
    const child = new FakeChild();
    const client = new SysHelperClient('h', () => asChild(child));
    const result = client.call('process.list', {});
    await tick();
    client.close();
    expect(await result).toEqual({ ok: false, error: 'Windows system helper exited.' });
    expect(child.killed).toBe(true);
    expect(child.stdin.writableEnded).toBe(true);
  });

  it('resolves the dev helper path under build/', () => {
    expect(windowsSysHelperPath().replace(/\\/g, '/')).toMatch(/build\/windows-sys\.exe$/);
  });
});
