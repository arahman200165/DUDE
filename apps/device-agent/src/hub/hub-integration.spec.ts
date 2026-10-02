import { execFileSync, execSync, spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHubClient } from '@dude/api-client';
import type { AgentMethod, AgentMethodMap } from '@dude/contracts';
import { HUB_MIN_CLIENT_PROTOCOL, HUB_PROTOCOL_VERSION } from '@dude/contracts/hub';
import type { DeviceListResponse } from '@dude/contracts/hub';
import { createRpcServer } from '../rpc/server.js';
import type { RpcServer } from '../rpc/server.js';
import { readDeviceRecord } from '../store/identity.js';
import { getEnrollment } from '../store/repos/hub-enrollment.repo.js';
import type { DeviceStore } from '../store/open-store.js';
import type { DpapiPort } from '../native/windows-sys-client.js';
import { cleanupTemp, openReady, tempDir } from '../testing/test-utils.js';
import { createHubRuntime } from './index.js';
import type { HubRuntime } from './index.js';
import { createPinnedTransport, pinnedTlsOptions, spkiSha256Of } from './pinned-transport.js';

const ROOT = path.resolve(import.meta.dirname, '../../../..');
const BUNDLE = path.join(ROOT, 'dist', 'hub', 'dude-hub.cjs');
const PASSWORD = 'correct horse battery staple';
const CAPABILITIES = { desktop: true, filesystem: true, secureStorage: true };

/** TEST-ONLY DPAPI stand-in: AES-GCM under a per-process random key, bound to the entropy like the real port. */
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

interface Agent { store: DeviceStore; hub: HubRuntime; rpc: <M extends AgentMethod>(method: M, params: AgentMethodMap[M]['params']) => Promise<AgentMethodMap[M]['result']> }

let hubDir: string;
let child: ChildProcess;
let hubOutput = '';
let port = 0;
const agents: Agent[] = [];
let nextId = 1;

const cert = (): string => readFileSync(path.join(hubDir, 'config', 'tls', 'cert.pem'), 'utf8');

function startAgent(dpapi: DpapiPort): Agent {
  const store = openReady(tempDir(), { capabilities: CAPABILITIES });
  const now = (): Date => new Date();
  const hub = createHubRuntime({
    db: store.db, dpapi, now, timings: { backoffMinMs: 200, backoffMaxMs: 1_000, rateLimitBackoffMs: 7_000 },
    device: () => readDeviceRecord(store.db, CAPABILITIES),
  });
  const server: RpcServer = createRpcServer(store, { now, randomBytes: (n) => new Uint8Array(randomBytes(n)), hub });
  const agent: Agent = {
    store, hub,
    async rpc(method, params) {
      const response = await server.handle({ id: nextId++, method, params });
      if (!response.ok) throw Object.assign(new Error(response.error.message), { code: response.error.code });
      return response.result as never;
    },
  };
  agents.push(agent);
  return agent;
}

async function waitFor<T>(what: string, fn: () => T | undefined | false | Promise<T | undefined | false>, timeoutMs = 15_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await fn();
    if (value) return value;
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

/** A pinned raw request with owner-cookie credentials (cookie sign-in is browser-only, so the first pairing code needs it). */
function rawRequest(method: string, requestPath: string, body: unknown, headers: Record<string, string> = {}): Promise<{ status: number; headers: Record<string, string | string[] | undefined>; body: Record<string, unknown> }> {
  const pem = cert();
  const pin = spkiSha256Of(pem);
  const tls = pinnedTlsOptions({ host: '127.0.0.1', port, ca: [pem], pins: [pin] });
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : Buffer.from(JSON.stringify(body));
    const req = https.request({ host: '127.0.0.1', port, method, path: requestPath, agent: false, headers: { ...(payload ? { 'content-type': 'application/json' } : {}), ...headers }, ...tls }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve({ status: res.statusCode ?? 0, headers: res.headers, body: text ? (JSON.parse(text) as Record<string, unknown>) : {} });
      });
    });
    req.on('error', reject);
    req.end(payload);
  });
}

beforeAll(async () => {
  if (!existsSync(BUNDLE)) execSync('npm run hub:compile', { cwd: ROOT, stdio: 'ignore' });
  hubDir = mkdtempSync(path.join(os.tmpdir(), 'dude-hub-int-'));
  child = spawn(process.execPath, [BUNDLE, 'run', '--data-dir', hubDir, '--port', '0'], { stdio: ['ignore', 'pipe', 'pipe'] });
  child.stderr?.on('data', (c: Buffer) => { hubOutput += c.toString('utf8'); });
  port = await new Promise<number>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Hub did not start. Output: ${hubOutput}`)), 30_000);
    child.on('exit', (code) => { clearTimeout(timer); reject(new Error(`Hub exited early (${code}). Output: ${hubOutput}`)); });
    child.stdout?.on('data', (chunk: Buffer) => {
      hubOutput += chunk.toString('utf8');
      for (const line of hubOutput.split('\n')) {
        try {
          const parsed = JSON.parse(line) as { event?: string; url?: string };
          if (parsed.event === 'listening' && parsed.url) { clearTimeout(timer); resolve(Number(new URL(parsed.url).port)); }
        } catch { /* not the listening line */ }
      }
    });
  });

  // Bootstrap through the api-client over a pinned transport.
  const pem = cert();
  const api = createHubClient(createPinnedTransport({ host: '127.0.0.1', port, ca: [pem], pins: [spkiSha256Of(pem)] }), { clientProtocol: HUB_PROTOCOL_VERSION, minHubProtocol: HUB_MIN_CLIENT_PROTOCOL });
  const setupToken = readFileSync(path.join(hubDir, 'config', 'setup-token'), 'utf8').trim();
  await api.bootstrap({ setupToken, ownerDisplayName: 'Owner', environmentName: 'Test environment', password: PASSWORD });
}, 60_000);

afterAll(async () => {
  for (const agent of agents) agent.hub.manager.stop();
  if (child && child.exitCode === null) {
    const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()));
    child.kill();
    await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 5_000))]);
  }
  cleanupTemp();
  if (hubDir) rmSync(hubDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
});

function hubCli(...args: string[]): string {
  return execFileSync(process.execPath, [BUNDLE, ...args, '--data-dir', hubDir], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 20_000 });
}

describe('device agent against a real Hub', () => {
  it('enrolls, runs owner operations, revokes, rotates the certificate pin and unenrolls', async () => {
    const dpapi = fakeDpapi();

    // The first pairing code needs an owner cookie session (the only browser-style credential).
    const signIn = await rawRequest('POST', '/api/v1/auth/sign-in', { password: PASSWORD });
    expect(signIn.status).toBe(200);
    const cookie = String((signIn.headers['set-cookie'] as string[])[0]).split(';')[0]!;
    const csrf = String(signIn.body['csrfToken']);
    const browserHeaders = { cookie, origin: `https://127.0.0.1:${port}`, 'x-dude-csrf': csrf };
    const firstCode = await rawRequest('POST', '/api/v1/pairing-codes', { host: '127.0.0.1' }, browserHeaders);
    expect(firstCode.status).toBe(200);

    // Device A enrolls and comes online.
    const a = startAgent(dpapi);
    expect(a.hub.manager.status().state).toBe('standalone');
    const enrolled = await a.rpc('hub.enroll', { pairingString: String(firstCode.body['pairingString']) });
    expect(enrolled.enrollment?.state).toBe('enrolled');
    await waitFor('A online', () => a.hub.manager.status().state === 'online');
    expect(a.store.db.prepare('SELECT state FROM hub_enrollment').get()).toMatchObject({ state: 'enrolled' });
    await expect(a.rpc('hub.enroll', { pairingString: String(firstCode.body['pairingString']) })).rejects.toMatchObject({ code: 'already-enrolled' });

    // Owner actions over the device: the bearer lives only inside the agent.
    await expect(a.rpc('hub.owner.listDevices', {})).rejects.toMatchObject({ code: 'owner-not-signed-in' });
    const owner = await a.rpc('hub.owner.signIn', { password: PASSWORD });
    expect(owner.signedIn).toBe(true);
    expect(JSON.stringify(owner)).not.toContain('dob_');
    const idA = a.store.device.deviceId;
    const listed: DeviceListResponse = await a.rpc('hub.owner.listDevices', {});
    expect(listed.find((d) => d.deviceId === idA)).toMatchObject({ online: true, current: true });

    // Device B is paired through A's owner session.
    const code = await a.rpc('hub.owner.createPairingCode', { host: '127.0.0.1' });
    const b = startAgent(dpapi);
    await b.rpc('hub.enroll', { pairingString: code.pairingString });
    await waitFor('B online', () => b.hub.manager.status().state === 'online');
    const idB = b.store.device.deviceId;
    await a.rpc('hub.owner.renameDevice', { deviceId: idB, displayName: 'Device B' });

    // Revoking B: B goes revoked (row kept), A stays online.
    const preview = await a.rpc('hub.owner.revokeDevicePreview', { deviceId: idB });
    await a.rpc('hub.owner.revokeDevice', { deviceId: idB, confirmToken: preview.confirmToken });
    await waitFor('B revoked', () => b.hub.manager.status().state === 'revoked', 30_000);
    expect(getEnrollment(b.store.db)?.state).toBe('revoked');
    expect(a.hub.manager.status().state).toBe('online');
    await expect(b.rpc('hub.enroll', { pairingString: code.pairingString })).rejects.toMatchObject({ code: 'already-enrolled' });
    await b.rpc('hub.unenroll', { force: false });
    expect(b.hub.manager.status().state).toBe('standalone');

    // Certificate rotation: stage, A fetches and acks the next pin, then the two-phase activation.
    const before = getEnrollment(a.store.db)!;
    hubCli('tls', 'rotate');
    const staged = await waitFor('A stages the next pin', () => getEnrollment(a.store.db)?.spkiNext ?? undefined);
    expect(staged).not.toBe(before.spkiActive);
    await waitFor('Hub sees the ack', () => !JSON.parse(hubCli('tls', 'status')).pending?.length, 10_000);
    const previewOut = JSON.parse(hubCli('tls', 'activate')) as { confirmToken: string };
    hubCli('tls', 'activate', '--confirm', previewOut.confirmToken);
    expect(spkiSha256Of(cert())).toBe(staged);

    // The next owner call crosses the new certificate: the staged pin is promoted.
    await a.rpc('hub.owner.listSessions', {});
    expect(getEnrollment(a.store.db)).toMatchObject({ spkiActive: staged, spkiNext: null });
    // And a fresh realtime connection works with the promoted pin.
    a.hub.manager.stop();
    a.hub.manager.start();
    await waitFor('A online on the new certificate', () => a.hub.manager.status().state === 'online');

    // Sign out drops the bearer; unenroll tells the Hub and returns the device to standalone.
    await a.rpc('hub.owner.signOut', {});
    await expect(a.rpc('hub.owner.listDevices', {})).rejects.toMatchObject({ code: 'owner-not-signed-in' });
    await a.rpc('hub.unenroll', {});
    expect(a.hub.manager.status()).toMatchObject({ state: 'standalone', enrollment: null });
    expect(getEnrollment(a.store.db)).toBeNull();
  }, 60_000);
});
