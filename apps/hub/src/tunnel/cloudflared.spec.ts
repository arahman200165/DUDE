import { spawn } from 'node:child_process';
import { appendFileSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { REDACTED } from '../supervisor/redact.js';
import { pidAlive } from '../supervisor/kill-tree.js';
import type { Supervisor } from '../supervisor/supervisor.js';
import {
  CLOUDFLARED_ENV_ALLOWLIST, CLOUDFLARED_EXE, CLOUDFLARED_SHA256, CLOUDFLARED_VERSION, TunnelStartError, buildCloudflaredArgs, buildCloudflaredEnv,
  cloudflaredPidFile, createCloudflaredSupervisor, createReadyCheck, resolveCloudflaredPath, sha256File, verifyCloudflaredBinary,
} from './cloudflared.js';
import type { CloudflaredSupervisorOptions } from './cloudflared.js';

const STUB = path.join(import.meta.dirname, 'test-stub', 'cloudflared-stub.mjs');
// base64 of {"a":"account","t":"tunnel","s":"secret"}-shaped data: what a real connector token looks like.
const TOKEN = Buffer.from(JSON.stringify({ a: '0123456789abcdef0123456789abcdef', t: '11111111-2222-3333-4444-555555555555', s: 'c2VjcmV0LXNlY3JldC1zZWNyZXQtc2VjcmV0' })).toString('base64');

const supervisors: Supervisor[] = [];
const dirs: string[] = [];
afterEach(async () => {
  for (const supervisor of supervisors.splice(0)) await supervisor.stop().catch(() => undefined);
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
const tmp = (): string => { const dir = mkdtempSync(path.join(os.tmpdir(), 'ss-cf-')); dirs.push(dir); return dir; };
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

interface Made { supervisor: Supervisor; dataRoot: string; record: string; reads: { count: number } }
async function make(extra: Partial<CloudflaredSupervisorOptions> = {}, stubEnv: Record<string, string> = {}, token: string | null | (() => never) = TOKEN): Promise<Made> {
  const dataRoot = tmp();
  const record = path.join(dataRoot, 'record.json');
  const reads = { count: 0 };
  const supervisor = createCloudflaredSupervisor({
    secrets: { getText: () => { reads.count += 1; return typeof token === 'function' ? token() : token; } },
    dataRoot,
    exePath: STUB,
    expectedSha256: await sha256File(STUB),
    launch: (exe, args) => ({ command: process.execPath, args: [exe, ...args] }),
    expectedImagePath: process.execPath,
    parentEnv: { ...(process.env['SystemRoot'] ? { SystemRoot: process.env['SystemRoot'] } : {}), PATH: '/leak', NODE_OPTIONS: '--leak', SECRET_OF_THE_HUB: 'leak', TUNNEL_TOKEN: 'inherited-leak' },
    extraEnv: { STUB_RECORD_FILE: record, ...stubEnv },
    supervisor: { backoffMs: [20, 40, 80], readiness: { intervalMs: 20, startTimeoutMs: 8000 }, stopGraceMs: 1500 },
    ...extra,
  });
  supervisors.push(supervisor);
  return { supervisor, dataRoot, record, reads };
}
const recorded = (file: string): { argv: string[]; env: Record<string, string>; pid: number; cwd: string; shapeOk: boolean } => JSON.parse(readFileSync(file, 'utf8'));

describe('the pin', () => {
  it('matches the fetch script', () => {
    const script = readFileSync(path.join(import.meta.dirname, '..', '..', '..', '..', 'scripts', 'fetch-cloudflared.mjs'), 'utf8');
    expect(script).toContain(`CLOUDFLARED_VERSION = '${CLOUDFLARED_VERSION}'`);
    expect(script).toContain(`CLOUDFLARED_SHA256 = '${CLOUDFLARED_SHA256}'`);
    expect(CLOUDFLARED_SHA256).toMatch(/^[0-9a-f]{64}$/);
    expect(CLOUDFLARED_EXE).toBe('cloudflared.exe');
  });

  it('the vendored binary, when present, is the pinned one', async () => {
    const vendored = path.join(import.meta.dirname, '..', '..', '..', '..', 'build', 'vendor', 'cloudflared', CLOUDFLARED_EXE);
    if (!existsSync(vendored)) return; // not fetched in this checkout (`npm run hub:cloudflared`)
    await expect(verifyCloudflaredBinary(vendored)).resolves.toBeUndefined();
  }, 30_000);
});

describe('the command', () => {
  it('is exactly tunnel --no-autoupdate --metrics 127.0.0.1:<port> run, without the token', () => {
    expect(buildCloudflaredArgs(40123)).toEqual(['tunnel', '--no-autoupdate', '--metrics', '127.0.0.1:40123', 'run']);
  });

  it('passes the token only as TUNNEL_TOKEN and inherits only the allowlist', () => {
    const env = buildCloudflaredEnv({ SystemRoot: 'C:\\Windows', TEMP: 'C:\\t', PATH: 'x', NODE_OPTIONS: 'y', DUDE_SECRET: 'z', TUNNEL_TOKEN: 'old' }, 'tok');
    expect(env).toEqual({ SystemRoot: 'C:\\Windows', TEMP: 'C:\\t', TUNNEL_TOKEN: 'tok' });
    expect([...CLOUDFLARED_ENV_ALLOWLIST]).not.toContain('PATH');
  });

  it('locates the binary beside dude-hub.exe, beside the bundle, or in build/vendor', () => {
    const exists = (set: string[]) => (file: string): boolean => set.map((entry) => path.resolve(entry)).includes(path.resolve(file));
    const sea = path.resolve('install', 'dude-hub.exe');
    expect(resolveCloudflaredPath({ sea: true, execPath: sea, exists: exists([path.join('install', CLOUDFLARED_EXE)]) })).toBe(path.join(path.resolve('install'), CLOUDFLARED_EXE));
    expect(resolveCloudflaredPath({ sea: true, execPath: sea, exists: exists([]) })).toBeUndefined();
    const bundle = path.resolve('repo', 'dist', 'hub', 'dude-hub.cjs');
    const vendor = path.join('repo', 'build', 'vendor', 'cloudflared', CLOUDFLARED_EXE);
    expect(resolveCloudflaredPath({ sea: false, execPath: 'node', scriptPath: bundle, exists: exists([vendor]) })).toBe(path.resolve(vendor));
  });
});

describe('verifying the binary', () => {
  it('refuses a hash mismatch before reading the secret or spawning anything', async () => {
    const { supervisor, record, reads } = await make({ expectedSha256: 'f'.repeat(64) });
    await expect(supervisor.start()).rejects.toMatchObject({ name: 'TunnelStartError', code: 'binary-hash-mismatch' });
    expect(supervisor.status()).toMatchObject({ state: 'failed', pid: null, lastError: 'binary-hash-mismatch' });
    expect(reads.count).toBe(0);
    expect(existsSync(record)).toBe(false);
  });

  it('refuses a missing binary', async () => {
    const { supervisor } = await make({ exePath: path.join(tmp(), 'nope.exe') });
    await expect(supervisor.start()).rejects.toMatchObject({ code: 'binary-missing' });
    await expect(verifyCloudflaredBinary(path.join(tmp(), 'nope.exe'))).rejects.toBeInstanceOf(TunnelStartError);
  });

  it('checks the hash again on every automatic restart', async () => {
    const dir = tmp();
    const copy = path.join(dir, 'cloudflared-copy.mjs');
    copyFileSync(STUB, copy);
    const { supervisor } = await make({ exePath: copy, expectedSha256: await sha256File(copy) }, { STUB_CRASH_AFTER_MS: '700' });
    await supervisor.start();
    await supervisor.waitFor(['running'], 8000);
    appendFileSync(copy, '\n// tampered\n'); // changed on disk while the Hub runs
    await supervisor.waitFor(['failed'], 8000);
    expect(supervisor.status().lastError).toBe('binary-hash-mismatch');
  });

  it('is unavailable outside Windows (the Docker image)', async () => {
    const bare = createCloudflaredSupervisor({ secrets: { getText: () => TOKEN }, dataRoot: tmp(), platform: 'linux', exePath: STUB });
    supervisors.push(bare);
    await expect(bare.start()).rejects.toMatchObject({ code: 'unsupported-platform' });
    expect(bare.status()).toMatchObject({ state: 'failed', lastError: 'unsupported-platform' });
  });
});

describe('the connector token', () => {
  it('reaches the child only as TUNNEL_TOKEN, never in argv, and nothing else of the Hub leaks', async () => {
    const { supervisor, record, dataRoot } = await make();
    await supervisor.start();
    await supervisor.waitFor(['running'], 8000);
    const seen = recorded(record);
    expect(seen.shapeOk).toBe(true);
    expect(seen.argv).toEqual(['tunnel', '--no-autoupdate', '--metrics', seen.argv[3], 'run']);
    expect(seen.argv[3]).toMatch(/^127\.0\.0\.1:\d+$/);
    expect(JSON.stringify(seen.argv)).not.toContain(TOKEN);
    expect(seen.env['TUNNEL_TOKEN']).toBe(TOKEN);
    expect(seen.env['PATH']).not.toBe('/leak'); // Windows itself may add its own PATH; what the Hub passed is not forwarded
    expect(seen.env['NODE_OPTIONS']).toBeUndefined();
    expect(seen.env['SECRET_OF_THE_HUB']).toBeUndefined();
    expect(realpathSync.native(seen.cwd).toLowerCase()).toBe(realpathSync.native(path.join(dataRoot, 'run')).toLowerCase());
    expect(JSON.stringify(supervisor.status())).not.toContain(TOKEN);
  });

  it('is scrubbed from the captured output, even when written in two chunks', async () => {
    for (const mode of ['1', 'split']) {
      const { supervisor } = await make({}, { STUB_PRINT_TOKEN: mode });
      await supervisor.start();
      await supervisor.waitFor(['running'], 8000);
      await sleep(200);
      const text = supervisor.logs().map((line) => line.text).join('\n');
      expect(text).toContain(REDACTED);
      expect(text).not.toContain(TOKEN);
      expect(text).not.toContain(TOKEN.slice(0, 20));
      expect(text).not.toContain(TOKEN.slice(20));
      await supervisor.stop();
    }
  });

  it('is scrubbed even when it does not look like a connector token (the literal value is known)', async () => {
    const plain = 'plain-token-value-0123456789';
    const { supervisor } = await make({}, { STUB_PRINT_TOKEN: '1' }, plain);
    await supervisor.start();
    await supervisor.waitFor(['running'], 8000);
    await sleep(100);
    const text = supervisor.logs().map((line) => line.text).join('\n');
    expect(text).not.toContain(plain);
    expect(text).toContain(REDACTED);
  });

  it('refuses to start without one', async () => {
    for (const token of [null, '   ']) {
      const { supervisor, record } = await make({}, {}, token);
      await expect(supervisor.start()).rejects.toMatchObject({ code: 'token-missing' });
      expect(existsSync(record)).toBe(false);
    }
  });

  it('reports an unreadable secret without echoing what the store said', async () => {
    const { supervisor } = await make({}, {}, () => { throw new Error('DPAPI said SECRET-DETAIL'); });
    const error = await supervisor.start().then(() => null, (caught: unknown) => caught as TunnelStartError);
    expect(error).toBeInstanceOf(TunnelStartError);
    expect(error?.code).toBe('token-unreadable');
    expect(error?.message).not.toContain('SECRET-DETAIL');
    expect(supervisor.logs().map((line) => line.text).join('\n')).not.toContain('SECRET-DETAIL');
  });
});

describe('supervising the stub', () => {
  it('becomes ready through the /ready endpoint it was told to expose', async () => {
    const { supervisor } = await make({}, { STUB_READY_AFTER_MS: '250' });
    await supervisor.start();
    expect(supervisor.status().state).toBe('starting');
    await supervisor.waitFor(['running'], 8000);
    expect(supervisor.status().ready).toBe(true);
  });

  it('answers the readiness check only on 200', async () => {
    const { supervisor, record } = await make({}, { STUB_NEVER_READY: '1' });
    await supervisor.start();
    await sleep(300);
    const port = Number(recorded(record).argv[3]?.split(':')[1]);
    expect(await createReadyCheck(port)()).toBe(false);
    expect(await createReadyCheck(1)()).toBe(false);
    expect(supervisor.status().state).toBe('starting');
  });

  it('a stub that never becomes ready is restarted and finally failed', async () => {
    const { supervisor } = await make({ supervisor: { backoffMs: [10], readiness: { intervalMs: 20, startTimeoutMs: 200 }, stopGraceMs: 1500 } }, { STUB_NEVER_READY: '1' });
    await supervisor.start();
    await supervisor.waitFor(['restarting'], 8000);
    expect(supervisor.status().lastError).toBe('not-ready');
    await supervisor.waitFor(['failed'], 30_000);
  }, 40_000);

  it('a crashing stub is restarted with back-off and ends failed after more than three crashes', async () => {
    const { supervisor, record } = await make({}, { STUB_CRASH_AFTER_MS: '30', STUB_RECORD_APPEND: '1' });
    await supervisor.start();
    await supervisor.waitFor(['failed'], 20_000);
    const runs = readFileSync(record, 'utf8').trim().split('\n');
    expect(runs).toHaveLength(4);
    expect(supervisor.status()).toMatchObject({ state: 'failed', lastError: 'crashed-repeatedly', restarts: 3 });
    expect(supervisor.status().lastExit?.code).toBe(3);
  }, 30_000);

  it('stop() leaves no cloudflared process and no pid file', async () => {
    const { supervisor, dataRoot, record } = await make();
    await supervisor.start();
    await supervisor.waitFor(['running'], 8000);
    const pid = recorded(record).pid;
    expect(pidAlive(pid)).toBe(true);
    expect(existsSync(cloudflaredPidFile(dataRoot))).toBe(true);
    await supervisor.stop();
    expect(pidAlive(pid)).toBe(false);
    expect(existsSync(cloudflaredPidFile(dataRoot))).toBe(false);
    expect(readdirSync(path.join(dataRoot, 'run')).filter((name) => name.endsWith('.pid'))).toEqual([]);
  });

  it('the next start removes a stub an earlier Hub left running', async () => {
    const dataRoot = tmp();
    const record = path.join(dataRoot, 'orphan.json');
    const orphan = spawn(process.execPath, [STUB, 'tunnel', '--no-autoupdate', '--metrics', '127.0.0.1:1', 'run'], {
      env: { ...(process.env['SystemRoot'] ? { SystemRoot: process.env['SystemRoot'] } : {}), STUB_RECORD_FILE: record }, stdio: 'ignore', detached: true, windowsHide: true,
    });
    orphan.unref();
    const orphanPid = orphan.pid ?? 0;
    try {
      expect(pidAlive(orphanPid)).toBe(true);
      mkdirSync(path.join(dataRoot, 'run'), { recursive: true });
      writeFileSync(cloudflaredPidFile(dataRoot), JSON.stringify({ pid: orphanPid, startedAt: Date.now() }));
      const { supervisor } = await make({ dataRoot, supervisor: { backoffMs: [20], readiness: { intervalMs: 20, startTimeoutMs: 8000 }, stopGraceMs: 1500, processImagePath: async () => process.execPath } });
      await supervisor.start();
      await supervisor.waitFor(['running'], 8000);
      expect(pidAlive(orphanPid)).toBe(false);
    } finally {
      try { process.kill(orphanPid, 'SIGKILL'); } catch { /* already gone */ }
    }
  }, 30_000);
});
