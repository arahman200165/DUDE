import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildAdminMethods } from '../admin/methods.js';
import { parseArgs } from '../cli/args.js';
import { runCli } from '../cli/run.js';
import { hubPaths } from '../config/data-dir.js';
import { openHubDb } from '../db/open-hub-db.js';
import { tempDir } from '../server/test-helpers.js';
import { runServiceInstall } from './install.js';
import { runNetwork } from './network.js';
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
    expect(parseArgs(['network', 'mode', 'public', '--i-understand-unreleased'])).toEqual({ command: 'network', action: 'mode-public', acknowledgeUnreleased: true });
    expect(() => parseArgs(['network', 'proxy', 'on'])).toThrow(/Usage/);
    expect(() => parseArgs(['network', 'proxy', 'on', '--trusted', '10.0.0.1'])).toThrow(/Usage/);
    expect(() => parseArgs(['network', 'proxy', 'on', '--trusted', ',', '--public-origin', 'https://h.example'])).toThrow(/at least one/);
    expect(() => parseArgs(['network', 'proxy', 'maybe'])).toThrow(/Usage/);
    expect(() => parseArgs(['network', 'mode', 'open'])).toThrow(/Usage/);
    expect(() => parseArgs(['network', 'mode', 'private', '--i-understand-unreleased=1'])).toThrow();
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

  it('mode public is refused locally without the flag; with it the flag reaches the admin method and no restart happens', async () => {
    const f = await installedFixture();
    const methods: string[] = [];
    const call = async (_d: string, method: string, params: unknown): Promise<unknown> => {
      methods.push(`${method} ${JSON.stringify(params)}`);
      return method === 'status' ? { bind: 'loopback' } : { mode: 'public', previous: 'private' };
    };
    expect(await runNetwork({ action: 'mode-public', installDir: f.installDir, dataDir: f.dataDir }, { ...f.deps, call })).toBe(2);
    expect(f.err.join('')).toMatch(/not released until Phase 31F/);
    expect(methods).toEqual(['status {}']);
    f.err.length = 0;
    expect(await runNetwork({ action: 'mode-public', acknowledgeUnreleased: true, installDir: f.installDir, dataDir: f.dataDir }, { ...f.deps, call })).toBe(0);
    expect(methods).toContain('network.mode.set {"mode":"public","acknowledge":true}');
    expect(f.err.join('')).toMatch(/DUDE_HUB_UNRELEASED_PUBLIC=1/);
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
    expect(await runNetwork({ action: 'mode-public', acknowledgeUnreleased: true, dataDir: f.dataDir }, f.deps)).toBe(0);
    expect(JSON.parse(readFileSync(paths.configFile, 'utf8')).exposure.mode).toBe('public');
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
  function methodsFor(config: Record<string, unknown> = { port: 4711, bind: 'lan' }, hsts?: () => boolean) {
    const root = tempDir('hub-exposure-');
    const paths = hubPaths(root);
    const opened = openHubDb({ dbFile: paths.dbFile, preMigrationDir: paths.preMigrationDir });
    if (opened.status !== 'ready') throw new Error('db');
    mkdirSync(paths.configDir, { recursive: true });
    writeFileSync(paths.configFile, JSON.stringify(config));
    const methods = buildAdminMethods({
      db: opened.hub.db, hubVersion: '9.9.9', hubInstanceId: opened.hub.hubInstanceId, bind: 'lan', getPort: () => 4711, startedAt: 1000,
      configDir: paths.configDir, configFile: paths.configFile, spkiSha256: 'B'.repeat(43), now: () => 6000, ...(hsts ? { hsts } : {}),
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

  it('network.mode.set refuses public without the acknowledgement, audits real changes only', async () => {
    const { methods, paths, hub } = methodsFor();
    await expect(Promise.resolve().then(() => methods['network.mode.set']!({ mode: 'public' }))).rejects.toMatchObject({ code: 'refused', message: expect.stringMatching(/Phase 31F/) });
    await expect(Promise.resolve().then(() => methods['network.mode.set']!({ mode: 'open' }))).rejects.toMatchObject({ code: 'bad-request' });
    expect(JSON.parse(readFileSync(paths.configFile, 'utf8')).exposure).toBeUndefined();
    expect(await methods['network.mode.set']!({ mode: 'public', acknowledge: true })).toMatchObject({ mode: 'public', previous: 'private', restartRequired: true });
    expect(JSON.parse(readFileSync(paths.configFile, 'utf8')).exposure.mode).toBe('public');
    expect(await methods['network.mode.set']!({ mode: 'public', acknowledge: true })).toMatchObject({ restartRequired: false });
    expect(await methods['network.mode.set']!({ mode: 'private' })).toMatchObject({ mode: 'private', previous: 'public' });
    expect(audits(hub, 'network.exposure-mode-changed')).toHaveLength(2);
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

describe('run refuses public exposure at start', () => {
  it('exits with a usage error and the Phase 31F reason unless DUDE_HUB_UNRELEASED_PUBLIC=1', async () => {
    const dir = tempDir('hub-public-');
    const paths = hubPaths(dir);
    mkdirSync(paths.configDir, { recursive: true });
    writeFileSync(paths.configFile, JSON.stringify({ exposure: { mode: 'public' } }));
    const previous = process.env['DUDE_HUB_UNRELEASED_PUBLIC'];
    delete process.env['DUDE_HUB_UNRELEASED_PUBLIC'];
    const writes: string[] = [];
    const err = process.stderr.write.bind(process.stderr);
    process.stderr.write = ((s: string) => { writes.push(String(s)); return true; }) as typeof process.stderr.write;
    try {
      expect(await runCli(['run', '--data-dir', dir])).toBe(2);
    } finally {
      process.stderr.write = err;
      if (previous !== undefined) process.env['DUDE_HUB_UNRELEASED_PUBLIC'] = previous;
    }
    expect(writes.join('')).toMatch(/not released until Phase 31F/);
    expect(writes.join('')).toMatch(/DUDE_HUB_UNRELEASED_PUBLIC=1/);
  });
});
