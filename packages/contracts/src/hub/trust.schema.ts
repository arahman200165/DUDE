import Type, { type Static } from 'typebox';

/**
 * How a device verifies the Hub's TLS certificate (32-SS1, Milestone 838, PD-143). Portable: no Node APIs.
 *
 * - `pinned` (the default and the only mode before Milestone 838): the Hub's leaf SPKI is pinned at pairing; chain verification is off.
 * - `public-ca`: the Hub is reached through a public name whose certificate the DUDE operator does not control (the Cloudflare Tunnel
 *   edge). The device verifies the ordinary public CA chain AND the host name against ONE stored domain; there is no pin.
 *
 * The mode is a property of the device's enrollment, chosen by the owner when the device is paired. A Hub can only ADVERTISE a mode
 * (`HelloResponse.trustMode`, `PairingCodeResponse.trustMode`); an advertisement never changes an enrolled device.
 */
export const HUB_TRUST_MODES = ['pinned', 'public-ca'] as const;
export type HubTrustMode = (typeof HUB_TRUST_MODES)[number];
export const HubTrustModeSchema = Type.Unsafe<HubTrustMode>({ type: 'string', enum: [...HUB_TRUST_MODES] });

/** The trust mode of a Hub or device that predates Milestone 838 (and of any message that omits the field). */
export const DEFAULT_HUB_TRUST_MODE: HubTrustMode = 'pinned';

/** A DNS name with at least two labels, lower case, no port, no trailing dot, no IP literal (checked by `isPublicCaDomain`). */
export const PUBLIC_CA_DOMAIN_PATTERN = '^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]([a-z0-9-]{0,61}[a-z0-9])?$';
const PUBLIC_CA_DOMAIN = new RegExp(PUBLIC_CA_DOMAIN_PATTERN);

/**
 * True for a public DNS name that may carry the `public-ca` mode. The last label must start with a letter, which rejects every IPv4
 * literal (all numeric labels) and any bracketed or colon-bearing IPv6 literal; single-label names (`localhost`, a machine name) and
 * the reserved private suffixes are refused because no public CA issues for them.
 */
export function isPublicCaDomain(value: string): boolean {
  if (typeof value !== 'string' || !PUBLIC_CA_DOMAIN.test(value)) return false;
  const last = value.slice(value.lastIndexOf('.') + 1);
  return !['local', 'localhost', 'localdomain', 'internal', 'lan', 'home', 'corp', 'invalid', 'test', 'example'].includes(last);
}

export const PublicCaDomain = Type.String({ pattern: PUBLIC_CA_DOMAIN_PATTERN });

/** What a device stores about how it verifies its Hub. `domain` is set exactly when `mode` is `public-ca`. */
export interface HubTrust { mode: HubTrustMode; domain: string | null }

/** The explicit confirmation a device owner gives to move an enrolled device between trust modes or public domains. */
export const HubTrustChange = Type.Object({ mode: HubTrustModeSchema, domain: Type.Union([PublicCaDomain, Type.Null()]) }, { additionalProperties: false });
export type HubTrustChange = Static<typeof HubTrustChange>;

export const sameTrust = (a: HubTrust, b: HubTrust): boolean => a.mode === b.mode && (a.domain ?? null) === (b.domain ?? null);
