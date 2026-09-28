import { registerLiveKind } from './network-live';
import { inspectDnssec } from './network-dnssec';
import { COMMON_DKIM_SELECTORS, inspectEmailAuth } from './network-email-auth';
import { inspectTls } from './network-tls-inspect';
import { probeHttp3 } from './network-http3';

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
