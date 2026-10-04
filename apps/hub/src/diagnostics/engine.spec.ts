import type { NetworkInterfaceInfo } from 'node:os';
import { describe, expect, it } from 'vitest';
import { Value } from 'typebox/value';
import { HubDiagnosticsReport } from '@dude/contracts/hub';
import type { DiagnosticCheck } from '@dude/contracts/hub';
import { generateSelfSigned } from '../tls/self-signed.js';
import { collectDiagnostics, formatChecks } from './engine.js';
import type { DiagnosticsDeps } from './engine.js';
import { createHostFacts } from './gather.js';
import type { InterfaceMap } from './addresses.js';
import type { ExecResult } from '../service/common.js';

const NOW = Date.parse('2026-10-03T00:00:00.000Z');
const cert = generateSelfSigned({ hubInstanceId: 'h', now: new Date(NOW - 86_400_000), validityYears: 1 });

function deps(over: Partial<DiagnosticsDeps> = {}, certOver: Partial<NonNullable<DiagnosticsDeps['certificate']>> = {}): DiagnosticsDeps {
  return {
    now: NOW, hubVersion: '1.0.0', running: true, serviceMode: 'foreground', uptimeSeconds: 42, schemaVersion: 5, platform: 'win32',
    config: { port: 47821, bind: 'loopback', bindAddress: '127.0.0.1', exposure: { mode: 'private', names: [] } },
    wantedNames: ['localhost', '127.0.0.1'],
    certificate: { pem: cert.certPem, source: 'self-signed', nextSpkiSha256: null, pendingAcks: 0, chainLength: 1, ca: null, hsts: false, ...certOver },
    proxyPins: { active: null, next: null }, ownerExists: true,
    realtime: { available: true, owner: 1, device: 2 },
    host: () => Promise.resolve({ serviceState: 'running', firewallPresent: false }),
    ...over,
  };
}

const byId = async (d: DiagnosticsDeps): Promise<Record<string, DiagnosticCheck>> =>
  Object.fromEntries((await collectDiagnostics(d)).checks.map((c) => [c.id, c]));

describe('collectDiagnostics', () => {
  it('builds a schema-valid report with every check once, redaction-safe', async () => {
    const report = await collectDiagnostics(deps());
    expect(Value.Check(HubDiagnosticsReport, report)).toBe(true);
    expect(report.checks.map((c) => c.id)).toEqual([
      'service-running', 'https-configured', 'certificate-valid', 'certificate-covers-names', 'certificate-trustable', 'next-pin-pending',
      'authentication-active', 'realtime-available', 'firewall-rule', 'public-firewall-rule', 'native-ports-exposed', 'exposure-mode', 'proxy-trust', 'container-host-allowlist', 'address-stability', 'dns-resolution', 'external-reachability',
    ]);
    expect(report.exposure).not.toHaveProperty('publicReleased');
    expect(report.realtime.connections).toEqual({ owner: 1, device: 2 });
    expect(report.certificate?.spkiSha256).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(JSON.stringify(report)).not.toContain('PRIVATE KEY');
    expect(JSON.stringify(report)).not.toContain('BEGIN CERTIFICATE');
    expect(formatChecks(report)).toContain('[PASS] Hub is running (verified)');
  });

  it('service and https: verified when running; fail/warn/not-checked when no Hub answers', async () => {
    const up = await byId(deps());
    expect(up['service-running']).toMatchObject({ status: 'pass', basis: 'verified' });
    expect(up['https-configured']).toMatchObject({ status: 'pass', basis: 'verified' });
    const down = await byId(deps({ running: false, host: () => Promise.resolve({ serviceState: 'stopped', firewallPresent: null }) }));
    expect(down['service-running']).toMatchObject({ status: 'fail', fix: 'dude-hub service start' });
    expect(down['https-configured']).toMatchObject({ status: 'info', basis: 'not-checked' });
    const noAdmin = await byId(deps({ running: false, host: () => Promise.resolve({ serviceState: 'running', firewallPresent: null }) }));
    expect(noAdmin['service-running']?.status).toBe('warn');
  });

  it('certificate-valid: pass, warn under 30 days unless automatically renewed, fail when expired', async () => {
    expect((await byId(deps()))['certificate-valid']).toMatchObject({ status: 'pass', basis: 'verified' });
    const soon = NOW + 340 * 86_400_000;
    const warn = (await byId(deps({ now: soon })))['certificate-valid'];
    expect(warn).toMatchObject({ status: 'warn', fix: 'dude-hub tls rotate' });
    const auto = (await byId(deps({ now: soon }, { source: 'local-ca' })))['certificate-valid'];
    expect(auto?.status).toBe('pass');
    expect(auto?.detail).toMatch(/renewed automatically/);
    const imported = (await byId(deps({ now: soon }, { source: 'imported' })))['certificate-valid'];
    expect(imported?.fix).toMatch(/tls import/);
    const expired = (await byId(deps({ now: NOW + 800 * 86_400_000 })))['certificate-valid'];
    expect(expired).toMatchObject({ status: 'fail' });
    expect((await byId(deps({ certificate: null })))['certificate-valid']?.status).toBe('fail');
  });

  it('certificate-covers-names lists missing names and points at tls names add, or at activate when a pin is staged', async () => {
    const missing = (await byId(deps({ wantedNames: ['localhost', 'hub.lan'] })))['certificate-covers-names'];
    expect(missing).toMatchObject({ status: 'warn', basis: 'verified', fix: 'dude-hub tls names add hub.lan' });
    expect(missing?.detail).toContain('hub.lan');
    const staged = (await byId(deps({ wantedNames: ['hub.lan'] }, { nextSpkiSha256: 'n'.repeat(43) })))['certificate-covers-names'];
    expect(staged?.fix).toBe('dude-hub tls activate');
    expect((await byId(deps()))['certificate-covers-names']?.status).toBe('pass');
  });

  it('certificate-trustable by source (claimed: browser trust is the client\'s)', async () => {
    expect((await byId(deps()))['certificate-trustable']).toMatchObject({ status: 'info', basis: 'claimed' });
    const lan = await byId(deps({ config: { port: 1, bind: 'lan', bindAddress: '0.0.0.0', exposure: { mode: 'private', names: [] } } }));
    expect(lan['certificate-trustable']).toMatchObject({ status: 'warn', fix: 'dude-hub tls ca init' });
    expect((await byId(deps({}, { source: 'local-ca' })))['certificate-trustable']).toMatchObject({ status: 'info', fix: 'dude-hub tls ca export' });
    expect((await byId(deps({}, { source: 'imported' })))['certificate-trustable']).toMatchObject({ status: 'pass', basis: 'claimed' });
    expect((await byId(deps({}, { source: 'acme' })))['certificate-trustable']).toMatchObject({ status: 'pass', basis: 'claimed' });
  });

  it('next-pin-pending: info with the pending count while a pin awaits acknowledgements', async () => {
    const check = (await byId(deps({}, { nextSpkiSha256: 'n'.repeat(43), pendingAcks: 3 })))['next-pin-pending'];
    expect(check).toMatchObject({ status: 'info', basis: 'verified', fix: 'dude-hub tls activate' });
    expect(check?.detail).toContain('3 device');
    expect((await byId(deps()))['next-pin-pending']?.status).toBe('pass');
  });

  it('authentication-active: verified owner, warn without an owner, not-checked offline', async () => {
    expect((await byId(deps()))['authentication-active']).toMatchObject({ status: 'pass', basis: 'verified' });
    expect((await byId(deps({ ownerExists: false })))['authentication-active']).toMatchObject({ status: 'warn', fix: 'dude-hub setup-token' });
    expect((await byId(deps({ ownerExists: null })))['authentication-active']).toMatchObject({ status: 'info', basis: 'not-checked' });
  });

  it('realtime-available: pass, fail when missing, not-checked offline', async () => {
    expect((await byId(deps()))['realtime-available']).toMatchObject({ status: 'pass', basis: 'verified' });
    expect((await byId(deps({ realtime: { available: false, owner: 0, device: 0 } })))['realtime-available']?.status).toBe('fail');
    expect((await byId(deps({ running: false })))['realtime-available']?.basis).toBe('not-checked');
  });

  it('firewall-rule: verified on Windows LAN, claimed elsewhere, n/a on loopback', async () => {
    const lan = { port: 47821, bind: 'lan' as const, bindAddress: '0.0.0.0', exposure: { mode: 'private' as const, names: [] } };
    const missing = await collectDiagnostics(deps({ config: lan }));
    expect(missing.checks.find((c) => c.id === 'firewall-rule')).toMatchObject({ status: 'warn', basis: 'verified', fix: 'dude-hub network lan on' });
    expect(missing.firewall).toEqual({ applicable: true, ruleName: 'DUDE Hub (LAN)', present: false, profile: null });
    const present = await collectDiagnostics(deps({ config: lan, host: () => Promise.resolve({ firewallPresent: true }) }));
    expect(present.checks.find((c) => c.id === 'firewall-rule')).toMatchObject({ status: 'pass', basis: 'verified' });
    expect(present.firewall).toMatchObject({ present: true, profile: 'private' });
    const unknown = await collectDiagnostics(deps({ config: lan, host: () => Promise.resolve({ firewallPresent: null }) }));
    expect(unknown.checks.find((c) => c.id === 'firewall-rule')).toMatchObject({ status: 'warn', basis: 'claimed' });
    const linux = await collectDiagnostics(deps({ config: lan, platform: 'linux' }));
    expect(linux.checks.find((c) => c.id === 'firewall-rule')).toMatchObject({ status: 'info', basis: 'claimed' });
    expect(linux.firewall).toMatchObject({ applicable: false, present: null });
    const loop = await collectDiagnostics(deps());
    expect(loop.checks.find((c) => c.id === 'firewall-rule')).toMatchObject({ status: 'info', basis: 'verified' });
  });

  it('exposure-mode: info for private, warn for public (readiness is enforced when the mode is set)', async () => {
    expect((await byId(deps()))['exposure-mode']?.status).toBe('info');
    const pub = (await byId(deps({ config: { port: 1, bind: 'loopback', bindAddress: '127.0.0.1', exposure: { mode: 'public', names: [] } } })))['exposure-mode'];
    expect(pub).toMatchObject({ status: 'warn', basis: 'verified' });
    expect(pub?.detail).toContain('The Hub is configured for Internet exposure.');
    expect(pub?.detail).toContain('enforced when the mode is set');
  });

  it('proxy-trust: claimed; warns without an active proxy pin', async () => {
    const proxyConfig = { port: 1, bind: 'loopback' as const, bindAddress: '127.0.0.1', exposure: { mode: 'private' as const, names: ['hub.example.com'], proxy: { trusted: ['10.0.0.1'], publicOrigin: 'https://hub.example.com' } } };
    const warn = await collectDiagnostics(deps({ config: proxyConfig }));
    expect(warn.checks.find((c) => c.id === 'proxy-trust')).toMatchObject({ status: 'warn', basis: 'claimed' });
    expect(warn.exposure).toMatchObject({ canonicalOrigin: 'https://hub.example.com', proxy: { trusted: ['10.0.0.1'] } });
    const ok = await collectDiagnostics(deps({ config: proxyConfig, proxyPins: { active: 'a'.repeat(43), next: null } }));
    expect(ok.checks.find((c) => c.id === 'proxy-trust')).toMatchObject({ status: 'pass', basis: 'claimed' });
    expect((await byId(deps()))['proxy-trust']?.detail).toMatch(/No reverse proxy/);
  });

  it('container-host-allowlist: warns when container mode has no names', async () => {
    const container = { port: 1, bind: 'container' as const, bindAddress: '0.0.0.0', exposure: { mode: 'private' as const, names: [] as string[] } };
    expect((await byId(deps({ config: container, platform: 'linux' })))['container-host-allowlist']).toMatchObject({ status: 'warn', fix: 'dude-hub tls names add <name>' });
    expect((await byId(deps({ config: { ...container, exposure: { mode: 'private', names: ['hub.lan'] } }, platform: 'linux' })))['container-host-allowlist']?.status).toBe('info');
  });

  it('external-reachability: fresh record passes, stale or none is not-checked (warn in public mode)', async () => {
    const day = 86_400_000;
    const rec = (ageMs: number) => ({ at: new Date(NOW - ageMs).toISOString(), host: 'hub.example.com', ageMs });
    const publicConfig = { port: 443, bind: 'lan' as const, bindAddress: '0.0.0.0', exposure: { mode: 'public' as const, names: ['hub.example.com'] } };
    const none = (await byId(deps()))['external-reachability'];
    expect(none).toMatchObject({ status: 'info', basis: 'not-checked' });
    expect(none?.detail).toMatch(/outside your network/);
    const fresh = (await byId(deps({ reachability: rec(day) })))['external-reachability'];
    expect(fresh).toMatchObject({ status: 'pass', basis: 'verified' });
    expect(fresh?.detail).toMatch(/Reached from a public address via hub\.example\.com at /);
    const stale = (await byId(deps({ reachability: rec(9 * day) })))['external-reachability'];
    expect(stale).toMatchObject({ status: 'info', basis: 'not-checked' });
    expect(stale?.detail).toMatch(/Last verified 9 days ago; verify again\./);
    expect((await byId(deps({ config: publicConfig })))['external-reachability']?.status).toBe('warn');
    expect((await byId(deps({ config: publicConfig, reachability: rec(9 * day) })))['external-reachability']?.status).toBe('warn');
    expect((await byId(deps({ config: publicConfig, reachability: rec(day) })))['external-reachability']?.status).toBe('pass');
  });

  it('a host-facts failure never fails the report', async () => {
    const report = await collectDiagnostics(deps({ host: () => Promise.reject(new Error('netsh missing')) }));
    expect(report.firewall.present).toBeNull();
  });
});

describe('createHostFacts cache', () => {
  it('shells out once per 60 s and survives failures', async () => {
    let t = 0;
    const calls: string[] = [];
    const exec = (file: string, args: readonly string[]): Promise<ExecResult> => {
      calls.push(`${file} ${args[0]}`);
      return Promise.resolve({ stdout: file === 'sc.exe' ? 'STATE : 4  RUNNING' : '', stderr: '', code: 0 });
    };
    const host = createHostFacts({ exec, platform: 'win32', now: () => t });
    expect(await host()).toEqual({ serviceState: 'running', firewallPresent: true });
    const first = calls.length;
    t = 59_000;
    await Promise.all([host(), host()]);
    expect(calls.length).toBe(first);
    t = 61_000;
    await host();
    expect(calls.length).toBe(first * 2);
    const broken = createHostFacts({ exec: () => Promise.reject(new Error('x')), platform: 'win32' });
    expect(await broken()).toMatchObject({ firewallPresent: false });
    expect(await createHostFacts({ exec, platform: 'linux' })()).toEqual({ firewallPresent: null });
  });
});

describe('address checks', () => {
  const info = (address: string, family: 'IPv4' | 'IPv6' = 'IPv4') => ({ address, family, internal: false, netmask: '', mac: '', cidr: null }) as NetworkInterfaceInfo;
  const ifaces = (...a: string[]): (() => InterfaceMap) => () => ({ eth0: a.map((x) => info(x, x.includes(':') ? 'IPv6' : 'IPv4')) });
  const pub = { mode: 'public' as const, names: ['hub.example.com'] };
  const publicConfig = { port: 1, bind: 'lan' as const, bindAddress: '0.0.0.0', exposure: pub };
  const resolving = (addresses: string[], error?: 'not-found' | 'timeout' | 'failed') => () => Promise.resolve([{ name: 'hub.example.com', addresses, ...(error ? { error } : {}) }]);

  it('address-stability: private/CGNAT only in public mode warns; a public address passes', async () => {
    const warn = (await byId(deps({ config: publicConfig, interfaces: ifaces('192.168.1.5', '100.64.0.9'), resolveDns: resolving([]) })))['address-stability'];
    expect(warn).toMatchObject({ status: 'warn', basis: 'verified' });
    expect(warn?.detail).toContain('carrier-grade NAT');
    expect((await byId(deps({ config: publicConfig, interfaces: ifaces('192.168.1.5', '2001:db8::5'), resolveDns: resolving([]) })))['address-stability']?.status).toBe('pass');
    expect((await byId(deps({ interfaces: ifaces('192.168.1.5') })))['address-stability']?.status).toBe('pass');
  });
  it('address-stability: warns when the stored record differs from the live set', async () => {
    expect((await byId(deps({ interfaces: ifaces('192.168.1.5'), storedAddresses: ['192.168.1.5'] })))['address-stability']?.status).toBe('pass');
    expect((await byId(deps({ interfaces: ifaces('192.168.1.6', 'fe80::1'), storedAddresses: ['192.168.1.5'] })))['address-stability']?.status).toBe('warn');
  });
  it('dns-resolution: no names is not-checked', async () => {
    expect((await byId(deps()))['dns-resolution']).toMatchObject({ status: 'info', basis: 'not-checked' });
  });
  it('dns-resolution: interface address passes, foreign address is info, failure warns', async () => {
    const base = { config: publicConfig, interfaces: ifaces('203.0.113.7') };
    expect((await byId(deps({ ...base, resolveDns: resolving(['203.0.113.7']) })))['dns-resolution']).toMatchObject({ status: 'pass', basis: 'verified' });
    const foreign = (await byId(deps({ ...base, resolveDns: resolving(['198.51.100.1']) })))['dns-resolution'];
    expect(foreign).toMatchObject({ status: 'info', basis: 'verified' });
    expect(foreign?.detail).toContain('external reachability probe');
    expect((await byId(deps({ ...base, resolveDns: resolving([], 'not-found') })))['dns-resolution']).toMatchObject({ status: 'warn', basis: 'verified' });
    expect((await byId(deps({ ...base, resolveDns: () => Promise.reject(new Error('x')) })))['dns-resolution']?.status).toBe('warn');
  });
});

describe('public-firewall-rule and native-ports-exposed (PD-068)', () => {
  const publicCfg = { config: { port: 47821, bind: 'loopback' as const, bindAddress: '127.0.0.1', exposure: { mode: 'public' as const, names: [] as string[] } } };
  const host = (extra: Record<string, unknown>) => (): Promise<{ firewallPresent: null }> => Promise.resolve({ firewallPresent: null, ...extra });
  const agent = (scope: 'loopback' | 'any') => ({ image: 'dude-agent.exe', pid: 7, address: scope === 'any' ? '0.0.0.0' : '127.0.0.1', port: 5555, scope });

  it('public-firewall-rule: pass when valid, warn with the exact command when missing or invalid, info otherwise', async () => {
    const ok = (await byId(deps({ ...publicCfg, host: host({ publicFirewall: { present: true, problems: [] } }) })))['public-firewall-rule'];
    expect(ok).toMatchObject({ status: 'pass', basis: 'verified' });
    const missing = (await byId(deps({ ...publicCfg, host: host({ publicFirewall: { present: false, problems: [] } }) })))['public-firewall-rule'];
    expect(missing).toMatchObject({ status: 'warn', basis: 'verified', fix: 'dude-hub network firewall public on' });
    const bad = (await byId(deps({ ...publicCfg, host: host({ publicFirewall: { present: true, problems: ['The rule is disabled.'] } }) })))['public-firewall-rule'];
    expect(bad).toMatchObject({ status: 'warn', fix: 'dude-hub network firewall public on' });
    expect(bad?.detail).toContain('The rule is disabled.');
    expect((await byId(deps()))['public-firewall-rule']).toMatchObject({ status: 'info', detail: expect.stringContaining('not in public mode') as string });
    const stale = (await byId(deps({ host: host({ publicFirewall: { present: true, problems: [] } }) })))['public-firewall-rule'];
    expect(stale).toMatchObject({ status: 'info', basis: 'verified', fix: 'dude-hub network firewall public off' });
  });

  it('public-firewall-rule: the owner route (no facts) and non-Windows hosts are not-checked', async () => {
    expect((await byId(deps({ ...publicCfg })))['public-firewall-rule']).toMatchObject({
      status: 'info', basis: 'not-checked', detail: 'Run `dude-hub doctor` as administrator on the Hub machine.',
    });
    expect((await byId(deps({ ...publicCfg, platform: 'linux' })))['public-firewall-rule']).toMatchObject({ status: 'info', basis: 'not-checked' });
  });

  it('native-ports-exposed: Agent listener fails (loopback worded differently), desktop LAN is info, none passes', async () => {
    const exposed = (await byId(deps({ host: host({ nativeListeners: { exposed: [agent('any')], desktopLan: [], partial: false } }) })))['native-ports-exposed'];
    expect(exposed).toMatchObject({ status: 'fail', basis: 'verified' });
    expect(exposed?.detail).toContain('reachable from the network');
    const loop = (await byId(deps({ host: host({ nativeListeners: { exposed: [agent('loopback')], partial: false } }) })))['native-ports-exposed'];
    expect(loop?.status).toBe('fail');
    expect(loop?.detail).toContain('listens on loopback');
    const lan = (await byId(deps({ host: host({ nativeListeners: { exposed: [], desktopLan: [{ image: 'dude.exe', pid: 9, address: '0.0.0.0', port: 8080, scope: 'any' }], partial: false } }) })))['native-ports-exposed'];
    expect(lan).toMatchObject({ status: 'info', basis: 'verified' });
    expect(lan?.detail).toContain('0.0.0.0:8080');
    expect((await byId(deps({ host: host({ nativeListeners: { exposed: [], partial: false } }) })))['native-ports-exposed']).toMatchObject({ status: 'pass', basis: 'verified' });
    expect((await byId(deps({ host: host({ nativeListeners: { exposed: [], partial: true } }) })))['native-ports-exposed']).toMatchObject({ status: 'info', basis: 'not-checked' });
  });

  it('native-ports-exposed: not-checked on the owner route and off Windows', async () => {
    expect((await byId(deps()))['native-ports-exposed']).toMatchObject({ basis: 'not-checked', detail: 'Run `dude-hub doctor` as administrator on the Hub machine.' });
    expect((await byId(deps({ platform: 'linux' })))['native-ports-exposed']).toMatchObject({ basis: 'not-checked' });
  });
});
