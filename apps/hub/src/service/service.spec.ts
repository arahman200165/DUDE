import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { HUB_DEFAULT_PORT } from '@dude/contracts/hub';
import { buildAdminMethods } from '../admin/methods.js';
import { parseArgs } from '../cli/args.js';
import { hubPaths } from '../config/data-dir.js';
import { openHubDb } from '../db/open-hub-db.js';
import { HUB_MIGRATIONS } from '../db/migrations/index.js';
import { tempDir } from '../server/test-helpers.js';
import { generateSelfSigned } from '../tls/self-signed.js';
import { runDoctor, redactLine } from './doctor.js';
import { runServiceInstall } from './install.js';
import { runServiceControl, runServiceStatus, runServiceUninstall, runServiceUpdate } from './lifecycle.js';
import { runNetwork } from './network.js';
import { fixture, helloFor } from './test-helpers.js';
import { buildServiceXml, quoteArg, xmlEscape } from './winsw-xml.js';

const ACL_ARGS = ['/inheritance:r', '/grant:r', '*S-1-5-18:(OI)(CI)F', '*S-1-5-32-544:(OI)(CI)F', 'NT SERVICE\\DudeHub:(OI)(CI)M'];

describe('WinSW configuration', () => {
  it('escapes XML and quotes paths with spaces', () => {
    const xml = buildServiceXml({ dataDir: 'C:\\Program Data\\A&B <x>\\Hub' });
    expect(xml).toContain('<id>DudeHub</id>');
    expect(xml).toContain('<name>DUDE Hub</name>');
    expect(xml).toContain('<executable>%BASE%\\dude-hub.exe</executable>');
    expect(xml).toContain('<arguments>run --data-dir &quot;C:\\Program Data\\A&amp;B &lt;x&gt;\\Hub&quot;</arguments>');
    expect(xml).toContain('<startmode>Automatic</startmode>');
    expect(xml).toContain('<delayedAutoStart>true</delayedAutoStart>');
    expect(xml.match(/<onfailure action="restart" delay="10 sec"\/>/g)).toHaveLength(3);
    expect(xml).toContain('<onfailure action="none"/>');
    expect(xml).toContain('<resetfailure>1 hour</resetfailure>');
    expect(xml).toContain('<stoptimeout>15 sec</stoptimeout>');
    expect(xml).toContain('<log mode="roll-by-size">');
    expect(xml).toContain('<keepFiles>5</keepFiles>');
    expect(xml).toContain(`<logpath>${xmlEscape(path.join('C:\\Program Data\\A&B <x>\\Hub', 'logs', 'service'))}</logpath>`);
  });

  it('leaves simple paths unquoted and rejects embedded quotes', () => {
    expect(quoteArg('C:\\Hub')).toBe('C:\\Hub');
    expect(quoteArg('C:\\My Hub')).toBe('"C:\\My Hub"');
    expect(() => quoteArg('C:\\bad"dir')).toThrow();
    expect(xmlEscape(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&apos;&amp;&apos;&lt;/a&gt;');
  });
});

describe('argument parsing', () => {
  it('parses the service, network, doctor and purge commands', () => {
    expect(parseArgs(['service', 'install', '--port', '48000', '--lan', '--install-dir', 'C:\\Hub'])).toEqual({ command: 'service', action: 'install', port: 48000, lan: true, installDir: 'C:\\Hub' });
    expect(parseArgs(['service', 'update', '--source=D:\\stage'])).toEqual({ command: 'service', action: 'update', source: 'D:\\stage' });
    expect(parseArgs(['service', 'uninstall', '--keep-data'])).toEqual({ command: 'service', action: 'uninstall', keepData: true });
    expect(parseArgs(['network', 'lan', 'on', '--data-dir', 'x'])).toEqual({ command: 'network', action: 'lan-on', dataDir: 'x' });
    expect(parseArgs(['network', 'lan', 'off'])).toEqual({ command: 'network', action: 'lan-off' });
    expect(parseArgs(['network', 'status'])).toEqual({ command: 'network', action: 'status' });
    expect(parseArgs(['doctor', '--data-dir', 'x'])).toEqual({ command: 'doctor', dataDir: 'x' });
    expect(parseArgs(['purge', '--data-dir', 'x', '--include-backups', '--confirm', 't', '--type', 'DELETE HUB DATA'])).toEqual({
      command: 'purge', dataDir: 'x', includeBackups: true, confirm: 't', type: 'DELETE HUB DATA',
    });
  });

  it('rejects unknown actions, flags and ports', () => {
    expect(() => parseArgs(['service'])).toThrow(/Usage/);
    expect(() => parseArgs(['service', 'install', '--purge'])).toThrow(/Unknown flag/);
    expect(() => parseArgs(['service', 'start', '--lan'])).toThrow(/Unknown flag/);
    expect(() => parseArgs(['service', 'install', '--port', '99999'])).toThrow(/--port/);
    expect(() => parseArgs(['network', 'lan', 'maybe'])).toThrow(/Usage/);
  });
});

describe('service install', () => {
  it('registers, secures, configures, starts and verifies in order', async () => {
    const f = fixture();
    const code = await runServiceInstall({ installDir: f.installDir, dataDir: f.dataDir, port: 48123 }, f.deps);
    expect(code).toBe(0);

    const wrapper = path.join(f.installDir, 'DudeHub.exe');
    const sequence = f.system.calls.filter((c) => !c.startsWith('fltmc') && !c.startsWith('sc.exe query'));
    expect(sequence).toEqual([
      `${wrapper} install`,
      'sc.exe config DudeHub obj= NT SERVICE\\DudeHub',
      `icacls ${f.dataDir} ${ACL_ARGS.join(' ')}`,
      `icacls ${f.installDir} /grant NT SERVICE\\DudeHub:(OI)(CI)RX`,
      `${wrapper} start`,
    ]);

    expect(existsSync(path.join(f.installDir, 'dude-hub.exe'))).toBe(true);
    expect(existsSync(path.join(f.installDir, 'service', 'web', 'index.html'))).toBe(true);
    expect(readFileSync(path.join(f.installDir, 'DudeHub.xml'), 'utf8')).toContain(`run --data-dir`);
    const paths = hubPaths(f.dataDir);
    expect(JSON.parse(readFileSync(paths.configFile, 'utf8'))).toEqual({ port: 48123, bind: 'loopback', webRoot: path.join(f.installDir, 'service', 'web') });
    expect(existsSync(path.join(paths.logsDir, 'service'))).toBe(true);

    const result = JSON.parse(f.out.join('')) as Record<string, unknown>;
    expect(result).toMatchObject({ installed: true, url: 'https://127.0.0.1:48123', spkiSha256: 'A'.repeat(43) });
    expect(f.out.join('')).not.toMatch(/token/i);
  });

  it('adds the private-profile firewall rule and binds to the LAN with --lan', async () => {
    const f = fixture();
    expect(await runServiceInstall({ installDir: f.installDir, dataDir: f.dataDir, lan: true }, f.deps)).toBe(0);
    expect(JSON.parse(readFileSync(hubPaths(f.dataDir).configFile, 'utf8'))).toMatchObject({ port: HUB_DEFAULT_PORT, bind: 'lan' });
    expect(f.system.calls).toContain(
      `netsh advfirewall firewall add rule name=DUDE Hub (LAN) dir=in action=allow protocol=TCP localport=${HUB_DEFAULT_PORT} profile=private program=${path.join(f.installDir, 'dude-hub.exe')}`,
    );
    expect(f.system.firewallRule).toBe(true);
  });

  it('refuses without elevation (exit 2) and touches nothing', async () => {
    const f = fixture({ elevated: false });
    expect(await runServiceInstall({ installDir: f.installDir, dataDir: f.dataDir }, f.deps)).toBe(2);
    expect(f.err.join('')).toMatch(/elevated/);
    expect(f.system.calls).toEqual(['fltmc']);
    expect(existsSync(f.installDir)).toBe(false);
  });

  it('refuses on non-Windows platforms and when already installed', async () => {
    const other = fixture();
    expect(await runServiceInstall({}, { ...other.deps, platform: 'linux' })).toBe(2);
    expect(other.system.calls).toEqual([]);
    const f = fixture({ state: 'running' });
    expect(await runServiceInstall({ installDir: f.installDir, dataDir: f.dataDir }, f.deps)).toBe(1);
    expect(f.err.join('')).toMatch(/already registered/);
  });

  it('does not start the service when securing the data directory fails', async () => {
    const f = fixture();
    f.system.override = (file) => (file === 'icacls' ? { stdout: '', stderr: 'denied', code: 5 } : undefined);
    expect(await runServiceInstall({ installDir: f.installDir, dataDir: f.dataDir }, f.deps)).toBe(1);
    expect(f.system.calls.some((c) => c.endsWith('DudeHub.exe start'))).toBe(false);
  });

  it('reports a Hub that never answers', async () => {
    const f = fixture({}, { hello: async () => null });
    expect(await runServiceInstall({ installDir: f.installDir, dataDir: f.dataDir }, f.deps)).toBe(1);
    expect(f.err.join('')).toMatch(/did not answer/);
  });
});

describe('service lifecycle', () => {
  it('uninstall removes the service and rule but keeps the data, reporting the device count read before stopping', async () => {
    const f = fixture();
    await runServiceInstall({ installDir: f.installDir, dataDir: f.dataDir }, f.deps);
    f.system.firewallRule = true;
    f.system.calls.length = 0;
    f.out.length = 0;
    const order: string[] = [];
    const call = async (_dir: string, method: string): Promise<unknown> => {
      order.push(`${method}@${f.system.state}`);
      return { deviceCount: 3 };
    };
    expect(await runServiceUninstall({ installDir: f.installDir, dataDir: f.dataDir }, { ...f.deps, call })).toBe(0);
    expect(order).toEqual(['status@running']);
    const wrapper = path.join(f.installDir, 'DudeHub.exe');
    expect(f.system.calls).toContain(`${wrapper} stop`);
    expect(f.system.calls).toContain(`${wrapper} uninstall`);
    expect(f.system.calls.indexOf(`${wrapper} stop`)).toBeLessThan(f.system.calls.indexOf(`${wrapper} uninstall`));
    expect(f.system.calls).toContain('netsh advfirewall firewall delete rule name=DUDE Hub (LAN)');
    expect(f.system.firewallRule).toBe(false);
    expect(existsSync(path.join(f.installDir, 'dude-hub.exe'))).toBe(false);
    expect(existsSync(hubPaths(f.dataDir).configFile)).toBe(true);
    expect(JSON.parse(f.out.join(''))).toMatchObject({ uninstalled: true, dataKept: true, dataDir: f.dataDir, registeredDevices: 3 });
    expect(f.err.join('')).toMatch(/3 registered devices/);
  });

  it('uninstall tolerates an unreachable Hub and never deletes data', async () => {
    const f = fixture({ state: 'stopped' });
    mkdirSync(hubPaths(f.dataDir).configDir, { recursive: true });
    writeFileSync(hubPaths(f.dataDir).configFile, '{}');
    expect(await runServiceUninstall({ installDir: f.installDir, dataDir: f.dataDir }, f.deps)).toBe(0);
    expect(JSON.parse(f.out.join(''))).toMatchObject({ registeredDevices: null, dataKept: true });
    expect(existsSync(hubPaths(f.dataDir).configFile)).toBe(true);
    expect(f.system.calls.some((c) => c.startsWith('sc.exe delete DudeHub'))).toBe(true);
  });

  it('start, stop and restart drive the wrapper and verify with hello', async () => {
    const f = fixture({ state: 'stopped' });
    const wrapper = path.join(f.installDir, 'DudeHub.exe');
    expect(await runServiceControl('start', { installDir: f.installDir, dataDir: f.dataDir }, f.deps)).toBe(0);
    expect(f.system.calls).toContain(`${wrapper} start`);
    f.system.calls.length = 0;
    expect(await runServiceControl('restart', { installDir: f.installDir, dataDir: f.dataDir }, f.deps)).toBe(0);
    expect(f.system.calls.filter((c) => c.startsWith(wrapper))).toEqual([`${wrapper} stop`, `${wrapper} start`]);
    f.system.calls.length = 0;
    expect(await runServiceControl('stop', { installDir: f.installDir, dataDir: f.dataDir }, f.deps)).toBe(0);
    expect(f.system.state).toBe('stopped');
  });

  it('refuses every command without elevation and reports a missing service', async () => {
    const f = fixture({ elevated: false, state: 'running' });
    expect(await runServiceControl('stop', {}, f.deps)).toBe(2);
    expect(await runServiceStatus({}, f.deps)).toBe(2);
    expect(await runServiceUninstall({}, f.deps)).toBe(2);
    expect(await runServiceUpdate({ source: f.sourceDir }, f.deps)).toBe(2);
    const missing = fixture({ state: 'not-installed' });
    expect(await runServiceControl('start', { installDir: missing.installDir, dataDir: missing.dataDir }, missing.deps)).toBe(1);
  });

  it('status combines the SCM state, hello and the admin status', async () => {
    const f = fixture({ state: 'running' });
    const call = async (): Promise<unknown> => ({ deviceCount: 1, bootstrapped: true });
    expect(await runServiceStatus({ installDir: f.installDir, dataDir: f.dataDir }, { ...f.deps, call })).toBe(0);
    expect(JSON.parse(f.out.join(''))).toMatchObject({ installed: true, state: 'running', reachable: true, admin: { deviceCount: 1 } });
  });

  it('update stops, replaces the binaries and web assets, starts and prints old and new versions', async () => {
    const f = fixture();
    await runServiceInstall({ installDir: f.installDir, dataDir: f.dataDir }, f.deps);
    const stage = path.join(path.dirname(f.sourceDir), 'stage2');
    mkdirSync(path.join(stage, 'service', 'web'), { recursive: true });
    writeFileSync(path.join(stage, 'dude-hub.exe'), 'new-hub-binary');
    writeFileSync(path.join(stage, 'service', 'web', 'new.html'), 'new');
    f.out.length = 0;
    f.system.calls.length = 0;
    let version = '1.0.0';
    const hello = async () => helloFor(version);
    const base = { ...f.deps, hello, call: async () => ({ deviceCount: 2 }) };
    const wrapper = path.join(f.installDir, 'DudeHub.exe');
    f.system.override = (file, args) => {
      if (file === wrapper && args[0] === 'start') version = '2.0.0';
      return undefined;
    };
    expect(await runServiceUpdate({ installDir: f.installDir, dataDir: f.dataDir, source: stage }, base)).toBe(0);
    expect(f.system.calls.filter((c) => c.startsWith(wrapper))).toEqual([`${wrapper} stop`, `${wrapper} start`]);
    expect(readFileSync(path.join(f.installDir, 'dude-hub.exe'), 'utf8')).toBe('new-hub-binary');
    expect(existsSync(path.join(f.installDir, 'service', 'web', 'new.html'))).toBe(true);
    expect(existsSync(path.join(f.installDir, 'service', 'web', 'index.html'))).toBe(false);
    expect(JSON.parse(f.out.join(''))).toMatchObject({ updated: true, oldHubVersion: '1.0.0', newHubVersion: '2.0.0', registeredDevices: 2 });
  });

  it('update validates its source', async () => {
    const f = fixture({ state: 'running' });
    expect(await runServiceUpdate({ installDir: f.installDir, dataDir: f.dataDir }, f.deps)).toBe(2);
    expect(await runServiceUpdate({ installDir: f.installDir, dataDir: f.dataDir, source: path.join(f.sourceDir, 'missing') }, f.deps)).toBe(2);
    expect(f.system.calls.some((c) => c.includes(' stop'))).toBe(false);
  });
});

describe('network lan', () => {
  const installedFixture = async () => {
    const f = fixture();
    await runServiceInstall({ installDir: f.installDir, dataDir: f.dataDir, port: 48200 }, f.deps);
    f.system.calls.length = 0;
    f.out.length = 0;
    return f;
  };

  it('on: sets the bind over the admin channel, adds the rule, then restarts', async () => {
    const f = await installedFixture();
    const methods: string[] = [];
    const call = async (_d: string, method: string, params: unknown): Promise<unknown> => {
      methods.push(`${method} ${JSON.stringify(params)}`);
      return method === 'status' ? { bind: 'loopback' } : { port: 48200, restartRequired: true };
    };
    expect(await runNetwork({ action: 'lan-on', installDir: f.installDir, dataDir: f.dataDir }, { ...f.deps, call })).toBe(0);
    expect(methods).toEqual(['status {}', 'network.set {"bind":"lan"}']);
    const wrapper = path.join(f.installDir, 'DudeHub.exe');
    const calls = f.system.calls.filter((c) => !c.startsWith('fltmc') && !c.startsWith('sc.exe query'));
    expect(calls).toEqual([
      'netsh advfirewall firewall delete rule name=DUDE Hub (LAN)',
      `netsh advfirewall firewall add rule name=DUDE Hub (LAN) dir=in action=allow protocol=TCP localport=48200 profile=private program=${path.join(f.installDir, 'dude-hub.exe')}`,
      `${wrapper} stop`,
      `${wrapper} start`,
    ]);
    expect(f.out.join("")).toContain('"restarted": true');
  });

  it('off: removes the rule and restarts', async () => {
    const f = await installedFixture();
    f.system.firewallRule = true;
    const call = async (_d: string, method: string): Promise<unknown> => (method === 'status' ? { bind: 'lan' } : { port: 48200 });
    expect(await runNetwork({ action: 'lan-off', installDir: f.installDir, dataDir: f.dataDir }, { ...f.deps, call })).toBe(0);
    expect(f.system.firewallRule).toBe(false);
    expect(f.system.calls.filter((c) => c.includes('firewall'))).toEqual(['netsh advfirewall firewall delete rule name=DUDE Hub (LAN)']);
    expect(f.system.calls.some((c) => c.endsWith('DudeHub.exe start'))).toBe(true);
  });

  it('refuses without elevation when a service is installed', async () => {
    const f = fixture({ state: 'running', elevated: false });
    expect(await runNetwork({ action: 'lan-on', dataDir: f.dataDir }, f.deps)).toBe(2);
    expect(f.system.calls.some((c) => c.startsWith('netsh'))).toBe(false);
  });

  it('with no service installed, edits the config only while no Hub runs and skips firewall and restart', async () => {
    const f = fixture({ state: 'not-installed' });
    const paths = hubPaths(f.dataDir);
    mkdirSync(paths.configDir, { recursive: true });
    writeFileSync(paths.configFile, JSON.stringify({ port: 48300, bind: 'loopback' }));
    expect(await runNetwork({ action: 'lan-on', dataDir: f.dataDir }, f.deps)).toBe(0);
    expect(JSON.parse(readFileSync(paths.configFile, 'utf8'))).toEqual({ port: 48300, bind: 'lan' });
    expect(f.system.calls.filter((c) => !c.startsWith('sc.exe'))).toEqual([]);
    expect(f.err.join('')).toMatch(/config was edited only/);

    const running = fixture({ state: 'not-installed' }, { call: async () => ({ bind: 'loopback' }) });
    mkdirSync(hubPaths(running.dataDir).configDir, { recursive: true });
    writeFileSync(hubPaths(running.dataDir).configFile, JSON.stringify({ port: 48300, bind: 'loopback' }));
    expect(await runNetwork({ action: 'lan-on', dataDir: running.dataDir }, running.deps)).toBe(1);
    expect(JSON.parse(readFileSync(hubPaths(running.dataDir).configFile, 'utf8')).bind).toBe('loopback');
  });

  it('status reports the running bind, the configured bind and the rule', async () => {
    const f = fixture({ state: 'running', firewallRule: true });
    const paths = hubPaths(f.dataDir);
    mkdirSync(paths.configDir, { recursive: true });
    writeFileSync(paths.configFile, JSON.stringify({ port: 48300, bind: 'lan' }));
    expect(await runNetwork({ action: 'status', dataDir: f.dataDir }, { ...f.deps, call: async () => ({ bind: 'lan', port: 48300 }) })).toBe(0);
    expect(JSON.parse(f.out.join(''))).toMatchObject({ running: true, runningBind: 'lan', configuredBind: 'lan', port: 48300, firewallRule: true, serviceState: 'running' });
  });
});

describe('admin status and network.set', () => {
  function methodsFor(bind: 'loopback' | 'lan' = 'loopback') {
    const root = tempDir('hub-status-');
    const paths = hubPaths(root);
    const opened = openHubDb({ dbFile: paths.dbFile, preMigrationDir: paths.preMigrationDir });
    if (opened.status !== 'ready') throw new Error('db');
    mkdirSync(paths.configDir, { recursive: true });
    writeFileSync(paths.configFile, JSON.stringify({ port: 4711, bind }));
    const methods = buildAdminMethods({
      db: opened.hub.db, hubVersion: '9.9.9', hubInstanceId: opened.hub.hubInstanceId, bind, getPort: () => 4711, startedAt: 1000,
      configDir: paths.configDir, configFile: paths.configFile, spkiSha256: 'B'.repeat(43), now: () => 6000,
    });
    return { methods, paths, hub: opened.hub };
  }

  it('reports schema, migrations, bind, uptime and counts without secrets', async () => {
    const { methods, hub } = methodsFor();
    const status = (await methods['status']!({})) as Record<string, unknown>;
    expect(status).toMatchObject({
      hubVersion: '9.9.9', bootstrapped: false, bind: 'loopback', lanMode: false, port: 4711, uptimeSeconds: 5, spkiSha256: 'B'.repeat(43), deviceCount: 0,
      schemaVersion: HUB_MIGRATIONS.length, pendingMigrations: [],
    });
    expect(typeof status['minReaderVersion']).toBe('number');
    expect((status['migrations'] as unknown[]).length).toBe(HUB_MIGRATIONS.length);
    expect(JSON.stringify(status)).not.toMatch(/token|password|secret/i);
    hub.close();
  });

  it('network.set rewrites the config, audits the change and flags the restart', async () => {
    const { methods, paths, hub } = methodsFor();
    expect(await methods['network.set']!({ bind: 'lan' })).toMatchObject({ bind: 'lan', previous: 'loopback', restartRequired: true });
    expect(JSON.parse(readFileSync(paths.configFile, 'utf8'))).toEqual({ port: 4711, bind: 'lan' });
    const rows = hub.db.prepare("SELECT event, actor_kind FROM audit_events WHERE event = 'network.mode-changed'").all();
    expect(rows).toHaveLength(1);
    await expect(Promise.resolve().then(() => methods['network.set']!({ bind: 'wan' }))).rejects.toMatchObject({ code: 'bad-request' });
    hub.close();
  });
});

describe('doctor', () => {
  it('masks secrets in log lines', () => {
    expect(redactLine('{"level":30,"msg":"ok","statusCode":200,"token":"abc123","setupCode":"XYZ","password":"hunter2"}')).toBe(
      '{"level":30,"msg":"ok","statusCode":200,"token":"[redacted]","setupCode":"[redacted]","password":"[redacted]"}',
    );
    expect(redactLine('Authorization: Bearer abcdefghijklmnop')).toBe('Authorization: [redacted]');
    expect(redactLine('cookie=dude_session=abcdef; other=1')).not.toContain('abcdef');
    expect(redactLine('GET /x?code=ABCD-EFGH&page=2 token=zzz')).toBe('GET /x?code=[redacted]&page=2 token=[redacted]');
    expect(redactLine('listening on 127.0.0.1')).toBe('listening on 127.0.0.1');
  });

  it('works with the service down: skips admin fields, never opens the database, redacts the log tail', async () => {
    const f = fixture({ state: 'stopped' });
    const paths = hubPaths(f.dataDir);
    mkdirSync(paths.tlsDir, { recursive: true });
    mkdirSync(paths.logsDir, { recursive: true });
    mkdirSync(paths.dataDir, { recursive: true });
    writeFileSync(paths.dbFile, 'not a database'); // would fail loudly if opened
    writeFileSync(`${paths.dbFile}-wal`, '12345');
    writeFileSync(path.join(paths.tlsDir, 'cert.pem'), generateSelfSigned({ hubInstanceId: 'h' }).certPem);
    const lines = Array.from({ length: 60 }, (_, i) => `{"n":${i},"token":"secret-${i}"}`);
    writeFileSync(path.join(paths.logsDir, 'hub.log'), `${lines.join('\n')}\n`);
    expect(await runDoctor({ hubVersion: '1.2.3', dataDir: f.dataDir, installDir: f.installDir }, f.deps)).toBe(0);
    const text = f.out.join('');
    const report = JSON.parse(text) as Record<string, any>;
    expect(report).toMatchObject({ hubVersion: '1.2.3', admin: null, service: { state: 'stopped' }, lanFirewallRule: false });
    expect(report['adminNote']).toMatch(/not reachable/);
    expect(report['database']).toEqual({ dbBytes: 14, walBytes: 5 });
    expect(report['tls']).toMatchObject({ expired: false });
    expect(report['tls'].spkiSha256).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(typeof report['freeDiskBytes']).toBe('number');
    expect(report['logTail']).toHaveLength(50);
    expect(text).not.toContain('secret-');
  });

  it('includes the admin status when the Hub answers', async () => {
    const f = fixture({ state: 'running' });
    const call = async (): Promise<unknown> => ({ schemaVersion: 2, migrations: [], pendingMigrations: [] });
    await runDoctor({ hubVersion: '1', dataDir: f.dataDir }, { ...f.deps, call });
    expect(JSON.parse(f.out.join(''))).toMatchObject({ admin: { schemaVersion: 2 } });
  });
});
