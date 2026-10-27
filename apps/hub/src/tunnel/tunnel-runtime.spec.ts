import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { Value } from 'typebox/value';
import { HUB_TUNNEL_DISCLOSURE, HUB_TUNNEL_LOG_LINES_MAX, HubTunnelStatusResponse } from '@dude/contracts/hub';
import { REDACTED } from '../supervisor/redact.js';
import { createSecretStore } from '../secrets/secret-store.js';
import { sha256File } from './cloudflared.js';
import { TUNNEL_DEGRADED_AUDIT_MIN_MS, createTunnelRuntime } from './tunnel-runtime.js';
import type { TunnelRuntime, TunnelRuntimeOptions } from './tunnel-runtime.js';

const STUB = path.join(import.meta.dirname, 'test-stub', 'cloudflared-stub.mjs');
const TOKEN = Buffer.from(JSON.stringify({ a: '0123456789abcdef0123456789abcdef', t: '11111111-2222-3333-4444-555555555555', s: 'c2VjcmV0LXNlY3JldC1zZWNyZXQtc2VjcmV0' })).toString('base64');
const HOST = 'notes.example.com';

const runtimes: TunnelRuntime[] = [];
const dirs: string[] = [];
afterEach(async () => {
  for (const runtime of runtimes.splice(0)) { await runtime.stop().catch(() => undefined); runtime.dispose(); }
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

interface Made { runtime: TunnelRuntime; root: string; secretsDir: string; audits: Array<Record<string, unknown>>; config: { current: { enabled: boolean; hostname: string } | undefined } }

async function make(stubEnv: Record<string, string> = {}, over: Partial<TunnelRuntimeOptions> = {}, supervisor: Record<string, unknown> = {}): Promise<Made> {
  const root = mkdtempSync(path.join(os.tmpdir(), 'hub-tunnel-rt-'));
  dirs.push(root);
  const secretsDir = path.join(root, 'config', 'secrets');
  const audits: Array<Record<string, unknown>> = [];
  const config: Made['config'] = { current: undefined };
  const runtime = createTunnelRuntime({
    paths: { root, secretsDir },
    platform: 'linux',
    secrets: createSecretStore({ secretsDir, platform: 'linux' }),
    readConfig: () => config.current,
    getPort: () => 47600,
    auditDegraded: (detail) => audits.push({ ...detail }),
    cloudflared: {
      exePath: STUB,
      expectedSha256: await sha256File(STUB),
      launch: (exe, args) => ({ command: process.execPath, args: [exe, ...args] }),
      expectedImagePath: process.execPath,
      parentEnv: {},
      extraEnv: stubEnv,
      supervisor: { backoffMs: [20, 40], readiness: { intervalMs: 20, startTimeoutMs: 8000 }, stopGraceMs: 1500, ...supervisor },
    },
    ...over,
  });
  runtimes.push(runtime);
  return { runtime, root, secretsDir, audits, config };
}

describe('status', () => {
  it('is not configured with nothing, and stopped once a tunnel is configured but the connector has not started', async () => {
    const { runtime, config } = await make();
    expect(runtime.status()).toMatchObject({ configured: false, enabled: false, hostname: null, state: 'not-configured', ready: false, tokenPresent: false, dashboard: null, logTail: [], lastError: null, startedAt: null, lastReadyAt: null, restarts: 0 });
    config.current = { enabled: true, hostname: HOST };
    expect(runtime.status()).toMatchObject({
      configured: true, enabled: true, hostname: HOST, state: 'stopped',
      dashboard: { hostname: HOST, service: 'https://127.0.0.1:47600', noTlsVerify: true, httpHostHeader: null },
    });
    expect(runtime.status().disclosure).toEqual([...HUB_TUNNEL_DISCLOSURE]);
    expect(Value.Check(HubTunnelStatusResponse, runtime.status())).toBe(true);
  });

  it('reports not supported off Windows without a launcher, and refuses to start there', async () => {
    const bare = createTunnelRuntime({ paths: { root: os.tmpdir(), secretsDir: path.join(os.tmpdir(), 'x') }, platform: 'linux', readConfig: () => undefined, getPort: () => 1, secrets: createSecretStore({ secretsDir: path.join(os.tmpdir(), 'dude-none'), platform: 'linux' }) });
    runtimes.push(bare);
    expect(bare.status().supported).toBe(false);
    expect(bare.facts().supported).toBe(false);
    await expect(bare.start()).rejects.toMatchObject({ code: 'unsupported-platform' });
    expect(bare.status()).toMatchObject({ state: 'failed', lastError: 'unsupported-platform' });
  });
});

describe('the connector token', () => {
  it('is presence-only: stored, reported as present, never returned, removed on request', async () => {
    const { runtime, secretsDir } = await make();
    expect(runtime.tokenPresent()).toBe(false);
    runtime.putToken(TOKEN);
    expect(runtime.tokenPresent()).toBe(true);
    expect(readdirSync(secretsDir)).toEqual(['tunnel.connectorToken.secret']);
    expect(JSON.stringify(runtime.status())).not.toContain(TOKEN);
    expect(JSON.stringify(runtime.facts({ enabled: true, hostname: HOST }))).not.toContain(TOKEN);
    expect(runtime.forgetToken()).toBe(true);
    expect(runtime.forgetToken()).toBe(false);
    expect(runtime.tokenPresent()).toBe(false);
  });

  it('a start without one is refused with a value-free code and audited once as a failed tunnel', async () => {
    const { runtime, audits, config } = await make();
    config.current = { enabled: true, hostname: HOST };
    await expect(runtime.start()).rejects.toMatchObject({ code: 'token-missing' });
    expect(runtime.status()).toMatchObject({ state: 'failed', lastError: 'token-missing', tokenPresent: false });
    expect(audits).toEqual([{ state: 'failed', restarts: 0, error: 'token-missing' }]);
  });
});

describe('a running connector', () => {
  it('goes connecting then ready, records when, and never shows the token anywhere in its status, facts or log tail', async () => {
    const { runtime, config } = await make({ STUB_READY_AFTER_MS: '200', STUB_PRINT_TOKEN: '1' });
    config.current = { enabled: true, hostname: HOST };
    runtime.putToken(TOKEN);
    await runtime.start();
    expect(runtime.status().state).toBe('connecting');
    expect(runtime.status().ready).toBe(false);
    expect(await runtime.waitReady(8000)).toBe(true);
    const status = runtime.status();
    expect(status).toMatchObject({ state: 'ready', ready: true, tokenPresent: true, lastError: null });
    expect(status.startedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(status.lastReadyAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(runtime.facts()).toEqual({ enabled: true, hostname: HOST, tokenPresent: true, supported: true, connector: { state: 'running', ready: true, restarts: 0, lastError: null } });
    await sleep(100);
    const tail = runtime.status().logTail;
    expect(tail.length).toBeLessThanOrEqual(HUB_TUNNEL_LOG_LINES_MAX);
    expect(tail.map((l) => l.text).join('\n')).toContain(REDACTED);
    const everything = JSON.stringify([runtime.status(), runtime.facts(), runtime.supervisorStatus()]);
    expect(everything).not.toContain(TOKEN);
    expect(everything).not.toContain(TOKEN.slice(0, 24));
    expect(Value.Check(HubTunnelStatusResponse, runtime.status())).toBe(true);
  });

  it('keeps the log tail to the last 20 lines', async () => {
    const { runtime } = await make({ STUB_SPAM_LINES: '60' });
    runtime.putToken(TOKEN);
    await runtime.start();
    expect(await runtime.waitReady(8000)).toBe(true);
    await sleep(150);
    const tail = runtime.status().logTail;
    expect(tail).toHaveLength(HUB_TUNNEL_LOG_LINES_MAX);
    expect(tail.at(-1)?.text).toBe('line 59');
  });

  it('facts report the connector for a candidate configuration (the gate runs before anything is written)', async () => {
    const { runtime } = await make();
    runtime.putToken(TOKEN);
    expect(runtime.facts()).toMatchObject({ enabled: false, hostname: null, connector: null });
    await runtime.start();
    expect(await runtime.waitReady(8000)).toBe(true);
    expect(runtime.facts({ enabled: true, hostname: HOST })).toMatchObject({ enabled: true, hostname: HOST, connector: { state: 'running', ready: true } });
    expect(runtime.status()).toMatchObject({ configured: false, state: 'ready' }); // running although not configured: the gate's connector
  });

  it('stops cleanly and reports stopped again', async () => {
    const { runtime, config } = await make();
    config.current = { enabled: true, hostname: HOST };
    runtime.putToken(TOKEN);
    await runtime.start();
    expect(await runtime.waitReady(8000)).toBe(true);
    await runtime.stop();
    expect(runtime.status()).toMatchObject({ state: 'stopped', ready: false });
  });

  it('audits a connector that keeps crashing once, as failed, with the restart count and a short code only', async () => {
    const { runtime, audits, config } = await make({ STUB_CRASH_AFTER_MS: '300' }, {}, { maxCrashesInWindow: 1 });
    config.current = { enabled: true, hostname: HOST };
    runtime.putToken(TOKEN);
    await runtime.start();
    for (let i = 0; i < 200 && runtime.status().state !== 'failed'; i += 1) await sleep(50);
    expect(runtime.status()).toMatchObject({ state: 'failed', lastError: 'crashed-repeatedly' });
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ state: 'failed', error: 'crashed-repeatedly' });
    expect(JSON.stringify(audits)).not.toContain(TOKEN);
    expect(TUNNEL_DEGRADED_AUDIT_MIN_MS).toBeGreaterThanOrEqual(60_000);
  });
});
