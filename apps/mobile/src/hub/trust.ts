import { HUB_PROTOCOL_VERSION, HUB_SYNC_MIN_PROTOCOL, type HelloResponse } from '@dude/contracts/hub';
import type { HubClient } from '@dude/api-client';
import { MobileHubError, type MobileHubEnrollment, type MobileHubPorts } from './types';

/** Every credential-bearing refresh checks the pinned public hello first. */
export function checkHello(hello: HelloResponse, expected?: Pick<MobileHubEnrollment, 'hubInstanceId' | 'environmentId' | 'authorityEpoch'>): number {
  if (hello.protocolVersion < HUB_SYNC_MIN_PROTOCOL || hello.minClientProtocol > HUB_PROTOCOL_VERSION || (hello as HelloResponse & { syncCategoryFiltering?: boolean }).syncCategoryFiltering !== true) {
    throw new MobileHubError('incompatible', 'This Hub needs Android category-filtered synchronization support. Update the Hub before pairing.');
  }
  if (!hello.bootstrapped || !hello.environmentId || hello.authorityState === 'transferred' || (expected && (hello.hubInstanceId !== expected.hubInstanceId || hello.environmentId !== expected.environmentId || (hello.authorityEpoch ?? 1) !== expected.authorityEpoch))) {
    throw new MobileHubError('authority-changed', 'The Hub authority changed. Review a new pairing string to reconnect while keeping local data.');
  }
  return Math.max(hello.authorityEpoch ?? 1, expected?.authorityEpoch ?? 1);
}
export interface VerifiedPins { readonly spkiActive: string; readonly spkiNext: string | null; readonly proxySpkis: readonly string[]; readonly pins: readonly string[] }
/** Certificate-derived pins, fetched over the current pinned channel; caller persists before realtime acknowledgements. */
export async function verifyHelloPins(api: HubClient, hello: HelloResponse, derive: MobileHubPorts['certificatePin']): Promise<VerifiedPins> {
  const certs = await api.tlsCertificates();
  if (certs.active.spkiSha256 !== hello.tls.spkiSha256 || await derive(certs.active.certPem) !== hello.tls.spkiSha256) throw new MobileHubError('pin-mismatch', 'The Hub active certificate does not match its announced pin.');
  const next = hello.tls.nextSpkiSha256;
  if (next !== null && (!certs.next || certs.next.spkiSha256 !== next || await derive(certs.next.certPem) !== next)) throw new MobileHubError('pin-mismatch', 'The Hub next certificate does not match its announced pin.');
  const proxies = [...new Set(hello.tls.proxySpkiSha256 ?? [])];
  if (proxies.some(pin => !(certs.proxySpkiSha256 ?? []).includes(pin))) throw new MobileHubError('pin-mismatch', 'The Hub proxy pin announcements disagree.');
  return { spkiActive: hello.tls.spkiSha256, spkiNext: next, proxySpkis: proxies, pins: [...new Set([hello.tls.spkiSha256, ...(next ? [next] : []), ...proxies])] };
}
