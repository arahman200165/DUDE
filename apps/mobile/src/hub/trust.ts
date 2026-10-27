import { HUB_PROTOCOL_VERSION, HUB_SYNC_MIN_PROTOCOL, isPublicCaDomain, sameTrust, type HelloResponse, type HubTrust, type HubTrustChange } from '@dude/contracts/hub';
import type { HubClient } from '@dude/api-client';
import { MobileHubError, type MobileHubEnrollment, type MobileHubPorts, type MobileHubTarget, type MobileHubTrustFields } from './types';

/** Every credential-bearing refresh checks the pinned public hello first. */
export function checkHello(hello: HelloResponse, expected?: Pick<MobileHubEnrollment, 'hubInstanceId' | 'environmentId' | 'authorityEpoch'>): number {
  if (hello.protocolVersion < HUB_SYNC_MIN_PROTOCOL || hello.minClientProtocol > HUB_PROTOCOL_VERSION || hello.syncCategoryFiltering !== true) {
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

// --- Trust mode (32-SS1, Milestone 839, PD-143) -------------------------------------------------------------------------------------
// The mode comes from the STORED enrollment (or the pairing string the owner reviewed) only. Nothing a Hub says (hello, certificates, announced pins)
// selects, widens or switches it; the only code that may change a stored mode is a fresh enrollment and a re-pairing the owner confirmed exactly.

/** What the device stores about how it verifies its Hub; absent fields (any record from before Milestone 839) mean `pinned`. */
export function trustOf(target: MobileHubTrustFields): HubTrust {
  return target.trustMode === 'public-ca' ? { mode: 'public-ca', domain: target.trustDomain ?? null } : { mode: 'pinned', domain: null };
}
/** Native error text of a failed public-CA handshake (chain, expiry or host name); the pinned mode keeps `tls-pin-mismatch`. */
export const PUBLIC_CA_UNTRUSTED = 'tls-public-ca-untrusted';
export const publicCaUntrustedMessage = (domain: string): string => `The Hub certificate for ${domain} could not be verified through the public certificate authorities. Check this device's clock, then reconnect it.`;
const HTTPS_ORIGIN = /^https:\/\/([A-Za-z0-9.-]+)(?::(\d{1,5}))?\/?$/;
const refused = (message: string): MobileHubError => new MobileHubError('trust-origin-refused', message);
/**
 * The native trust selection for a target: the public domain to verify through the system CA chain, or null for the pinned mode. A `public-ca`
 * target whose stored origin is not `https:` on exactly the stored domain is refused here, before any native call (the native side checks it again).
 */
export function publicCaDomainOf(target: MobileHubTarget): string | null {
  if (target.trustMode === undefined || target.trustMode === 'pinned') return null;
  if (target.trustMode !== 'public-ca') throw refused('This device has an unknown Hub trust mode. Nothing was sent.');
  const domain = target.trustDomain;
  const origin = HTTPS_ORIGIN.exec(target.hubUrl);
  if (typeof domain !== 'string' || !isPublicCaDomain(domain)) throw refused('The stored public domain for this Hub is not valid. Nothing was sent.');
  if (!origin) throw refused('The Hub address for a public-certificate connection must use https. Nothing was sent.');
  if (origin[1]!.toLowerCase() !== domain) throw refused(`This device trusts the public certificate for ${domain} only, and the Hub address is ${origin[1]!.toLowerCase()}. Nothing was sent.`);
  return domain;
}
/** What a hello advertises. Absent (older Hubs, or the tunnel off) means `pinned`. */
export function advertisedTrust(hello: Pick<HelloResponse, 'trustMode' | 'trustDomain'>): HubTrust {
  return hello.trustMode === 'public-ca' && typeof hello.trustDomain === 'string' && isPublicCaDomain(hello.trustDomain)
    ? { mode: 'public-ca', domain: hello.trustDomain }
    : { mode: 'pinned', domain: null };
}
/** Moving between pinned and public-CA trust (or to another public domain) needs the owner's exact, explicit confirmation; refuses before any traffic. */
export function assertTrustChangeConfirmed(current: HubTrust, next: HubTrust, confirmed: HubTrustChange | undefined): void {
  if (sameTrust(current, next)) return;
  if (confirmed === undefined || !sameTrust({ mode: confirmed.mode, domain: confirmed.domain }, next)) {
    throw new MobileHubError('trust-change-unconfirmed', next.mode === 'public-ca'
      ? `This pairing string would make this device trust the public certificate authority system for ${next.domain ?? 'a domain'} instead of a pinned Hub certificate. Confirm that change to continue; nothing was sent.`
      : 'This pairing string would make this device pin the Hub certificate instead of trusting a public certificate authority. Confirm that change to continue; nothing was sent.');
  }
}
/**
 * The pin set a connection refresh persists. A pinned device derives and verifies the announced certificates exactly as before; a public-CA device has no
 * pins: the Hub's loopback pin from its hello is kept as information only, and no certificate is fetched, stored, staged or acknowledged.
 */
export async function verifyTrustPins(api: HubClient, hello: HelloResponse, derive: MobileHubPorts['certificatePin'], target: MobileHubTarget): Promise<VerifiedPins> {
  if (publicCaDomainOf(target) === null) return verifyHelloPins(api, hello, derive);
  return { spkiActive: hello.tls.spkiSha256, spkiNext: null, proxySpkis: [], pins: [] };
}
/** The same owner-facing labels as the desktop Environment settings. */
export const TRUST_LABEL_PINNED = 'Pinned certificate';
export const TRUST_LABEL_PUBLIC_CA = 'Public certificate authority (via Cloudflare — Cloudflare can read traffic)';
export const trustLabelOf = (mode: 'pinned' | 'public-ca' | undefined): string => (mode === 'public-ca' ? TRUST_LABEL_PUBLIC_CA : TRUST_LABEL_PINNED);
