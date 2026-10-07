import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildAdminMethods } from '../admin/methods.js';
import { HELP_TEXT, parseArgs } from '../cli/args.js';
import { runCli } from '../cli/run.js';
import { hubPaths } from '../config/data-dir.js';
import { openHubDb } from '../db/open-hub-db.js';
import { tempDir } from '../server/test-helpers.js';
import { runServiceInstall } from './install.js';
import { runNetwork } from './network.js';
import { collectDiagnostics } from '../diagnostics/engine.js';
import type { DiagnosticsDeps, DiagnosticsOverride } from '../diagnostics/engine.js';
import { generateSelfSigned } from '../tls/self-signed.js';
import { fixture } from './test-helpers.js';

describe('network proxy and mode: parsing', () => {
  it('parses proxy on/off/status and mode private/public', () => {
    expect(parseArgs(['network', 'proxy', 'on', '--trusted', '10.0.0.1, 192.168.0.0/24', '--public-origin', 'https://hub.example.com', '--data-dir', 'x'])).toEqual({
      command: 'network', action: 'proxy-on', trusted: ['10.0.0.1', '192.168.0.0/24'], publicOrigin: 'https://hub.example.com', dataDir: 'x',
    });
    expect(parseArgs(['network', 'proxy', 'off'])).toEqual({ command: 'network', action: 'proxy-off' });
    expect(parseArgs(['network', 'proxy', 'status', '--install-dir', 'i'])).toEqual({ command: 'network', action: 'proxy-status', installDir: 'i' });
    expect(parseArgs(['network', 'mode', 'private'])).toEqual({ command: 'network', action: 'mode-private' });
    expect(parseArgs(['network', 'mode', 'public'])).toEqual({ command: 'network', action: 'mode-public' });
    expect(parseArgs(['network', 'mode', 'public', '--accept-unverified-reachability', '--type', 'EXPOSE HUB TO THE INTERNET', '--data-dir', 'x'])).toEqual({
      command: 'network', action: 'mode-public', acceptUnverifiedReachability: true, type: 'EXPOSE HUB TO THE INTERNET', dataDir: 'x',
    });
    expect(() => parseArgs(['network', 'proxy', 'on'])).toThrow(/Usage/);
    expect(() => parseArgs(['network', 'proxy', 'on', '--trusted', '10.0.0.1'])).toThrow(/Usage/);
    expect(() => parseArgs(['network', 'proxy', 'on', '--trusted', ',', '--public-origin', 'https://h.example'])).toThrow(/at least one/);
    expect(() => parseArgs(['network', 'proxy', 'maybe'])).toThrow(/Usage/);
    expect(() => parseArgs(['network', 'mode', 'open'])).toThrow(/Usage/);
    expect(() => parseArgs(['network', 'mode', 'public', '--i-understand-unreleased'])).toThrow(/Unknown flag/);
    expect(() => parseArgs(['network', 'mode', 'private', '--type', 'x'])).toThrow(/Unknown flag/);
    expect(() => parseArgs(['network', 'mode', 'public', '--type'])).toThrow(/needs a value/);
    expect(() => parseArgs(['network', 'mode', 'public', '--accept-unverified-reachability=1'])).toThrow(/takes no value/);
    expect(HELP_TEXT).toContain('--accept-unverified-reachability');
    expect(HELP_TEXT).not.toContain('i-understand-unreleased');
    expect(HELP_TEXT).not.toMatch(/not released/);
  });
});

describe('network proxy and mode: admin routing', () => {
  const installedFixture = async () => {
    const f = fixture();
    await runServiceInstall({ installDir: f.installDir, dataDir: f.dataDir, port: 48200 }, f.deps);
    f.system.calls.length = 0;
    f.out.length = 0;
    f.err.length = 0;
    return f;
  };

  it('proxy on: calls network.proxy.set, removes the LAN rule, restarts and reminds about the proxy pin', async () => {
    const f = await installedFixture();
    f.system.firewallRule = true;
    const methods: string[] = [];
    const call = async (_d: string, method: string, params: unknown): Promise<unknown> => {
      methods.push(`${method} ${JSON.stringify(params)}`);
      return method === 'status' ? { bind: 'lan' } : { proxy: { trustedCount: 1, publicOrigin: 'https://hub.example.com' }, bind: 'loopback', restartRequired: true };
    };
    expect(await runNetwork({ action: 'proxy-on', trusted: ['10.0.0.1'], publicOrigin: 'https://hub.example.com', installDir: f.installDir, dataDir: f.dataDir }, { ...f.deps, call })).toBe(0);
    expect(methods).toEqual(['status {}', 'network.proxy.set {"enabled":true,"trusted":["10.0.0.1"],"publicOrigin":"https://hub.example.com"}']);
    expect(f.system.firewallRule).toBe(false);
    expect(f.system.calls.some((c) => c.endsWith('DudeHub.exe start'))).toBe(true);
    expect(f.err.join('')).toMatch(/tls proxy-pin add/);
    expect(f.out.join('')).toContain('"restarted": true');
    expect(f.out.join('')).toContain('"bind": "loopback"');
  });

  it('proxy off: calls network.proxy.set with enabled false and restarts', async () => {
    const f = await installedFixture();
    const methods: string[] = [];
    const call = async (_d: string, method: string, params: unknown): Promise<unknown> => {
      methods.push(`${method} ${JSON.stringify(params)}`);
      return method === 'status' ? { bind: 'loopback' } : { proxy: null, bind: 'loopback' };
    };
    expect(await runNetwork({ action: 'proxy-off', installDir: f.installDir, dataDir: f.dataDir }, { ...f.deps, call })).toBe(0);
    expect(methods).toEqual(['status {}', 'network.proxy.set {"enabled":false}']);
    expect(f.system.calls.some((c) => c.endsWith('DudeHub.exe start'))).toBe(true);
  });

  const blockedDetail = {
    ready: false, warnings: [{ id: 'hsts', reason: 'HSTS is off.', fix: 'Use an ACME certificate.' }],
    blockers: [{ id: 'certificate-trusted', reason: 'The active certificate is self-signed.', fix: 'dude-hub tls acme issue --name <name>' }],
  };
  const adminError = (code: string, message: string, detail?: unknown) => Object.assign(new Error(message), { code, detail });

  it('mode public needs a running Hub: with none it refuses and writes nothing', async () => {
    const f = fixture({ state: 'running' });
    const paths = hubPaths(f.dataDir);
    mkdirSync(paths.configDir, { recursive: true });
    writeFileSync(paths.configFile, JSON.stringify({ port: 48300, bind: 'lan' }));
    const call = async (): Promise<unknown> => { throw Object.assign(new Error('not running'), { code: 'hub-not-running' }); };
    expect(await runNetwork({ action: 'mode-public', type: 'EXPOSE HUB TO THE INTERNET', dataDir: f.dataDir }, { ...f.deps, call })).toBe(1);
    expect(f.err.join('')).toMatch(/Start the Hub so readiness can be verified/);
    expect(JSON.parse(readFileSync(paths.configFile, 'utf8')).exposure).toBeUndefined();
  });

  it('mode public prints each blocker with its fix and exits 1 when the Hub refuses', async () => {
    const f = await installedFixture();
    const call = async (_d: string, method: string): Promise<unknown> => {
      if (method === 'status') return { bind: 'lan', port: 48200 };
      throw adminError('refused', 'The Hub is not ready for Internet exposure: 1 blocker.', blockedDetail);
    };
    expect(await runNetwork({ action: 'mode-public', type: 'EXPOSE HUB TO THE INTERNET', installDir: f.installDir, dataDir: f.dataDir }, { ...f.deps, call })).toBe(1);
    const err = f.err.join('');
    expect(err).toContain('[BLOCKER] certificate-trusted: The active certificate is self-signed.');
    expect(err).toContain('fix: dude-hub tls acme issue --name <name>');
    expect(err).toContain('[WARN] hsts');
    expect(f.system.calls.some((c) => c.endsWith('DudeHub.exe start'))).toBe(false);
  });

  it('mode public without --type prints the readiness report and exits non-zero (dry run)', async () => {
    const f = await installedFixture();
    const sent: unknown[] = [];
    const call = async (_d: string, method: string, params: unknown): Promise<unknown> => {
      if (method === 'status') return { bind: 'lan', port: 48200 };
      sent.push(params);
      throw adminError('refused', 'The Hub is ready for Internet exposure. To expose it, type the exact phrase "EXPOSE HUB TO THE INTERNET".', { ready: true, blockers: [], warnings: [blockedDetail.warnings[0]] });
    };
    expect(await runNetwork({ action: 'mode-public', installDir: f.installDir, dataDir: f.dataDir }, { ...f.deps, call })).toBe(2);
    expect(f.err.join('')).toContain('Ready: no readiness blockers.');
    expect(f.err.join('')).toContain('--type "EXPOSE HUB TO THE INTERNET"');
    expect(sent[0]).not.toHaveProperty('acknowledgement');
  });

  it('mode public sends the phrase, the acceptance and the Windows host facts; success asks for a restart and does not restart', async () => {
    const f = await installedFixture();
    const sent: Array<Record<string, unknown>> = [];
    const call = async (_d: string, method: string, params: unknown): Promise<unknown> => {
      if (method === 'status') return { bind: 'lan', port: 48200 };
      sent.push(params as Record<string, unknown>);
      return { mode: 'public', previous: 'private', restartRequired: true, warnings: ['external-reachability'] };
    };
    expect(await runNetwork({ action: 'mode-public', type: 'EXPOSE HUB TO THE INTERNET', acceptUnverifiedReachability: true, installDir: f.installDir, dataDir: f.dataDir }, { ...f.deps, call })).toBe(0);
    expect(sent[0]).toMatchObject({ mode: 'public', acknowledgement: 'EXPOSE HUB TO THE INTERNET', acceptUnverifiedReachability: true });
    expect(sent[0]).toHaveProperty('hostFacts');
    expect(f.err.join('')).toMatch(/service restart/);
    expect(f.err.join('')).toContain('external-reachability');
    expect(f.system.calls.some((c) => c.endsWith('DudeHub.exe start'))).toBe(false);
  });

  it('mode private goes through network.mode.set', async () => {
    const f = await installedFixture();
    const methods: string[] = [];
    const call = async (_d: string, method: string, params: unknown): Promise<unknown> => {
      methods.push(`${method} ${JSON.stringify(params)}`);
      return method === 'status' ? {} : { mode: 'private', previous: 'public' };
    };
    expect(await runNetwork({ action: 'mode-private', installDir: f.installDir, dataDir: f.dataDir }, { ...f.deps, call })).toBe(0);
    expect(methods).toEqual(['status {}', 'network.mode.set {"mode":"private"}']);
  });

  it('refuses without elevation when a service is installed', async () => {
    const f = fixture({ state: 'running', elevated: false });
    expect(await runNetwork({ action: 'proxy-off', dataDir: f.dataDir }, f.deps)).toBe(2);
    expect(await runNetwork({ action: 'mode-private', dataDir: f.dataDir }, f.deps)).toBe(2);
  });

  it('with no service and no Hub running, edits the config directly (validated)', async () => {
    const f = fixture({ state: 'not-installed' });
    const paths = hubPaths(f.dataDir);
    mkdirSync(paths.configDir, { recursive: true });
    writeFileSync(paths.configFile, JSON.stringify({ port: 48300, bind: 'lan' }));
    expect(await runNetwork({ action: 'proxy-on', trusted: ['10.0.0.1'], publicOrigin: 'https://hub.example.com', dataDir: f.dataDir }, f.deps)).toBe(0);
    expect(JSON.parse(readFileSync(paths.configFile, 'utf8'))).toEqual({
      port: 48300, bind: 'loopback', exposure: { mode: 'private', names: ['hub.example.com'], proxy: { trusted: ['10.0.0.1'], publicOrigin: 'https://hub.example.com' } },
    });
    f.err.length = 0;
    expect(await runNetwork({ action: 'proxy-on', trusted: ['nope'], publicOrigin: 'https://hub.example.com', dataDir: f.dataDir }, f.deps)).toBe(1);
    expect(f.err.join('')).toMatch(/not an IP address/);
    expect(await runNetwork({ action: 'proxy-off', dataDir: f.dataDir }, f.deps)).toBe(0);
    expect(JSON.parse(readFileSync(paths.configFile, 'utf8')).exposure.proxy).toBeUndefined();
    expect(await runNetwork({ action: 'mode-public', type: 'EXPOSE HUB TO THE INTERNET', dataDir: f.dataDir }, f.deps)).toBe(1);
    expect(JSON.parse(readFileSync(paths.configFile, 'utf8')).exposure?.mode ?? 'private').toBe('private');
  });

  it('network status prints the exposure read model (from the Hub, else from the config)', async () => {
    const f = fixture({ state: 'running' });
    const paths = hubPaths(f.dataDir);
    mkdirSync(paths.configDir, { recursive: true });
    writeFileSync(paths.configFile, JSON.stringify({ port: 48300, bind: 'loopback' }));
    const exposure = { mode: 'private', bind: 'loopback', port: 48300, names: [], canonicalOrigin: null, proxy: null, hsts: false };
    expect(await runNetwork({ action: 'status', dataDir: f.dataDir }, { ...f.deps, call: async () => ({ bind: 'loopback', port: 48300, exposure }) })).toBe(0);
    expect(JSON.parse(f.out.join(''))).toMatchObject({ exposure });
    f.out.length = 0;
    const off = fixture({ state: 'not-installed' });
    mkdirSync(hubPaths(off.dataDir).configDir, { recursive: true });
    writeFileSync(hubPaths(off.dataDir).configFile, JSON.stringify({ port: 48300, bind: 'loopback' }));
    expect(await runNetwork({ action: 'proxy-status', dataDir: off.dataDir }, off.deps)).toBe(0);
    expect(JSON.parse(off.out.join('')).exposure).toMatchObject({ mode: 'private', proxy: null, hsts: null, port: 48300 });
  });
});

describe('admin network.proxy.set, network.mode.set and the status exposure model', () => {
  const NOW = Date.parse('2026-10-03T00:00:00.000Z');
  const cert = generateSelfSigned({ hubInstanceId: 'h', now: new Date(NOW - 86_400_000), validityYears: 1 });
  /** A diagnostics collector like the Hub's: honours the gate's override (public mode, host facts) and builds a real report. */
  const diagnosticsFor = (over: Partial<DiagnosticsDeps> = {}, source: 'acme' | 'self-signed' = 'acme') => async (override?: DiagnosticsOverride) => {
    const report = await collectDiagnostics({
      now: NOW, hubVersion: '1.0.0', running: true, serviceMode: 'foreground', uptimeSeconds: 1, schemaVersion: 5, platform: 'linux',
      config: { port: 4711, bind: 'lan', bindAddress: '0.0.0.0', exposure: { mode: override?.mode ?? 'private', names: ['hub.example.com'] } },
      wantedNames: ['hub.example.com'],
      certificate: { pem: cert.certPem, source, nextSpkiSha256: null, pendingAcks: 0, chainLength: 1, ca: null, hsts: true },
      proxyPins: { active: null, next: null }, ownerExists: true, realtime: { available: true, owner: 0, device: 0 },
      host: () => Promise.resolve({ firewallPresent: null, ...override?.host }),
      interfaces: () => ({ eth0: [{ address: '203.0.113.7', family: 'IPv4', internal: false, netmask: '', mac: '', cidr: null }] }),
      resolveDns: () => Promise.resolve([{ name: 'hub.example.com', addresses: ['203.0.113.7'] }]),
      reachability: { at: new Date(NOW).toISOString(), host: 'hub.example.com', ageMs: 1000 },
      ...over,
    });
    return { ...report, certificate: report.certificate ? { ...report.certificate, missingNames: [] } : null };
  };
  function methodsFor(config: Record<string, unknown> = { port: 4711, bind: 'lan' }, hsts?: () => boolean, diagnostics: ReturnType<typeof diagnosticsFor> = diagnosticsFor(), platform?: NodeJS.Platform) {
    const root = tempDir('hub-exposure-');
    const paths = hubPaths(root);
    const opened = openHubDb({ dbFile: paths.dbFile, preMigrationDir: paths.preMigrationDir });
    if (opened.status !== 'ready') throw new Error('db');
    mkdirSync(paths.configDir, { recursive: true });
    writeFileSync(paths.configFile, JSON.stringify(config));
    const methods = buildAdminMethods({
      db: opened.hub.db, hubVersion: '9.9.9', hubInstanceId: opened.hub.hubInstanceId, bind: 'lan', getPort: () => 4711, startedAt: 1000,
      configDir: paths.configDir, configFile: paths.configFile, spkiSha256: 'B'.repeat(43), now: () => 6000, diagnostics, ...(hsts ? { hsts } : {}), ...(platform ? { platform } : {}),
    });
    return { methods, paths, hub: opened.hub };
  }
  const audits = (hub: { db: ReturnType<typeof methodsFor>['hub']['db'] }, event: string) =>
    hub.db.prepare('SELECT detail_json AS detail FROM audit_events WHERE event = ?').all(event) as Array<{ detail: string }>;

  it('network.proxy.set validates, forces loopback, audits counts and host only', async () => {
    const { methods, paths, hub } = methodsFor();
    const result = await methods['network.proxy.set']!({ enabled: true, trusted: ['10.0.0.1', '10.1.0.0/16'], publicOrigin: 'https://hub.example.com:8443' });
    expect(result).toMatchObject({ proxy: { trustedCount: 2, publicOrigin: 'https://hub.example.com:8443' }, bind: 'loopback', previousBind: 'lan', restartRequired: true });
    const written = JSON.parse(readFileSync(paths.configFile, 'utf8'));
    expect(written.bind).toBe('loopback');
    expect(written.exposure.names).toEqual(['hub.example.com']);
    const rows = audits(hub, 'network.proxy-changed');
    expect(rows).toHaveLength(1);
    const detail = JSON.parse(rows[0]!.detail);
    expect(detail).toMatchObject({ enabled: true, trustedCount: 2, publicHost: 'hub.example.com:8443' });
    expect(rows[0]!.detail).not.toContain('10.0.0.1');
    await expect(Promise.resolve().then(() => methods['network.proxy.set']!({ enabled: true, trusted: ['x'], publicOrigin: 'https://h.example' }))).rejects.toMatchObject({ code: 'bad-request' });
    await expect(Promise.resolve().then(() => methods['network.proxy.set']!({ enabled: true, trusted: [] }))).rejects.toMatchObject({ code: 'bad-request' });
    await expect(Promise.resolve().then(() => methods['network.proxy.set']!({}))).rejects.toMatchObject({ code: 'bad-request' });
    await methods['network.proxy.set']!({ enabled: false });
    expect(JSON.parse(readFileSync(paths.configFile, 'utf8')).exposure.proxy).toBeUndefined();
    expect(audits(hub, 'network.proxy-changed')).toHaveLength(2);
    hub.close();
  });

  const PHRASE = 'EXPOSE HUB TO THE INTERNET';
  type Refusal = Error & { code: string; detail: { ready: boolean; blockers: Array<{ id: string; fix: string }>; warnings: Array<{ id: string }> } };
  const refusal = async (promise: Promise<unknown> | unknown): Promise<Refusal> => {
    try { await promise; } catch (error) { return error as Refusal; }
    throw new Error('expected a refusal');
  };

  it('network.mode.set public: blockers are refused with the list in the error detail and nothing is written', async () => {
    const { methods, paths, hub } = methodsFor(undefined, undefined, diagnosticsFor({}, 'self-signed'));
    const error = await refusal(methods['network.mode.set']!({ mode: 'public', acknowledgement: PHRASE }));
    expect(error).toMatchObject({ code: 'refused', detail: { ready: false } });
    expect(error.detail.blockers.map((b) => b.id)).toEqual(['certificate-trusted']);
    expect(error.detail.blockers[0]?.fix).toMatch(/tls acme issue/);
    expect(JSON.parse(readFileSync(paths.configFile, 'utf8')).exposure).toBeUndefined();
    expect(audits(hub, 'network.exposure-mode-changed')).toHaveLength(0);
    hub.close();
  });

  it('network.mode.set public: with no blockers the exact phrase is required', async () => {
    const { methods, paths, hub } = methodsFor();
    for (const acknowledgement of [undefined, 'expose hub to the internet', 'yes']) {
      const error = await refusal(methods['network.mode.set']!({ mode: 'public', ...(acknowledgement !== undefined ? { acknowledgement } : {}) }));
      expect(error).toMatchObject({ code: 'refused', message: expect.stringContaining(PHRASE), detail: { ready: true, blockers: [] } });
    }
    expect(JSON.parse(readFileSync(paths.configFile, 'utf8')).exposure).toBeUndefined();
    hub.close();
  });

  it('network.mode.set public: success writes the config and audits the mode, the acceptance and the warning ids', async () => {
    const { methods, paths, hub } = methodsFor(undefined, undefined, diagnosticsFor({ reachability: null }));
    expect(await refusal(methods['network.mode.set']!({ mode: 'public', acknowledgement: PHRASE }))).toMatchObject({ detail: { blockers: [expect.objectContaining({ id: 'external-reachability' })] } });
    expect(await methods['network.mode.set']!({ mode: 'public', acknowledgement: PHRASE, acceptUnverifiedReachability: true })).toMatchObject({ mode: 'public', previous: 'private', restartRequired: true, warnings: ['external-reachability'] });
    expect(JSON.parse(readFileSync(paths.configFile, 'utf8')).exposure.mode).toBe('public');
    const rows = audits(hub, 'network.exposure-mode-changed');
    expect(rows).toHaveLength(1);
    expect(JSON.parse(rows[0]!.detail)).toMatchObject({ mode: 'public', acceptedUnverifiedReachability: true, warnings: ['external-reachability'] });
    hub.close();
  });

  it('network.mode.set public: the host facts sent by the CLI are evaluated (a missing firewall rule blocks) and malformed ones are ignored', async () => {
    const seen: Array<DiagnosticsOverride | undefined> = [];
    const diagnostics = async (override?: DiagnosticsOverride) => { seen.push(override); return diagnosticsFor({ platform: 'win32', serviceMode: 'service' })(override); };
    const { methods, hub } = methodsFor(undefined, undefined, diagnostics, 'win32');
    const hostFacts = { publicFirewall: { present: false, problems: [] }, nativeListeners: { exposed: [], desktopLan: [], partial: false } };
    const error = await refusal(methods['network.mode.set']!({ mode: 'public', acknowledgement: PHRASE, hostFacts }));
    expect(error.detail.blockers.map((b) => b.id)).toEqual(['public-firewall-rule']);
    expect(seen[0]).toMatchObject({ mode: 'public', host: { publicFirewall: { present: false } } });
    expect(seen[0]?.host?.nativeListeners).toEqual({ exposed: [], desktopLan: [], partial: false });
    seen.length = 0;
    await refusal(methods['network.mode.set']!({ mode: 'public', acknowledgement: PHRASE, hostFacts: { publicFirewall: 'yes' } }));
    expect(seen[0]?.host?.publicFirewall).toBeUndefined();
    hub.close();
  });

  it('network.mode.set private is unrestricted; unknown modes are rejected; the legacy acknowledge no longer works', async () => {
    const { methods, paths, hub } = methodsFor({ port: 4711, bind: 'lan', exposure: { mode: 'public' } });
    await expect(Promise.resolve().then(() => methods['network.mode.set']!({ mode: 'open' }))).rejects.toMatchObject({ code: 'bad-request' });
    expect(await methods['network.mode.set']!({ mode: 'private' })).toMatchObject({ mode: 'private', previous: 'public', restartRequired: true });
    expect(JSON.parse(readFileSync(paths.configFile, 'utf8')).exposure?.mode ?? 'private').toBe('private');
    expect(await methods['network.mode.set']!({ mode: 'private' })).toMatchObject({ restartRequired: false });
    expect(audits(hub, 'network.exposure-mode-changed')).toHaveLength(1);
    expect(await refusal(methods['network.mode.set']!({ mode: 'public', acknowledge: true }))).toMatchObject({ code: 'refused' });
    hub.close();
  });

  it('status carries the exposure read model', async () => {
    const { methods, hub } = methodsFor(
      { port: 4711, bind: 'lan', exposure: { names: ['hub.example.com'], proxy: { trusted: ['10.0.0.1'], publicOrigin: 'https://hub.example.com' } } },
      () => true,
    );
    const status = (await methods['status']!({})) as { exposure: unknown };
    expect(status.exposure).toEqual({
      mode: 'private', bind: 'lan', port: 4711, names: ['hub.example.com'], canonicalOrigin: 'https://hub.example.com',
      proxy: { trustedCount: 1, publicOrigin: 'https://hub.example.com' }, hsts: true,
    });
    expect(JSON.stringify(status.exposure)).not.toContain('10.0.0.1');
    hub.close();
  });
});

describe('run and public exposure at start', () => {
  it('refuses a public config on a loopback bind without proxy mode, pointing at network lan on / network proxy on', async () => {
    const dir = tempDir('hub-public-');
    const paths = hubPaths(dir);
    mkdirSync(paths.configDir, { recursive: true });
    writeFileSync(paths.configFile, JSON.stringify({ exposure: { mode: 'public' } }));
    const writes: string[] = [];
    const err = process.stderr.write.bind(process.stderr);
    process.stderr.write = ((s: string) => { writes.push(String(s)); return true; }) as typeof process.stderr.write;
    try {
      expect(await runCli(['run', '--data-dir', dir])).toBe(2);
    } finally {
      process.stderr.write = err;
    }
    const text = writes.join('');
    expect(text).toMatch(/network lan on/);
    expect(text).toMatch(/network proxy on/);
    expect(text).not.toMatch(/31F|UNRELEASED/);
  });
});
