import { registerLiveKind } from './network-live';
import { inspectDnssec } from './network-dnssec';
import { COMMON_DKIM_SELECTORS, inspectEmailAuth } from './network-email-auth';
import { fetchLiveChain, inspectStartTls, inspectTls } from './network-tls-inspect';
import { probeHttp3 } from './network-http3';
import { enumerateTls, enumerationPlan } from './network-tls-enumerate';
import { captureTlsHandshake } from './network-capture';
import { inspectRevocation } from './network-revocation';
import { inspectCt } from './network-ct';
import { analyzeHttps } from './network-https-analyzer';

/**
 * Registers every Phase 28 live check with the dispatcher (`network-live.ts`). Imported for its
 * side effect by `network-runner.ts`, so the bridge and runner stay free of per-tool branches.
 */
registerLiveKind('dnssec-inspector', (request, signal, progress) => inspectDnssec(request, signal, progress));
registerLiveKind('email-auth', (request, signal, progress) => inspectEmailAuth(request, signal, progress), {
  preview: (request) => ({ kind: request.kind, domain: request.target, commonSelectorProbe: request.dkimCommonProbe ? COMMON_DKIM_SELECTORS.map((selector) => `${selector}._domainkey.${request.target}`) : [], queries: `up to ${COMMON_DKIM_SELECTORS.length} extra TXT lookups, one at a time` }),
});
registerLiveKind('tls-inspector', (request, signal, progress) => inspectTls(request, signal, progress), { timeoutMs: 45_000 });
registerLiveKind('http3-probe', (request, signal) => probeHttp3(request, signal), { timeoutMs: 20_000 });
registerLiveKind('tls-enumeration', (request, signal, progress) => enumerateTls(request, signal, progress), {
  timeoutMs: 120_000,
  preview: (request) => { const plan = enumerationPlan(request); return { kind: request.kind, target: `${request.target}:${request.port ?? 443}`, sni: request.noSni ? '(none)' : request.sni || request.target, versionProbes: plan.versions, cipherProbes: plan.ciphers, maxHandshakes: Math.min(128, plan.total), concurrency: 4, tag: 'network-scanning' }; },
});
registerLiveKind('tls-capture', (request, signal, progress) => captureTlsHandshake(request, signal, progress), {
  timeoutMs: 90_000,
  preview: (request) => ({ kind: request.kind, target: `${request.target}:${request.port ?? 443}`, tool: 'Windows pktmon (built-in)', scope: 'one filter for the target IP and port, this handshake only', requiresElevation: true, tag: 'process-management', note: 'pktmon start/stop and etl2pcap run as Administrator; the filter is removed and the trace stopped afterward.' }),
});
registerLiveKind('live-chain', (request, signal, progress) => fetchLiveChain(request, signal, progress), { timeoutMs: 30_000 });
registerLiveKind('revocation', (request, signal, progress) => inspectRevocation(request, signal, progress), {
  timeoutMs: 45_000,
  preview: (request) => ({ kind: request.kind, action: request.revocationAction ?? 'all', urls: request.urls ?? [], note: 'Contacts only the OCSP/CRL/AIA URLs named inside the certificate, over HTTP.' }),
});
registerLiveKind('ct-lookup', (request, signal, progress) => inspectCt(request, signal, progress), { timeoutMs: 30_000 });
registerLiveKind('starttls', (request, signal, progress) => inspectStartTls(request, signal, progress), { timeoutMs: 30_000 });
registerLiveKind('https-analyzer', (request, signal, progress) => analyzeHttps(request, signal, progress), {
  timeoutMs: 150_000,
  preview: (request) => ({ kind: request.kind, target: `${request.target}:${request.port ?? 443}`, includes: ['TLS version + cipher enumeration (up to 128 handshakes)', 'chain, hostname, expiry, OCSP stapling', 'HTTP→HTTPS redirect + HSTS', 'CAA + HTTPS/SVCB records'], tag: 'network-scanning' }),
});
