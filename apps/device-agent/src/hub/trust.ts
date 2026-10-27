import { isPublicCaDomain, sameTrust } from '@dude/contracts/hub';
import type { HelloResponse, HubTrust, HubTrustChange } from '@dude/contracts/hub';
import type { AgentHubStatus } from '@dude/contracts';
import { trustOf } from '../store/repos/hub-enrollment.repo.js';
import type { HubEnrollmentRow } from '../store/repos/hub-enrollment.repo.js';
import { HubManagerError } from './errors.js';
import type { PinnedTarget } from './pinned-transport.js';

/**
 * Trust selection for the Hub connection (32-SS1, Milestone 838, PD-143). One place decides how every Hub socket (HTTPS calls, the realtime and
 * collaboration sockets, diagnostics) verifies the peer, from the ENROLLMENT ROW only:
 *
 *  - `pinned` (default): the SPKI pins and staged certificates stored at pairing, chain verification off (unchanged since 31C).
 *  - `public-ca`: ordinary public CA chain and host name validation for the single stored domain, no pins, and the stored origin must be `https:` on exactly
 *    that host. Nothing a Hub says (hello, pairing payload, announced pins, certificates) selects, widens or switches the mode.
 *
 * The only code that may change a stored mode is `saveEnrollment`, reached from enrollment (a fresh pairing) and from `reconnectDevice` after the owner's explicit
 * `trustChange` confirmation (`assertTrustChangeConfirmed`).
 */

/** The target for an enrollment, or `HubManagerError('trust-origin-refused')` when a `public-ca` enrollment's stored origin is not allowed. */
export function resolveTrustTarget(enrollment: HubEnrollmentRow, onPeerSpki?: (spki: string) => void): PinnedTarget & { url: URL } {
  const url = new URL(enrollment.hubUrl);
  if (enrollment.trustMode === 'public-ca') {
    const domain = enrollment.trustDomain;
    const host = url.hostname.toLowerCase();
    if (url.protocol !== 'https:') throw refused('The Hub address for a public-certificate connection must use https.');
    if (url.username !== '' || url.password !== '') throw refused('The Hub address must not carry credentials.');
    if (domain === null || !isPublicCaDomain(domain) || host !== domain) {
      throw refused(`This device trusts the public certificate for ${domain ?? 'one domain'} only, and the Hub address is ${host}. Nothing was sent.`);
    }
    // No pins, no `ca`, no test roots: the root store is Node's default and the domain is the stored one.
    return { url, host, port: Number(url.port || 443), pins: [], trust: 'public-ca', trustedDomain: domain };
  }
  return {
    url, host: url.hostname, port: Number(url.port || 443),
    ca: enrollment.certNextPem ? [enrollment.certActivePem, enrollment.certNextPem] : [enrollment.certActivePem],
    pins: [enrollment.spkiActive, ...(enrollment.spkiNext ? [enrollment.spkiNext] : []), ...enrollment.proxySpkis],
    ...(onPeerSpki ? { onPeerSpki } : {}),
  };
}

const refused = (message: string): HubManagerError => new HubManagerError('trust-origin-refused', message);

/** What a Hub's hello advertises. Absent fields mean `pinned` (older Hubs and any Hub with the tunnel off). */
export function advertisedTrust(hello: Pick<HelloResponse, 'trustMode' | 'trustDomain'>): HubTrust {
  return hello.trustMode === 'public-ca' && typeof hello.trustDomain === 'string' && isPublicCaDomain(hello.trustDomain)
    ? { mode: 'public-ca', domain: hello.trustDomain }
    : { mode: 'pinned', domain: null };
}

/**
 * Information for the owner, never an action: the advertisement of a hello that this device's trust does not already cover. A pinned device whose Hub now
 * offers `public-ca` for a domain, or a public-CA device whose Hub names another domain or none, gets a `trustOffer` it can show; the stored mode is untouched.
 * A pinned device on the Hub's own pinned address sees an advertisement for the tunnel domain on every hello, so the offer is dropped when the device is
 * pinned and the Hub advertises only the pinned mode.
 */
export function trustOfferFor(current: HubTrust, hello: Pick<HelloResponse, 'trustMode' | 'trustDomain'>): AgentHubStatus['trustOffer'] {
  const advertised = advertisedTrust(hello);
  if (sameTrust(current, advertised)) return null;
  if (current.mode === 'pinned' && advertised.mode === 'pinned') return null;
  return advertised;
}

/**
 * The downgrade/upgrade guard for `reconnectDevice`: when the pairing string's trust differs from the enrollment's (mode, or the public domain), the
 * owner must have confirmed EXACTLY that target. No confirmation, or a confirmation for something else, refuses before any network traffic.
 */
export function assertTrustChangeConfirmed(current: HubTrust, next: HubTrust, confirmed: HubTrustChange | undefined): void {
  if (sameTrust(current, next)) return;
  if (confirmed === undefined || !sameTrust({ mode: confirmed.mode, domain: confirmed.domain }, next)) {
    throw new HubManagerError(
      'trust-change-unconfirmed',
      next.mode === 'public-ca'
        ? `This pairing string would make this device trust the public certificate authority system for ${next.domain ?? 'a domain'} instead of a pinned Hub certificate. Confirm that change to continue; nothing was sent.`
        : 'This pairing string would make this device pin the Hub certificate instead of trusting a public certificate authority. Confirm that change to continue; nothing was sent.',
    );
  }
}

export { trustOf };
