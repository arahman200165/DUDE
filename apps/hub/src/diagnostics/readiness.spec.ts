import type { NetworkInterfaceInfo } from 'node:os';
import { describe, expect, it } from 'vitest';
import type { HubDiagnosticsReport } from '@dude/contracts/hub';
import { generateSelfSigned } from '../tls/self-signed.js';
import { collectDiagnostics } from './engine.js';
import type { DiagnosticsDeps } from './engine.js';
import { evaluatePublicReadiness, formatReadiness, isPublicDnsName, PUBLIC_EXPOSURE_PHRASE } from './readiness.js';

const NOW = Date.parse('2026-10-03T00:00:00.000Z');
const DAY = 86_400_000;
const cert = generateSelfSigned({ hubInstanceId: 'h', now: new Date(NOW - DAY), validityYears: 1 });
const info = (address: string) => ({ address, family: 'IPv4', internal: false, netmask: '', mac: '', cidr: null }) as NetworkInterfaceInfo;
const hosted = { serviceState: 'running', firewallPresent: true, publicFirewall: { present: true, problems: [] as string[] }, nativeListeners: { exposed: [] as never[], desktopLan: [] as never[], partial: false } };

/** A report as the Hub builds it for the gate: public mode, LAN bind, ACME certificate, everything verified. */
async function readyReport(over: Partial<DiagnosticsDeps> = {}, certOver: Partial<NonNullable<DiagnosticsDeps['certificate']>> = {}): Promise<HubDiagnosticsReport> {
  const report = await collectDiagnostics({
    now: NOW, hubVersion: '1.0.0', running: true, serviceMode: 'service', uptimeSeconds: 42, schemaVersion: 5, platform: 'win32',
    config: { port: 47821, bind: 'lan', bindAddress: '0.0.0.0', exposure: { mode: 'public', names: ['hub.example.com'] } },
    wantedNames: ['hub.example.com'],
    certificate: { pem: cert.certPem, source: 'acme', nextSpkiSha256: null, pendingAcks: 0, chainLength: 1, ca: null, hsts: true, ...certOver },
    proxyPins: { active: null, next: null }, ownerExists: true, realtime: { available: true, owner: 1, device: 0 },
    host: () => Promise.resolve(hosted),
    interfaces: () => ({ eth0: [info('203.0.113.7')] }),
    resolveDns: () => Promise.resolve([{ name: 'hub.example.com', addresses: ['203.0.113.7'] }]),
    reachability: { at: new Date(NOW - DAY).toISOString(), host: 'hub.example.com', ageMs: DAY },
    ...over,
  });
  // The fixture certificate is self-signed for the Hub's own name; the readiness input says it covers the configured names.
  return { ...report, certificate: report.certificate ? { ...report.certificate, missingNames: [] } : null };
}

const ids = (list: Array<{ id: string }>): string[] => list.map((b) => b.id);

describe('evaluatePublicReadiness', () => {
  it('is ready with an ACME certificate, a public name, firewall, owner, fresh reachability and no warnings', async () => {
    const result = evaluatePublicReadiness(await readyReport(), { hostFactsRequired: true });
    expect(result).toEqual({ ready: true, blockers: [], warnings: [] });
    expect(formatReadiness(result)).toContain('Ready');
  });

  it('accepts an imported certificate', async () => {
    expect(evaluatePublicReadiness(await readyReport({}, { source: 'imported' })).ready).toBe(true);
  });

  it.each(['self-signed', 'local-ca'] as const)('blocks a %s certificate: outside browsers cannot trust a private CA', async (source) => {
    const result = evaluatePublicReadiness(await readyReport({}, { source }));
    expect(ids(result.blockers)).toEqual(['certificate-trusted']);
    expect(result.blockers[0]?.reason).toMatch(/cannot trust/);
    expect(result.blockers[0]?.fix).toMatch(/tls acme issue/);
  });

  it('does not require a trusted Hub certificate in reverse-proxy mode, and counts the proxy origin as the name', async () => {
    const report = await readyReport({
      config: { port: 47821, bind: 'loopback', bindAddress: '127.0.0.1', exposure: { mode: 'public', names: [], proxy: { trusted: ['10.0.0.1'], publicOrigin: 'https://hub.example.com' } } },
      proxyPins: { active: 'x'.repeat(43), next: null },
    }, { source: 'self-signed' });
    expect(evaluatePublicReadiness(report).blockers).toEqual([]);
  });

  it('blocks when there is no certificate at all', async () => {
    const report = { ...(await readyReport()), certificate: null };
    expect(ids(evaluatePublicReadiness(report).blockers)).toContain('certificate-trusted');
  });

  it.each([
    ['IP-only names', ['203.0.113.7']],
    ['local suffixes', ['hub.local', 'nas.lan', 'hub.home.arpa', 'localhost', 'hub']],
    ['no names', [] as string[]],
  ])('blocks %s: no public DNS name', async (_label, names) => {
    const report = await readyReport({ config: { port: 1, bind: 'lan', bindAddress: '0.0.0.0', exposure: { mode: 'public', names } } });
    const result = evaluatePublicReadiness(report);
    expect(ids(result.blockers)).toContain('public-dns-name');
    expect(result.blockers.find((b) => b.id === 'public-dns-name')?.fix).toMatch(/tls names add/);
  });

  it('classifies names with the ACME rules', () => {
    expect(isPublicDnsName('hub.example.com')).toBe(true);
    expect(isPublicDnsName('203.0.113.7')).toBe(false);
    expect(isPublicDnsName('hub.internal')).toBe(false);
    expect(isPublicDnsName('*.example.com')).toBe(false);
  });

  it('blocks a certificate that does not cover the configured names', async () => {
    const report = await readyReport();
    const result = evaluatePublicReadiness({ ...report, certificate: { ...report.certificate!, missingNames: ['hub.example.com'] } });
    expect(ids(result.blockers)).toEqual(['certificate-covers-names']);
  });

  it('blocks an expired certificate and one expiring within 7 days, not one with 8 days left', async () => {
    const report = await readyReport();
    const at = (daysLeft: number) => evaluatePublicReadiness({ ...report, certificate: { ...report.certificate!, daysLeft } });
    expect(ids(at(-1).blockers)).toEqual(['certificate-expiry']);
    expect(ids(at(6).blockers)).toEqual(['certificate-expiry']);
    expect(at(8).blockers).toEqual([]);
  });

  it('blocks when no owner is set up', async () => {
    const result = evaluatePublicReadiness(await readyReport({ ownerExists: false }));
    expect(ids(result.blockers)).toEqual(['authentication-active']);
    expect(result.blockers[0]?.fix).toBe('dude-hub setup-token');
  });

  it('blocks a missing or invalid public firewall rule on a Windows service, and an unread one when host facts are required', async () => {
    const missing = await readyReport({ host: () => Promise.resolve({ ...hosted, publicFirewall: { present: false, problems: [] } }) });
    expect(evaluatePublicReadiness(missing).blockers[0]).toMatchObject({ id: 'public-firewall-rule', fix: expect.stringContaining('network firewall public on') });
    const invalid = await readyReport({ host: () => Promise.resolve({ ...hosted, publicFirewall: { present: true, problems: ['Profiles: private only.'] } }) });
    expect(ids(evaluatePublicReadiness(invalid).blockers)).toEqual(['public-firewall-rule']);
    const unread = await readyReport({ host: () => Promise.resolve({ serviceState: 'running', firewallPresent: true }) });
    expect(ids(evaluatePublicReadiness(unread, { hostFactsRequired: true }).blockers)).toEqual(['public-firewall-rule']);
    expect(evaluatePublicReadiness(unread).blockers).toEqual([]);
  });

  it('does not apply the firewall or listener checks off Windows', async () => {
    const report = await readyReport({ platform: 'linux', serviceMode: 'foreground', host: () => Promise.resolve({ firewallPresent: null }) });
    expect(evaluatePublicReadiness(report, { hostFactsRequired: false }).blockers).toEqual([]);
  });

  it('blocks an Agent TCP listener', async () => {
    const report = await readyReport({ host: () => Promise.resolve({ ...hosted, nativeListeners: { exposed: [{ image: 'dude-agent.exe', pid: 9, address: '0.0.0.0', port: 5000, scope: 'any' as const }], partial: false } }) });
    expect(ids(evaluatePublicReadiness(report).blockers)).toEqual(['native-ports-exposed']);
  });

  it('blocks a loopback bind without reverse-proxy mode', async () => {
    const report = await readyReport({ config: { port: 1, bind: 'loopback', bindAddress: '127.0.0.1', exposure: { mode: 'public', names: ['hub.example.com'] } } });
    const result = evaluatePublicReadiness(report);
    expect(ids(result.blockers)).toEqual(['inbound-bind']);
    expect(result.blockers[0]?.fix).toMatch(/network lan on/);
  });

  it('makes missing or stale reachability a blocker, and a warning only with the explicit acceptance', async () => {
    for (const reachability of [null, { at: new Date(NOW - 9 * DAY).toISOString(), host: 'hub.example.com', ageMs: 9 * DAY }]) {
      const report = await readyReport({ reachability });
      expect(ids(evaluatePublicReadiness(report).blockers)).toEqual(['external-reachability']);
      const accepted = evaluatePublicReadiness(report, { acceptUnverifiedReachability: true });
      expect(accepted.ready).toBe(true);
      expect(accepted.warnings).toEqual([expect.objectContaining({ id: 'external-reachability', reason: expect.stringContaining('Accepted by the operator') })]);
    }
  });

  it('warns (never blocks) for private-only addresses, DNS that does not point here, and HSTS off', async () => {
    const stability = await readyReport({ interfaces: () => ({ eth0: [info('192.168.1.5'), info('100.64.0.9')] }) });
    expect(evaluatePublicReadiness(stability)).toMatchObject({ ready: true, warnings: expect.arrayContaining([expect.objectContaining({ id: 'address-stability' })]) });
    const dns = await readyReport({ resolveDns: () => Promise.resolve([{ name: 'hub.example.com', addresses: [], error: 'not-found' as const }]) });
    expect(ids(evaluatePublicReadiness(dns).warnings)).toEqual(['dns-resolution']);
    const behindNat = await readyReport({ resolveDns: () => Promise.resolve([{ name: 'hub.example.com', addresses: ['198.51.100.1'] }]) });
    expect(ids(evaluatePublicReadiness(behindNat).warnings)).toEqual(['dns-resolution']);
    const hsts = await readyReport({}, { hsts: false });
    expect(evaluatePublicReadiness(hsts)).toMatchObject({ ready: true, warnings: [expect.objectContaining({ id: 'hsts' })] });
  });

  it('lists every blocker with its fix in the printed report', async () => {
    const report = await readyReport({ ownerExists: false, reachability: null }, { source: 'local-ca' });
    const text = formatReadiness(evaluatePublicReadiness(report));
    expect(text).toContain('[BLOCKER] certificate-trusted');
    expect(text).toContain('fix: dude-hub setup-token');
    expect(PUBLIC_EXPOSURE_PHRASE).toBe('EXPOSE HUB TO THE INTERNET');
  });
});
