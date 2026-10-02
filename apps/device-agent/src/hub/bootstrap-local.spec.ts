import { execFileSync, execSync, spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRpcServer } from '../rpc/server.js';
import { readDeviceRecord } from '../store/identity.js';
import { cleanupTemp, openReady, tempDir } from '../testing/test-utils.js';
import type { DpapiPort } from '../native/windows-sys-client.js';
import { consumeHandoff, handoffPath } from './bootstrap-local.js';
import { createHubRuntime } from './index.js';
import type { HubRuntime } from './index.js';

const ROOT = path.resolve(import.meta.dirname, '../../../..');
const BUNDLE = path.join(ROOT, 'dist', 'hub', 'dude-hub.cjs');
const PASSWORD = 'correct horse battery staple';
const CAPABILITIES = { desktop: true, filesystem: true, secureStorage: true };
const NONCE = 'AAAAAAAAAAAAAAAAAAAAAAAA';
const TOKEN = 'T'.repeat(43);
const SPKI = 'S'.repeat(43);

function fakeDpapi(): DpapiPort {
  const key = randomBytes(32);
  return {
    async protect(data, entropy) {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      cipher.setAAD(Buffer.from(entropy ?? []));
      const body = Buffer.concat([cipher.update(data), cipher.final()]);
      return new Uint8Array(Buffer.concat([iv, cipher.getAuthTag(), body]));
    },
    async unprotect(blob, entropy) {
      const buf = Buffer.from(blob);
      const decipher = createDecipheriv('aes-256-gcm', key, buf.subarray(0, 12));
      decipher.setAuthTag(buf.subarray(12, 28));
      decipher.setAAD(Buffer.from(entropy ?? []));
      return new Uint8Array(Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]));
    },
  };
}

const writeHandoff = (localAppData: string, nonce: string, body: Record<string, unknown>): string => {
  const file = handoffPath(localAppData, nonce);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(body));
  return file;
};

describe('consumeHandoff', () => {
  const now = new Date('2026-01-01T00:00:00.000Z');
  let dir: string;
  const handoff = (createdAt: string): Record<string, unknown> => ({ v: 1, token: TOKEN, spkiSha256: SPKI, port: 47600, hubInstanceId: 'h', createdAt });
  const consume = (nonce = NONCE): ReturnType<typeof consumeHandoff> => consumeHandoff({ nonce }, { now: () => now, localAppData: () => dir });

  beforeAll(() => { dir = mkdtempSync(path.join(os.tmpdir(), 'dude-handoff-')); });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('reads a fresh hand-off and deletes it', () => {
    const file = writeHandoff(dir, NONCE, handoff('2025-12-31T23:59:30.000Z'));
    expect(consume()).toMatchObject({ token: TOKEN, spkiSha256: SPKI, port: 47600 });
    expect(existsSync(file)).toBe(false);
  });
  it('rejects a missing file and a bad nonce without touching the disk', () => {
    expect(() => consume()).toThrowError(expect.objectContaining({ code: 'handoff-missing' }));
    expect(() => consume('../x')).toThrowError(expect.objectContaining({ code: 'handoff-missing' }));
  });
  it('rejects an expired hand-off and still deletes it', () => {
    const file = writeHandoff(dir, NONCE, handoff('2025-12-31T23:57:00.000Z'));
    expect(() => consume()).toThrowError(expect.objectContaining({ code: 'handoff-expired' }));
    expect(existsSync(file)).toBe(false);
  });
  it('rejects malformed content and still deletes the file', () => {
    const file = writeHandoff(dir, NONCE, { v: 2, token: 'x' });
    expect(() => consume()).toThrowError(expect.objectContaining({ code: 'handoff-missing' }));
    expect(existsSync(file)).toBe(false);
  });
});

describe('bootstrapLocal against a real, unbootstrapped Hub', () => {
  let hubDir: string;
  let localAppData: string;
  let child: ChildProcess;
  let output = '';
  let port = 0;
  let hub: HubRuntime;
  let rpc: (method: 'hub.bootstrapLocal' | 'hub.status' | 'hub.owner.status' | 'hub.probeLocal', params: never) => Promise<never>;

  const cli = (...args: string[]): string => execFileSync(process.execPath, [BUNDLE, ...args, '--data-dir', hubDir], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 20_000 });
  const deliver = (nonce: string): void => {
    const issued = JSON.parse(cli('setup-token')) as { token: string; spkiSha256: string; port: number };
    writeHandoff(localAppData, nonce, { v: 1, token: issued.token, spkiSha256: issued.spkiSha256, port: issued.port, hubInstanceId: 'x', createdAt: new Date().toISOString() });
  };

  beforeAll(async () => {
    if (!existsSync(BUNDLE)) execSync('npm run hub:compile', { cwd: ROOT, stdio: 'ignore' });
    hubDir = mkdtempSync(path.join(os.tmpdir(), 'dude-hub-boot-'));
    localAppData = mkdtempSync(path.join(os.tmpdir(), 'dude-localappdata-'));
    child = spawn(process.execPath, [BUNDLE, 'run', '--data-dir', hubDir, '--port', '0'], { stdio: ['ignore', 'pipe', 'pipe'] });
    child.stderr?.on('data', (c: Buffer) => { output += c.toString('utf8'); });
    port = await new Promise<number>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Hub did not start. Output: ${output}`)), 30_000);
      child.on('exit', (code) => { clearTimeout(timer); reject(new Error(`Hub exited early (${code}). Output: ${output}`)); });
      child.stdout?.on('data', (chunk: Buffer) => {
        output += chunk.toString('utf8');
        for (const line of output.split('\n')) {
          try {
            const parsed = JSON.parse(line) as { event?: string; url?: string };
            if (parsed.event === 'listening' && parsed.url) { clearTimeout(timer); resolve(Number(new URL(parsed.url).port)); }
          } catch { /* not the listening line */ }
        }
      });
    });
    const store = openReady(tempDir(), { capabilities: CAPABILITIES });
    const now = (): Date => new Date();
    hub = createHubRuntime({
      db: store.db, dpapi: fakeDpapi(), now, localAppData: () => localAppData,
      timings: { backoffMinMs: 200, backoffMaxMs: 1_000, rateLimitBackoffMs: 7_000 },
      device: () => readDeviceRecord(store.db, CAPABILITIES),
    });
    const server = createRpcServer(store, { now, randomBytes: (n) => new Uint8Array(randomBytes(n)), hub });
    let id = 1;
    rpc = async (method, params) => {
      const response = await server.handle({ id: id++, method, params } as never);
      if (!response.ok) throw Object.assign(new Error(response.error.message), { code: response.error.code });
      return response.result as never;
    };
  }, 60_000);

  afterAll(async () => {
    hub?.manager.stop();
    if (child && child.exitCode === null) {
      const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()));
      child.kill();
      await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 5_000))]);
    }
    cleanupTemp();
    for (const dir of [hubDir, localAppData]) if (dir) rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  });

  it('reports the Hub version from the public hello', async () => {
    const probe = (await rpc('hub.probeLocal', { port } as never)) as { found: boolean; hubVersion: string | null };
    expect(probe.found).toBe(true);
    expect(probe.hubVersion).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('bootstraps, enrolls this device through pairing and holds an owner session; a second run is already-bootstrapped', async () => {
    await expect(rpc('hub.bootstrapLocal', { nonce: NONCE, environmentName: 'Home', ownerDisplayName: 'Owner', password: PASSWORD } as never)).rejects.toMatchObject({ code: 'handoff-missing' });

    deliver(NONCE);
    const result = (await rpc('hub.bootstrapLocal', { nonce: NONCE, environmentName: 'Home', ownerDisplayName: 'Owner', password: PASSWORD } as never)) as {
      recoveryCodes: string[]; status: { enrollment: { state: string } | null; ownerSignedIn: boolean }; followUpError?: unknown;
    };
    expect(result.followUpError).toBeUndefined();
    expect(result.recoveryCodes.length).toBeGreaterThan(0);
    expect(result.status.enrollment?.state).toBe('enrolled');
    expect(result.status.ownerSignedIn).toBe(true);
    expect(JSON.stringify(result)).not.toContain(TOKEN);
    expect(existsSync(handoffPath(localAppData, NONCE))).toBe(false);

    for (let i = 0; i < 100 && (await rpc('hub.status', {} as never) as { state: string }).state !== 'online'; i++) await new Promise((r) => setTimeout(r, 100));
    expect(((await rpc('hub.owner.status', {} as never)) as { signedIn: boolean }).signedIn).toBe(true);

    // A second run: the Hub already has an owner (a fresh hand-off cannot even be issued), so pin the real key with a made-up token.
    const second = 'BBBBBBBBBBBBBBBBBBBBBBBB';
    writeHandoff(localAppData, second, { v: 1, token: TOKEN, spkiSha256: (result.status.enrollment as unknown as { spkiActive: string }).spkiActive, port, hubInstanceId: 'x', createdAt: new Date().toISOString() });
    await expect(rpc('hub.bootstrapLocal', { nonce: second, environmentName: 'Home', ownerDisplayName: 'Owner', password: PASSWORD } as never)).rejects.toMatchObject({ code: 'already-bootstrapped' });
  }, 90_000);

  it('surfaces hubVersion and recoveryTrusted on status once connected', async () => {
    for (let i = 0; i < 100; i++) {
      const s = (await rpc('hub.status', {} as never)) as { hubVersion: string | null; recoveryTrusted: boolean | null };
      if (s.hubVersion !== null && s.recoveryTrusted !== null) { expect(s.recoveryTrusted).toBe(false); return; }
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error('status never reported hubVersion and recoveryTrusted');
  }, 30_000);
});
