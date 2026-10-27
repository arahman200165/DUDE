import type { NetworkInterfaceInfo } from 'node:os';
import { describe, expect, it } from 'vitest';
import { Value } from 'typebox/value';
import { HUB_TUNNEL_DISCLOSURE, HubDiagnosticsReport } from '@dude/contracts/hub';
import type { HubDiagnosticsTunnel } from '@dude/contracts/hub';
import { generateSelfSigned } from '../tls/self-signed.js';
import { collectDiagnostics } from './engine.js';
import type { DiagnosticsDeps } from './engine.js';
import { evaluatePublicReadiness, evaluateTunnelReadiness } from './readiness.js';

/** Tunnel-aware readiness (32-SS1, Milestone 837): each blocker passes and fails on its own; every other mode is unchanged. */
const NOW = Date.parse('2026-10-03T00:00:00.000Z');
const DAY = 86_400_000;
const cert = generateSelfSigned({ hubInstanceId: 'h', now: new Date(NOW - DAY), validityYears: 1 });
const info = (address: string) => ({ address, family: 'IPv4', internal: false, netmask: '', mac: '', cidr: null }) as NetworkInterfaceInfo;
const HOST = 'notes.example.com';

const liveConnector: NonNullable<HubDiagnosticsTunnel['connector']> = { state: 'running', ready: true, restarts: 0, lastError: null };
const tunnelFacts = (over: Partial<HubDiagnosticsTunnel> = {}): HubDiagnosticsTunnel => ({ enabled: true, hostname: HOST, tokenPresent: true, supported: true, connector: liveConnector, ...over });

/** A tunnel Hub as the gate sees it: loopback bind, the loopback connector as the only trusted hop, a self-signed loopback certificate, no firewall rule. */
async function tunnelReport(over: Partial<DiagnosticsDeps> = {}, exposure: Partial<DiagnosticsDeps['config']['exposure']> = {}): Promise<HubDiagnosticsReport> {
  return collectDiagnostics({
    now: NOW, hubVersion: '1.0.0', running: true, serviceMode: 'service', uptimeSeconds: 42, schemaVersion: 5, platform: 'win32',
    config: {
      port: 47821, bind: 'loopback', bindAddress: '127.0.0.1',
      exposure: { mode: 'public', names: [HOST], proxy: { trusted: ['127.0.0.1', '::1'], publicOrigin: `https://${HOST}` }, tunnel: { enabled: true, hostname: HOST }, ...exposure },
    },
    wantedNames: [HOST],
    // The loopback hop's certificate is the Hub's own self-signed one: it must not matter in tunnel mode.
    certificate: { pem: cert.certPem, source: 'self-signed', nextSpkiSha256: null, pendingAcks: 0, chainLength: 1, ca: null, hsts: false },
    proxyPins: { active: null, next: null }, ownerExists: true, realtime: { available: true, owner: 1, device: 0 },
    // No firewall rule and no inbound-capable address: the direct-Public blockers would all fire.
    host: () => Promise.resolve({ serviceState: 'running', firewallPresent: false, publicFirewall: { present: false, problems: [] }, nativeListeners: { exposed: [], desktopLan: [], partial: false } }),
    interfaces: () => ({ eth0: [info('192.168.1.20')] }),
    resolveDns: () => Promise.resolve([{ name: HOST, addresses: ['104.16.0.1'] }]),
    reachability: { at: new Date(NOW - DAY).toISOString(), host: HOST, ageMs: DAY },
    tunnel: tunnelFacts(),
    ...over,
  });
}

const ids = (list: Array<{ id: string }>): string[] => list.map((b) => b.id);

describe('tunnel readiness', () => {
  it('is ready with a connected connector, a loopback-only hop, an owner and fresh reachability, with no firewall rule, no certificate and no public address', async () => {
    const report = await tunnelReport();
    expect(Value.Check(HubDiagnosticsReport, report)).toBe(true);
    const result = evaluatePublicReadiness(report, { hostFactsRequired: true });
    expect(result.blockers).toEqual([]);
    expect(result.ready).toBe(true);
    // The edge-TLS disclosure is always a warning.
    expect(ids(result.warnings)).toEqual(['tunnel-edge-tls']);
    expect(result.warnings[0]?.reason).toBe(HUB_TUNNEL_DISCLOSURE[0]);
    expect(evaluateTunnelReadiness(report)).toEqual(result);
  });

  it('replaces public-firewall-rule, inbound-bind and every certificate blocker (they cannot fire in tunnel mode)', async () => {
    const report = await tunnelReport({
      certificate: null,
      host: () => Promise.resolve({ firewallPresent: false, publicFirewall: { present: false, problems: ['missing'] } }),
    });
    const result = evaluatePublicReadiness(report, { hostFactsRequired: true });
    expect(ids(result.blockers)).toEqual([]);
    for (const absent of ['public-firewall-rule', 'inbound-bind', 'certificate-trusted', 'certificate-covers-names', 'certificate-expiry', 'public-dns-name']) {
      expect(ids(result.blockers)).not.toContain(absent);
    }
  });

  describe('tunnel-connector-ready', () => {
    it.each([
      ['not started', { connector: null }, /not running/],
      ['stopped', { connector: { ...liveConnector, state: 'stopped', ready: false } }, /not running/],
      ['still connecting', { connector: { ...liveConnector, state: 'starting', ready: false } }, /still connecting/],
      ['restarting', { connector: { ...liveConnector, state: 'restarting', ready: false } }, /still connecting/],
      ['running but not answering ready', { connector: { ...liveConnector, ready: false } }, /not answering as connected/],
      ['failed', { connector: { ...liveConnector, state: 'failed', ready: false, lastError: 'crashed-repeatedly' } }, /crashed-repeatedly/],
    ] as const)('blocks when the connector is %s', async (_label, facts, reason) => {
      const result = evaluatePublicReadiness(await tunnelReport({ tunnel: tunnelFacts(facts as Partial<HubDiagnosticsTunnel>) }));
      expect(ids(result.blockers)).toEqual(['tunnel-connector-ready']);
      expect(result.blockers[0]?.reason).toMatch(reason);
      expect(result.blockers[0]?.fix).toBeTruthy();
    });

    it('blocks with the token fix when no connector token is stored', async () => {
      const result = evaluatePublicReadiness(await tunnelReport({ tunnel: tunnelFacts({ tokenPresent: false, connector: null }) }));
      expect(ids(result.blockers)).toEqual(['tunnel-connector-ready']);
      expect(result.blockers[0]?.reason).toMatch(/No tunnel connector token/);
      expect(result.blockers[0]?.fix).toMatch(/--token-stdin/);
    });

    it('blocks on a platform that cannot run the connector (the Docker image)', async () => {
      const result = evaluatePublicReadiness(await tunnelReport({ tunnel: tunnelFacts({ supported: false, connector: null }) }));
      expect(ids(result.blockers)).toEqual(['tunnel-connector-ready']);
      expect(result.blockers[0]?.reason).toMatch(/Windows Hub/);
    });
  });

  describe('tunnel-hostname-matches-config', () => {
    it('blocks when the proxy origin is another host than the tunnel hostname', async () => {
      const result = evaluatePublicReadiness(await tunnelReport({}, { proxy: { trusted: ['127.0.0.1'], publicOrigin: 'https://other.example.com' }, names: [HOST, 'other.example.com'] }));
      expect(ids(result.blockers)).toEqual(['tunnel-hostname-matches-config']);
    });

    it('blocks when the hostname is not a configured name', async () => {
      const result = evaluatePublicReadiness(await tunnelReport({}, { names: ['elsewhere.example.com'] }));
      expect(ids(result.blockers)).toEqual(['tunnel-hostname-matches-config']);
    });

    it('blocks when there is no proxy block at all', async () => {
      const result = evaluatePublicReadiness(await tunnelReport({}, { proxy: undefined as never }));
      expect(ids(result.blockers).sort()).toEqual(['tunnel-hostname-matches-config', 'tunnel-trusted-hop-loopback-only']);
    });
  });

  describe('tunnel-trusted-hop-loopback-only', () => {
    it.each([['a LAN address', ['192.168.1.5']], ['a loopback network', ['127.0.0.0/8']], ['loopback plus a LAN host', ['127.0.0.1', '10.0.0.2']]])('blocks when the trusted hop is %s', async (_label, trusted) => {
      const result = evaluatePublicReadiness(await tunnelReport({}, { proxy: { trusted, publicOrigin: `https://${HOST}` } }));
      expect(ids(result.blockers)).toEqual(['tunnel-trusted-hop-loopback-only']);
    });

    it('blocks a LAN bind even with a loopback hop', async () => {
      const result = evaluatePublicReadiness(await tunnelReport({ config: { port: 47821, bind: 'lan', bindAddress: '0.0.0.0', exposure: { mode: 'public', names: [HOST], proxy: { trusted: ['127.0.0.1'], publicOrigin: `https://${HOST}` }, tunnel: { enabled: true, hostname: HOST } } } }));
      expect(ids(result.blockers)).toEqual(['tunnel-trusted-hop-loopback-only']);
    });

    it('accepts either loopback address on its own', async () => {
      for (const trusted of [['127.0.0.1'], ['::1'], ['::1', '127.0.0.1']]) {
        expect(evaluatePublicReadiness(await tunnelReport({}, { proxy: { trusted, publicOrigin: `https://${HOST}` } })).blockers).toEqual([]);
      }
    });
  });

  describe('authentication-active', () => {
    it('blocks without an owner and when ownership cannot be confirmed', async () => {
      expect(ids(evaluatePublicReadiness(await tunnelReport({ ownerExists: false })).blockers)).toEqual(['authentication-active']);
      expect(ids(evaluatePublicReadiness(await tunnelReport({ ownerExists: null })).blockers)).toEqual(['authentication-active']);
    });
  });

  describe('external-reachability', () => {
    it('blocks without a fresh verification through the public name and downgrades to a warning on --accept-unverified-reachability', async () => {
      const report = await tunnelReport({ reachability: null });
      expect(ids(evaluatePublicReadiness(report).blockers)).toEqual(['external-reachability']);
      const accepted = evaluatePublicReadiness(report, { acceptUnverifiedReachability: true });
      expect(accepted.blockers).toEqual([]);
      expect(ids(accepted.warnings)).toEqual(['external-reachability', 'tunnel-edge-tls']);
      expect(accepted.warnings[0]?.reason).toMatch(/Accepted by the operator/);
    });

    it('blocks a verification older than seven days', async () => {
      const stale = await tunnelReport({ reachability: { at: new Date(NOW - 8 * DAY).toISOString(), host: HOST, ageMs: 8 * DAY } });
      expect(ids(evaluatePublicReadiness(stale).blockers)).toEqual(['external-reachability']);
    });
  });

  it('still blocks a Device Agent listener (an Agent port is never published, tunnel or not)', async () => {
    const exposed = [{ pid: 4, address: '0.0.0.0', port: 5000, scope: 'any' as const }];
    const report = await tunnelReport({ host: () => Promise.resolve({ firewallPresent: false, nativeListeners: { exposed: exposed as never, desktopLan: [], partial: false } }) });
    expect(ids(evaluatePublicReadiness(report).blockers)).toEqual(['native-ports-exposed']);
  });

  it('reports several problems at once, in a stable order', async () => {
    const report = await tunnelReport({ ownerExists: false, reachability: null, tunnel: tunnelFacts({ connector: null }) });
    expect(ids(evaluatePublicReadiness(report).blockers)).toEqual(['tunnel-connector-ready', 'authentication-active', 'external-reachability']);
  });
});

describe('the other modes are unchanged', () => {
  const direct = async (over: Partial<DiagnosticsDeps> = {}): Promise<HubDiagnosticsReport> => collectDiagnostics({
    now: NOW, hubVersion: '1.0.0', running: true, serviceMode: 'service', uptimeSeconds: 42, schemaVersion: 5, platform: 'win32',
    config: { port: 47821, bind: 'lan', bindAddress: '0.0.0.0', exposure: { mode: 'public', names: ['hub.example.com'] } },
    wantedNames: ['hub.example.com'],
    certificate: { pem: cert.certPem, source: 'self-signed', nextSpkiSha256: null, pendingAcks: 0, chainLength: 1, ca: null, hsts: false },
    proxyPins: { active: null, next: null }, ownerExists: true, realtime: { available: true, owner: 1, device: 0 },
    host: () => Promise.resolve({ serviceState: 'running', firewallPresent: true, publicFirewall: { present: false, problems: [] }, nativeListeners: { exposed: [], desktopLan: [], partial: false } }),
    interfaces: () => ({ eth0: [info('203.0.113.7')] }),
    resolveDns: () => Promise.resolve([{ name: 'hub.example.com', addresses: ['203.0.113.7'] }]),
    reachability: null,
    ...over,
  });

  it('a direct Public Hub (no tunnel facts) still gets the certificate, firewall and reachability blockers', async () => {
    const report = await direct();
    expect(report.tunnel).toBeUndefined();
    expect(ids(evaluatePublicReadiness(report).blockers)).toEqual(['certificate-trusted', 'certificate-covers-names', 'public-firewall-rule', 'external-reachability']);
  });

  it('a Hub with a null or disabled tunnel block is judged as a direct Hub', async () => {
    for (const tunnel of [null, tunnelFacts({ enabled: false, connector: null })]) {
      const report = await direct({ tunnel });
      expect(ids(evaluatePublicReadiness(report).blockers)).toEqual(['certificate-trusted', 'certificate-covers-names', 'public-firewall-rule', 'external-reachability']);
      expect(ids(evaluatePublicReadiness(report).warnings)).not.toContain('tunnel-edge-tls');
    }
  });

  it('a Hub behind its own reverse proxy keeps the firewall blocker and has no tunnel checks', async () => {
    const report = await direct({ config: { port: 47821, bind: 'loopback', bindAddress: '127.0.0.1', exposure: { mode: 'public', names: ['hub.example.com'], proxy: { trusted: ['10.0.0.1'], publicOrigin: 'https://hub.example.com' } } } });
    expect(report.checks.some((c) => c.id.startsWith('tunnel-'))).toBe(false);
    expect(ids(evaluatePublicReadiness(report).blockers)).toContain('public-firewall-rule');
  });
});

describe('the diagnostics report in tunnel mode', () => {
  it('adds exactly the three tunnel checks, marks the firewall check not applicable and describes the loopback-only trust', async () => {
    const report = await tunnelReport();
    const byId = Object.fromEntries(report.checks.map((c) => [c.id, c]));
    expect(['tunnel-connector-ready', 'tunnel-hostname-matches-config', 'tunnel-trusted-hop-loopback-only'].map((id) => byId[id]?.status)).toEqual(['pass', 'pass', 'pass']);
    expect(byId['public-firewall-rule']).toMatchObject({ status: 'info', detail: expect.stringMatching(/Not applicable: tunnel mode opens no inbound port/) });
    expect(byId['proxy-trust']).toMatchObject({ status: 'info', detail: expect.stringMatching(/not pinned/) });
    expect(byId['address-stability']?.status).not.toBe('warn');
    expect(report.tunnel).toEqual(tunnelFacts());
    expect(JSON.stringify(report)).not.toMatch(/token":|TUNNEL_TOKEN|eyJ/i);
  });
});
