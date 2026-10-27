import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { HUB_TUNNEL_PHRASE } from '@dude/contracts/hub';
import type { HubDiagnosticsReport } from '@dude/contracts/hub';
import { hubPaths } from '../config/data-dir.js';
import { applyTunnelChange, defaultHubConfig, loadOrCreateHubConfig, writeHubConfig } from '../config/hub-config.js';
import { openHubDb } from '../db/open-hub-db.js';
import type { HubDb } from '../db/open-hub-db.js';
import { collectDiagnostics } from '../diagnostics/engine.js';
import type { DiagnosticsOverride } from '../diagnostics/engine.js';
import { generateSelfSigned } from '../tls/self-signed.js';
import { ConfirmationStore, CONFIRMATION_TTL_MS } from '../security/confirmation-store.js';
import { createSecretStore } from '../secrets/secret-store.js';
import { sha256File } from '../tunnel/cloudflared.js';
import { createTunnelRuntime } from '../tunnel/tunnel-runtime.js';
import type { TunnelRuntime } from '../tunnel/tunnel-runtime.js';
import { startTestHub } from '../server/test-helpers.js';
import { AdminError } from './admin-endpoint.js';
import { buildAdminMethods } from './methods.js';
import { TUNNEL_OFF_ACTION, TUNNEL_OFF_CONSEQUENCE_CLASS, TUNNEL_ON_ACTION, TUNNEL_ON_CONSEQUENCE_CLASS } from './tunnel-methods.js';

/**
 * The Destructive-Action Contract's confirmation-boundary spec for `dude-hub network tunnel on|off` (32-SS1, Milestone 837, PD-143): the
 * preview writes nothing, the confirmation is bound, single-use and short-lived, the typed phrase is enforced, exposure changes only
 * on the admin pipe, and the connector token never leaves the secret store (not in an audit row, a result, an error or a log).
 */
const STUB = path.join(import.meta.dirname, '..', 'tunnel', 'test-stub', 'cloudflared-stub.mjs');
const HOST = 'notes.example.com';
const TOKEN = Buffer.from(JSON.stringify({ a: '0123456789abcdef0123456789abcdef', t: '11111111-2222-3333-4444-555555555555', s: 'c2VjcmV0LXNlY3JldC1zZWNyZXQtc2VjcmV0' })).toString('base64');
const T0 = Date.parse('2026-10-27T12:00:00Z');
const cert = generateSelfSigned({ hubInstanceId: 'h', now: new Date(T0 - 86_400_000), validityYears: 1 });

const roots: string[] = [];
const hubs: HubDb[] = [];
const runtimes: TunnelRuntime[] = [];
afterEach(async () => {
  for (const runtime of runtimes.splice(0)) { await runtime.stop().catch(() => undefined); runtime.dispose(); }
  for (const hub of hubs.splice(0)) hub.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

interface Options { stubEnv?: Record<string, string>; reachable?: boolean; owner?: boolean; readyTimeoutMs?: number }

async function fixture(options: Options = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'hub-tunnel-bnd-'));
  roots.push(root);
  const paths = hubPaths(root);
  const opened = openHubDb({ dbFile: paths.dbFile, preMigrationDir: paths.preMigrationDir });
  if (opened.status !== 'ready') throw new Error(opened.message);
  hubs.push(opened.hub);
  const db = opened.hub.db;
  writeHubConfig(paths.configFile, defaultHubConfig());
  let clock = T0;
  const state = { reachable: options.reachable !== false };
  const record = path.join(root, 'stub-record.json');
  const runtime = createTunnelRuntime({
    paths, platform: 'linux', secrets: createSecretStore({ secretsDir: paths.secretsDir, platform: 'linux' }),
    readConfig: () => loadOrCreateHubConfig(paths.configFile).exposure.tunnel, getPort: () => 47600,
    cloudflared: {
      exePath: STUB, expectedSha256: await sha256File(STUB), launch: (exe, args) => ({ command: process.execPath, args: [exe, ...args] }), expectedImagePath: process.execPath, parentEnv: {},
      extraEnv: { STUB_RECORD_FILE: record, ...options.stubEnv },
      supervisor: { backoffMs: [20], readiness: { intervalMs: 20, startTimeoutMs: 8000 }, stopGraceMs: 1500 },
    },
  });
  runtimes.push(runtime);
  const confirmations = new ConfirmationStore();
  // The real diagnostics engine, fed the facts the running Hub would gather; the override is applied the way create-server applies it.
  const diagnostics = async (override?: DiagnosticsOverride): Promise<HubDiagnosticsReport> => {
    const wanted = loadOrCreateHubConfig(paths.configFile);
      const { tunnel: _tunnel, proxy: _proxy, ...bare } = wanted.exposure;
    const exposure = override?.tunnel !== undefined ? applyTunnelChange({ ...wanted, exposure: bare }, { hostname: override.tunnel.hostname }).exposure : wanted.exposure;
    return collectDiagnostics({
      now: clock, hubVersion: 't', running: true, serviceMode: 'service', uptimeSeconds: 1, schemaVersion: 1, platform: 'win32',
      config: { port: 47600, bind: 'loopback', bindAddress: '127.0.0.1', exposure: { ...exposure, mode: override?.mode ?? exposure.mode } },
      wantedNames: [], certificate: { pem: cert.certPem, source: 'self-signed', nextSpkiSha256: null, pendingAcks: 0, chainLength: 1, ca: null, hsts: false },
      proxyPins: { active: null, next: null }, ownerExists: options.owner ?? true, realtime: { available: true, owner: 0, device: 0 },
      host: () => Promise.resolve({ firewallPresent: false, ...override?.host }),
      interfaces: () => ({}), resolveDns: () => Promise.resolve([]),
      reachability: !state.reachable ? null : { at: new Date(clock - 3600_000).toISOString(), host: HOST, ageMs: 3600_000 },
      tunnel: runtime.facts(override?.tunnel !== undefined ? { enabled: true, hostname: override.tunnel.hostname } : undefined),
    });
  };
  const methods = buildAdminMethods({
    db, hubVersion: 't', hubInstanceId: opened.hub.hubInstanceId, bind: 'loopback', getPort: () => 47600, startedAt: 0, configDir: paths.configDir, configFile: paths.configFile,
    spkiSha256: 'S'.repeat(43), paths, now: () => clock, confirmations, tunnel: runtime, diagnostics, platform: 'win32', tunnelReadyTimeoutMs: options.readyTimeoutMs ?? 8000,
  });
  const call = (name: string, params: unknown): Promise<unknown> => Promise.resolve().then(() => methods[name]!(params));
  const fail = async (name: string, params: unknown): Promise<AdminError> => {
    try { await call(name, params); } catch (error) { return error as AdminError; }
    throw new Error(`${name} did not fail`);
  };
  const preview = async (action: 'on' | 'off', extra: Record<string, unknown> = {}) =>
    (await call('network.tunnel.preview', { action, ...(action === 'on' ? { hostname: HOST } : {}), ...extra })) as { confirmToken: string; consequenceClass: string[]; requiredPhrase?: string; summary: Record<string, unknown> };
  const applyOn = (confirmToken: unknown, extra: Record<string, unknown> = {}) =>
    call('network.tunnel.apply', { action: 'on', confirmToken, hostname: HOST, acknowledgement: HUB_TUNNEL_PHRASE, connectorToken: TOKEN, ...extra });
  const tunnelAudits = (): Array<{ event: string; detail: string | null; outcome: string }> =>
    db.prepare("SELECT event, outcome, detail_json AS detail FROM audit_events WHERE event LIKE 'tunnel.%' ORDER BY seq").all() as never;
  const configText = (): string => readFileSync(paths.configFile, 'utf8');
  const secretFiles = (): string[] => (existsSync(paths.secretsDir) ? readdirSync(paths.secretsDir) : []);
  return {
    root, paths, db, runtime, confirmations, record, call, fail, preview, applyOn, tunnelAudits, configText, secretFiles,
    advance: (ms: number) => { clock += ms; }, now: () => clock, setReachable: (value: boolean) => { state.reachable = value; },
    staged: (): Map<string, unknown> => (confirmations as unknown as { staged: Map<string, unknown> }).staged,
  };
}

const ACCEPT = { acceptUnverifiedReachability: true };

describe('network tunnel confirmation boundary', () => {
  it('tags the consequence class: on widens exposure (system-config, process-management, secret-management); off is system-config and process-management', async () => {
    const f = await fixture();
    expect([...TUNNEL_ON_CONSEQUENCE_CLASS]).toEqual(['system-config', 'process-management', 'secret-management']);
    expect([...TUNNEL_OFF_CONSEQUENCE_CLASS]).toEqual(['system-config', 'process-management']);
    const on = await f.preview('on');
    expect(on.consequenceClass).toEqual([...TUNNEL_ON_CONSEQUENCE_CLASS]);
    expect(on.requiredPhrase).toBe('EXPOSE HUB THROUGH CLOUDFLARE');
    expect(on.summary).toMatchObject({ widensExposure: true, hostname: HOST, needsConnectorToken: true, tokenStored: false, restartRequired: true });
    expect(on.summary['dashboard']).toEqual({ hostname: HOST, service: 'https://127.0.0.1:47600', noTlsVerify: true, httpHostHeader: null });
    expect(JSON.stringify(on.summary['disclosure'])).toMatch(/Cloudflare terminates TLS/);
  });

  it('the preview writes nothing: no configuration, no secret, no audit event, no process', async () => {
    const f = await fixture();
    const before = f.configText();
    const auditBefore = f.db.prepare('SELECT COUNT(*) AS n FROM audit_events').get();
    await f.preview('on');
    expect(f.configText()).toBe(before);
    expect(loadOrCreateHubConfig(f.paths.configFile).exposure.tunnel).toBeUndefined();
    expect(f.secretFiles()).toEqual([]);
    expect(f.tunnelAudits()).toEqual([]);
    expect(f.db.prepare('SELECT COUNT(*) AS n FROM audit_events').get()).toEqual(auditBefore);
    expect(f.runtime.supervisorStatus()).toMatchObject({ state: 'stopped', pid: null });
    expect(existsSync(f.record)).toBe(false);
    expect(f.staged().size).toBe(1);
  });

  it('a preview that finds a blocker issues no confirmation at all', async () => {
    const f = await fixture({ owner: false });
    const error = await f.fail('network.tunnel.preview', { action: 'on', hostname: HOST, ...ACCEPT });
    expect(error.code).toBe('refused');
    expect((error.detail as { blockers: Array<{ id: string }> }).blockers.map((b) => b.id)).toEqual(['authentication-active']);
    expect(f.staged().size).toBe(0);
    const unverified = await (await fixture({ reachable: false })).fail('network.tunnel.preview', { action: 'on', hostname: HOST });
    expect((unverified.detail as { blockers: Array<{ id: string }> }).blockers.map((b) => b.id)).toEqual(['external-reachability']);
  });

  it('keeps only the hash of a token; it is single-use and expires after 60 seconds', async () => {
    const f = await fixture();
    const { confirmToken } = await f.preview('on', ACCEPT);
    const stored = [...f.staged().keys()];
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatch(/^[0-9a-f]{64}$/);
    expect(stored[0]).not.toBe(confirmToken);
    expect(JSON.stringify([...f.staged().values()])).not.toContain(confirmToken);
    expect(CONFIRMATION_TTL_MS).toBe(60_000);

    f.advance(CONFIRMATION_TTL_MS + 1);
    expect((await f.fail('network.tunnel.apply', { action: 'on', confirmToken, hostname: HOST, acknowledgement: HUB_TUNNEL_PHRASE, connectorToken: TOKEN, ...ACCEPT })).code).toBe('confirmation-required');
    expect(loadOrCreateHubConfig(f.paths.configFile).exposure.tunnel).toBeUndefined();
    expect(f.secretFiles()).toEqual([]);
    expect(existsSync(f.record)).toBe(false);

    const fresh = (await f.preview('on', ACCEPT)).confirmToken;
    f.advance(CONFIRMATION_TTL_MS - 1);
    await expect(f.applyOn(fresh, ACCEPT)).resolves.toMatchObject({ tunnel: { hostname: HOST }, restartRequired: true });
    f.advance(1000);
    const replay = await f.fail('network.tunnel.apply', { action: 'on', confirmToken: fresh, hostname: HOST, acknowledgement: HUB_TUNNEL_PHRASE, connectorToken: TOKEN, ...ACCEPT });
    expect(replay.code).toBe('confirmation-required');
  });

  it('refuses an apply without a token, with an empty or forged token, and with a token issued for another action or binding', async () => {
    const f = await fixture();
    for (const confirmToken of [undefined, '', 'forged', 42]) {
      const error = await f.fail('network.tunnel.apply', { action: 'on', confirmToken, hostname: HOST, acknowledgement: HUB_TUNNEL_PHRASE, connectorToken: TOKEN, ...ACCEPT });
      expect(['bad-request', 'confirmation-required']).toContain(error.code);
    }
    const otherAction = f.confirmations.issue({ action: 'owner.reset', digest: 'x', bindingId: 'cli', now: f.now() });
    expect((await f.fail('network.tunnel.apply', { action: 'on', confirmToken: otherAction, hostname: HOST, acknowledgement: HUB_TUNNEL_PHRASE, connectorToken: TOKEN, ...ACCEPT })).code).toBe('confirmation-required');
    const wrongBinding = f.confirmations.issue({ action: TUNNEL_ON_ACTION, digest: 'x', bindingId: 'session-hash', now: f.now() });
    expect((await f.fail('network.tunnel.apply', { action: 'on', confirmToken: wrongBinding, hostname: HOST, acknowledgement: HUB_TUNNEL_PHRASE, connectorToken: TOKEN, ...ACCEPT })).code).toBe('confirmation-required');
    // An `off` token cannot drive `on`, and an `on` token cannot drive `off` or another action.
    await f.applyOn((await f.preview('on', ACCEPT)).confirmToken, ACCEPT);
    const offToken = (await f.preview('off')).confirmToken;
    expect((await f.fail('network.tunnel.apply', { action: 'on', confirmToken: offToken, hostname: HOST, acknowledgement: HUB_TUNNEL_PHRASE, connectorToken: TOKEN, ...ACCEPT })).code).toBe('confirmation-required');
    expect(loadOrCreateHubConfig(f.paths.configFile).exposure.tunnel).toBeDefined();
    const onToken = (await f.preview('on', ACCEPT)).confirmToken;
    expect((await f.fail('network.tunnel.apply', { action: 'off', confirmToken: onToken })).code).toBe('confirmation-required');
    expect(loadOrCreateHubConfig(f.paths.configFile).exposure.tunnel).toBeDefined();
    await expect(f.call('owner.reset.apply', { confirmToken: onToken })).rejects.toMatchObject({ code: expect.stringMatching(/not-bootstrapped|confirmation-required/) });
  });

  it('refuses a wrong or missing phrase before spending the confirmation, and nothing is stored, started or written', async () => {
    const f = await fixture();
    const pristine = f.configText();
    const { confirmToken } = await f.preview('on', ACCEPT);
    for (const acknowledgement of [undefined, '', 'expose hub through cloudflare', 'EXPOSE HUB TO THE INTERNET', `${HUB_TUNNEL_PHRASE} `]) {
      const error = await f.fail('network.tunnel.apply', { action: 'on', confirmToken, hostname: HOST, ...(acknowledgement !== undefined ? { acknowledgement } : {}), connectorToken: TOKEN, ...ACCEPT });
      expect(error.code).toBe('refused');
      expect((error.detail as { requiredPhrase?: string }).requiredPhrase).toBe(HUB_TUNNEL_PHRASE);
      expect(error.message).not.toContain(TOKEN);
    }
    expect(f.configText()).toBe(pristine);
    expect(f.secretFiles()).toEqual([]);
    expect(existsSync(f.record)).toBe(false);
    expect(f.tunnelAudits()).toEqual([]);
    // The confirmation was not burned by the typos: the right phrase still works within the window.
    await expect(f.applyOn(confirmToken, ACCEPT)).resolves.toMatchObject({ tunnel: { hostname: HOST } });
  });

  it('binds the confirmation to the previewed hostname and to the configuration', async () => {
    const f = await fixture();
    const { confirmToken } = await f.preview('on', ACCEPT);
    const other = await f.fail('network.tunnel.apply', { action: 'on', confirmToken, hostname: 'other.example.org', acknowledgement: HUB_TUNNEL_PHRASE, connectorToken: TOKEN, ...ACCEPT });
    expect(other.code).toBe('conflict');
    expect(loadOrCreateHubConfig(f.paths.configFile).exposure.tunnel).toBeUndefined();
    expect(existsSync(f.record)).toBe(false);

    const second = (await f.preview('on', ACCEPT)).confirmToken;
    writeHubConfig(f.paths.configFile, { ...loadOrCreateHubConfig(f.paths.configFile), exposure: { mode: 'private', names: ['x.example.org'] } }); // changed after the preview
    const changed = await f.fail('network.tunnel.apply', { action: 'on', confirmToken: second, hostname: HOST, acknowledgement: HUB_TUNNEL_PHRASE, connectorToken: TOKEN, ...ACCEPT });
    expect(changed.code).toBe('conflict');
    expect(loadOrCreateHubConfig(f.paths.configFile).exposure.tunnel).toBeUndefined();
    expect(f.secretFiles()).toEqual([]);
  });

  it('turns the tunnel on only after the connector connected and the gate passed: token stored, config and audit written, token nowhere else', async () => {
    const f = await fixture();
    const { confirmToken } = await f.preview('on', ACCEPT);
    const result = await f.applyOn(confirmToken, ACCEPT);
    expect(result).toMatchObject({ tunnel: { hostname: HOST }, restartRequired: true });
    const config = loadOrCreateHubConfig(f.paths.configFile);
    expect(config.exposure.tunnel).toEqual({ enabled: true, hostname: HOST });
    expect(config.exposure.proxy).toEqual({ trusted: ['127.0.0.1', '::1'], publicOrigin: `https://${HOST}` });
    expect(config.bind).toBe('loopback');
    expect(f.secretFiles()).toEqual(['tunnel.connectorToken.secret']);
    expect(f.runtime.supervisorStatus()).toMatchObject({ state: 'running', ready: true });
    expect(f.tunnelAudits().map((a) => a.event)).toEqual(['tunnel.token-set', 'tunnel.enabled']);
    expect(JSON.parse(f.tunnelAudits()[1]!.detail!)).toMatchObject({ hostname: HOST, acceptedUnverifiedReachability: true });
    // The connector token is in the secret store and in the stub's environment, and nowhere else.
    for (const place of [JSON.stringify(result), JSON.stringify(f.tunnelAudits()), f.configText(), JSON.stringify(f.runtime.status()), JSON.stringify(f.db.prepare('SELECT * FROM audit_events').all())]) {
      expect(place).not.toContain(TOKEN);
    }
    const seen = JSON.parse(readFileSync(f.record, 'utf8')) as { argv: string[] };
    expect(JSON.stringify(seen.argv)).not.toContain(TOKEN);
  });

  it('uses an already stored token when none is supplied, and refuses when there is none', async () => {
    const f = await fixture();
    f.runtime.putToken(TOKEN);
    const first = await f.preview('on', ACCEPT);
    expect(first.summary).toMatchObject({ tokenStored: true, needsConnectorToken: false });
    await expect(f.call('network.tunnel.apply', { action: 'on', confirmToken: first.confirmToken, hostname: HOST, acknowledgement: HUB_TUNNEL_PHRASE, ...ACCEPT })).resolves.toMatchObject({ tunnel: { hostname: HOST } });
    expect(f.tunnelAudits().map((a) => a.event)).toEqual(['tunnel.enabled']); // no token-set: none was supplied

    const g = await fixture();
    const preview = await g.preview('on', ACCEPT);
    const error = await g.fail('network.tunnel.apply', { action: 'on', confirmToken: preview.confirmToken, hostname: HOST, acknowledgement: HUB_TUNNEL_PHRASE, ...ACCEPT });
    expect(error.code).toBe('bad-request');
    expect(error.message).toMatch(/--token-stdin/);
  });

  it('refuses a malformed connector token without echoing it, before the confirmation is spent', async () => {
    const f = await fixture();
    const { confirmToken } = await f.preview('on', ACCEPT);
    for (const bad of ['short', 'has spaces in it but is long enough to pass the length check', 'x'.repeat(5000), 12345]) {
      const error = await f.fail('network.tunnel.apply', { action: 'on', confirmToken, hostname: HOST, acknowledgement: HUB_TUNNEL_PHRASE, connectorToken: bad, ...ACCEPT });
      expect(error.code).toBe('bad-request');
      expect(JSON.stringify(error)).not.toContain(String(bad).slice(0, 12));
    }
    expect(f.secretFiles()).toEqual([]);
    expect(existsSync(f.record)).toBe(false);
    await expect(f.applyOn(confirmToken, ACCEPT)).resolves.toMatchObject({ tunnel: { hostname: HOST } });
  });

  it('writes nothing and stops the connector when it never connects, and when the gate refuses afterwards', async () => {
    const never = await fixture({ stubEnv: { STUB_NEVER_READY: '1' }, readyTimeoutMs: 400 });
    const { confirmToken } = await never.preview('on', ACCEPT);
    const error = await never.fail('network.tunnel.apply', { action: 'on', confirmToken, hostname: HOST, acknowledgement: HUB_TUNNEL_PHRASE, connectorToken: TOKEN, ...ACCEPT });
    expect(error.code).toBe('tunnel-failed');
    expect(JSON.stringify(error)).not.toContain(TOKEN);
    expect(loadOrCreateHubConfig(never.paths.configFile).exposure.tunnel).toBeUndefined();
    expect(never.runtime.supervisorStatus().state).toBe('stopped');
    expect(never.tunnelAudits().map((a) => a.event)).toEqual(['tunnel.token-set']); // the token was stored; the tunnel was not enabled

    // Reachability is lost between the preview and the apply: the gate runs again, refuses and the connector this call started is stopped.
    const f = await fixture();
    const preview = await f.preview('on');
    f.setReachable(false);
    const refused = await f.fail('network.tunnel.apply', { action: 'on', confirmToken: preview.confirmToken, hostname: HOST, acknowledgement: HUB_TUNNEL_PHRASE, connectorToken: TOKEN });
    expect(refused.code).toBe('refused');
    expect((refused.detail as { blockers: Array<{ id: string }> }).blockers.map((b) => b.id)).toEqual(['external-reachability']);
    expect(loadOrCreateHubConfig(f.paths.configFile).exposure.tunnel).toBeUndefined();
    expect(f.runtime.supervisorStatus().state).toBe('stopped');
    expect(f.tunnelAudits().map((a) => a.event)).toEqual(['tunnel.token-set']);
  });

  it('refuses to replace the operator\'s own reverse proxy and a hostname that is not a domain', async () => {
    const f = await fixture();
    writeHubConfig(f.paths.configFile, { ...defaultHubConfig(), exposure: { mode: 'private', names: ['hub.example.com'], proxy: { trusted: ['10.0.0.1'], publicOrigin: 'https://hub.example.com' } } });
    expect((await f.fail('network.tunnel.preview', { action: 'on', hostname: HOST, ...ACCEPT })).code).toBe('conflict');
    for (const hostname of ['203.0.113.7', 'hub.local', `www.${HOST}`, 42]) {
      const clean = await fixture();
      expect((await clean.fail('network.tunnel.preview', { action: 'on', hostname, ...ACCEPT })).code).toBe('bad-request');
      expect(clean.staged().size).toBe(0);
    }
  });

  describe('off', () => {
    it('is two steps: the preview changes nothing, the apply stops the connector and removes the tunnel and its proxy, and the token is kept', async () => {
      const f = await fixture();
      await f.applyOn((await f.preview('on', ACCEPT)).confirmToken, ACCEPT);
      const before = f.configText();
      const preview = await f.preview('off');
      expect(preview.consequenceClass).toEqual([...TUNNEL_OFF_CONSEQUENCE_CLASS]);
      expect(preview.summary).toMatchObject({ hostname: HOST, stopsConnector: true, tokenKept: true });
      expect(f.configText()).toBe(before);
      expect(f.runtime.supervisorStatus().state).toBe('running');
      const auditsBefore = f.tunnelAudits().length;
      expect(f.tunnelAudits()).toHaveLength(auditsBefore);

      const result = await f.call('network.tunnel.apply', { action: 'off', confirmToken: preview.confirmToken });
      expect(result).toMatchObject({ tunnel: null, previous: { hostname: HOST }, tokenForgotten: false, restartRequired: true });
      expect(loadOrCreateHubConfig(f.paths.configFile).exposure.tunnel).toBeUndefined();
      expect(loadOrCreateHubConfig(f.paths.configFile).exposure.proxy).toBeUndefined();
      expect(f.runtime.supervisorStatus().state).toBe('stopped');
      expect(f.secretFiles()).toEqual(['tunnel.connectorToken.secret']);
      expect(f.tunnelAudits().at(-1)).toMatchObject({ event: 'tunnel.disabled' });
      // A replay finds nothing left to turn off; and once the tunnel is on again the spent token is still refused.
      expect((await f.fail('network.tunnel.apply', { action: 'off', confirmToken: preview.confirmToken })).code).toBe('conflict');
      await f.applyOn((await f.preview('on', ACCEPT)).confirmToken, ACCEPT);
      expect((await f.fail('network.tunnel.apply', { action: 'off', confirmToken: preview.confirmToken })).code).toBe('confirmation-required');
      expect(loadOrCreateHubConfig(f.paths.configFile).exposure.tunnel).toBeDefined();
    });

    it('can also forget the token, expires after 60 seconds and refuses when no tunnel is configured', async () => {
      const f = await fixture();
      expect((await f.fail('network.tunnel.preview', { action: 'off' })).code).toBe('conflict');
      await f.applyOn((await f.preview('on', ACCEPT)).confirmToken, ACCEPT);
      const expired = (await f.preview('off')).confirmToken;
      f.advance(CONFIRMATION_TTL_MS + 1);
      expect((await f.fail('network.tunnel.apply', { action: 'off', confirmToken: expired })).code).toBe('confirmation-required');
      expect(loadOrCreateHubConfig(f.paths.configFile).exposure.tunnel).toBeDefined();
      const fresh = (await f.preview('off')).confirmToken;
      const result = await f.call('network.tunnel.apply', { action: 'off', confirmToken: fresh, forgetToken: true });
      expect(result).toMatchObject({ tokenForgotten: true });
      expect(f.secretFiles()).toEqual([]);
      expect(JSON.parse(f.tunnelAudits().at(-1)!.detail!)).toMatchObject({ hostname: HOST, forgotten: true });
    });

    it('returns a public mode that could no longer accept traffic to private', async () => {
      const f = await fixture();
      await f.applyOn((await f.preview('on', ACCEPT)).confirmToken, ACCEPT);
      const config = loadOrCreateHubConfig(f.paths.configFile);
      writeHubConfig(f.paths.configFile, { ...config, exposure: { ...config.exposure, mode: 'public' } });
      await f.call('network.tunnel.apply', { action: 'off', confirmToken: (await f.preview('off')).confirmToken });
      expect(loadOrCreateHubConfig(f.paths.configFile).exposure.mode).toBe('private');
    });
  });

  it('status never carries the token and needs no confirmation', async () => {
    const f = await fixture();
    f.runtime.putToken(TOKEN);
    const status = (await f.call('network.tunnel.status', {})) as Record<string, unknown>;
    expect(status).toMatchObject({ tokenPresent: true, requiredPhrase: HUB_TUNNEL_PHRASE, configured: false });
    expect(JSON.stringify(status)).not.toContain(TOKEN);
  });

  it('is reachable only over the admin pipe: no HTTP route can issue or consume the confirmation, store the token or change exposure', async () => {
    const hub = await startTestHub();
    try {
      const routes = hub.app.printRoutes({ commonPrefix: false });
      expect(routes).toContain('/api/v1/tunnel (GET, HEAD)');
      expect(routes.replace('/api/v1/tunnel (GET, HEAD)', '')).not.toMatch(/tunnel/i);
    } finally {
      await hub.close();
    }
    const srcRoot = path.resolve(import.meta.dirname, '..');
    const offenders: string[] = [];
    for (const dir of ['server', 'auth', 'realtime', 'devices', 'security', 'collab', 'notifications']) {
      for (const entry of readdirSync(path.join(srcRoot, dir), { recursive: true, withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.endsWith('.ts') || /\.spec\.ts$/.test(entry.name) || entry.name === 'test-helpers.ts') continue;
        const file = path.join(entry.parentPath, entry.name);
        if (/TUNNEL_ON_ACTION|TUNNEL_OFF_ACTION|['"]network\.tunnel|admin\/tunnel-methods|tunnel\/tunnel-runtime|tunnel\/cloudflared|connectorToken|putToken/.test(readFileSync(file, 'utf8'))) offenders.push(path.relative(srcRoot, file));
      }
    }
    expect(offenders).toEqual([]);
    expect(TUNNEL_OFF_ACTION).toBe('network.tunnel.off');
  });
});
