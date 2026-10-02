import { existsSync, readFileSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { tempDir } from '../server/test-helpers.js';
import { callAdmin, AdminCallError } from './admin-client.js';
import { AdminError, adminEndpointFile, adminEndpointPath, startAdminEndpoint } from './admin-endpoint.js';
import type { AdminEndpoint } from './admin-endpoint.js';
import { parseArgs } from '../cli/args.js';
import { runCli } from '../cli/run.js';

const endpoints: AdminEndpoint[] = [];
afterEach(async () => { for (const e of endpoints.splice(0)) await e.close(); });

async function start(dataDir: string, methods = {}): Promise<AdminEndpoint> {
  const endpoint = await startAdminEndpoint({
    dataDir,
    hubInstanceId: 'hub-1',
    methods: {
      status: () => ({ hubVersion: 't', pid: process.pid }),
      boom: () => { throw new AdminError('custom', 'Custom failure.'); },
      crash: () => { throw new Error('secret internals'); },
      ...methods,
    },
  });
  endpoints.push(endpoint);
  return endpoint;
}

function rawLines(endpointPath: string, lines: string[], expected: number): Promise<unknown[]> {
  return new Promise((resolve, reject) => {
    const socket = net.connect(endpointPath);
    const got: unknown[] = [];
    let buffer = '';
    socket.on('connect', () => socket.write(lines.join('')));
    socket.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf8');
      let i: number;
      while ((i = buffer.indexOf('\n')) >= 0) {
        got.push(JSON.parse(buffer.slice(0, i)));
        buffer = buffer.slice(i + 1);
      }
      if (got.length >= expected) { socket.destroy(); resolve(got); }
    });
    socket.on('error', reject);
    socket.on('close', () => resolve(got));
  });
}

describe('admin endpoint', () => {
  it('derives a stable per-directory pipe name on Windows and a socket path elsewhere', () => {
    const a = adminEndpointPath('C:\\Hub\\Data', 'win32');
    expect(a).toMatch(/^\\\\\.\\pipe\\dude-hub-admin-[0-9a-f]{12}$/);
    expect(adminEndpointPath('c:\\hub\\data', 'win32')).toBe(a);
    expect(adminEndpointPath('C:\\Other', 'win32')).not.toBe(a);
    expect(adminEndpointPath('/srv/hub', 'linux')).toBe(path.join('/srv/hub', 'run', 'admin.sock'));
  });

  it('round-trips a call and writes the endpoint file', async () => {
    const dir = tempDir('hub-admin-');
    const endpoint = await start(dir);
    const file = JSON.parse(readFileSync(adminEndpointFile(dir), 'utf8')) as { path: string; pid: number; startedAt: string };
    expect(file.path).toBe(endpoint.path);
    expect(file.pid).toBe(process.pid);
    expect(Number.isNaN(Date.parse(file.startedAt))).toBe(false);
    expect(await callAdmin(dir, 'status', {}, 3000)).toEqual({ hubVersion: 't', pid: process.pid });
  });

  it('reports unknown methods and method failures without leaking internals', async () => {
    const dir = tempDir('hub-admin-');
    await start(dir);
    await expect(callAdmin(dir, 'nope', {}, 3000)).rejects.toMatchObject({ code: 'unknown-method' });
    await expect(callAdmin(dir, 'boom', {}, 3000)).rejects.toMatchObject({ code: 'custom', message: 'Custom failure.' });
    const err = await callAdmin(dir, 'crash', {}, 3000).catch((e: unknown) => e as AdminCallError);
    expect(err).toMatchObject({ code: 'internal' });
    expect((err as Error).message).not.toContain('secret');
    await expect(callAdmin(dir, 'constructor', {}, 3000)).rejects.toMatchObject({ code: 'unknown-method' });
  });

  it('handles several requests per connection and malformed lines', async () => {
    const dir = tempDir('hub-admin-');
    const endpoint = await start(dir);
    const responses = await rawLines(
      endpoint.path,
      ['{"id":1,"method":"status"}\n', '{"id":"b","method":"nope"}\n', 'not json\n'],
      3,
    );
    expect(responses[0]).toMatchObject({ id: 1, ok: true });
    expect(responses[1]).toMatchObject({ id: 'b', ok: false, error: { code: 'unknown-method' } });
    expect(responses[2]).toMatchObject({ id: null, ok: false, error: { code: 'bad-request' } });
  });

  it('rejects lines over 64 KiB', async () => {
    const dir = tempDir('hub-admin-');
    const endpoint = await start(dir);
    const responses = await rawLines(endpoint.path, [`{"id":1,"method":"status","params":"${'x'.repeat(70 * 1024)}"}\n`], 1);
    expect(responses[0]).toMatchObject({ ok: false, error: { code: 'line-too-long' } });
  });

  it('answers hub-not-running when there is no endpoint file or nothing listens, and cleans up on close', async () => {
    const dir = tempDir('hub-admin-');
    await expect(callAdmin(dir, 'status', {}, 1000)).rejects.toMatchObject({ code: 'hub-not-running' });
    const endpoint = await start(dir);
    await endpoint.close();
    endpoints.length = 0;
    expect(existsSync(adminEndpointFile(dir))).toBe(false);
    await expect(callAdmin(dir, 'status', {}, 1000)).rejects.toMatchObject({ code: 'hub-not-running' });
  });

  it('answers hub-not-running for a stale endpoint file', async () => {
    const dir = tempDir('hub-admin-');
    const endpoint = await start(dir);
    const saved = readFileSync(adminEndpointFile(dir), 'utf8');
    await endpoint.close();
    endpoints.length = 0;
    const { mkdirSync, writeFileSync } = await import('node:fs');
    mkdirSync(path.dirname(adminEndpointFile(dir)), { recursive: true });
    writeFileSync(adminEndpointFile(dir), saved);
    await expect(callAdmin(dir, 'status', {}, 1000)).rejects.toMatchObject({ code: 'hub-not-running' });
  });
});

describe('dude-hub status', () => {
  it('parses the command', () => {
    expect(parseArgs(['status'])).toEqual({ command: 'status' });
    expect(parseArgs(['status', '--data-dir', 'x'])).toEqual({ command: 'status', dataDir: 'x' });
    expect(parseArgs(['status', '--data-dir=y'])).toEqual({ command: 'status', dataDir: 'y' });
    expect(() => parseArgs(['status', '--bogus'])).toThrow();
  });

  it('exits 0 with JSON when running and 2 when not', async () => {
    const dir = tempDir('hub-admin-');
    const writes: string[] = [];
    const out = process.stdout.write.bind(process.stdout);
    const err = process.stderr.write.bind(process.stderr);
    process.stdout.write = ((s: string) => { writes.push(String(s)); return true; }) as typeof process.stdout.write;
    process.stderr.write = (() => true) as typeof process.stderr.write;
    try {
      expect(await runCli(['status', '--data-dir', dir])).toBe(2);
      await start(dir);
      expect(await runCli(['status', '--data-dir', dir])).toBe(0);
    } finally {
      process.stdout.write = out;
      process.stderr.write = err;
    }
    expect(JSON.parse(writes.join(''))).toMatchObject({ hubVersion: 't' });
  });
});
