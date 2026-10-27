import type { Migration } from './index.js';

/**
 * How this device verifies its Hub (32-SS1, Milestone 838, PD-143). `hub_enrollment.trust_mode` is `pinned` (the leaf SPKI pin, every enrollment made
 * before this migration) or `public-ca` (the public CA chain and host name for `trust_domain`, the managed Cloudflare Tunnel). The mode is decided only when
 * the enrollment row is written (pairing or reconnect with the owner's confirmation); no later write changes it. Additive, so minReaderVersion stays 1: an
 * older build ignores the columns and keeps pinning, which for a public-CA enrollment fails closed (it has no usable pin).
 */
export const migration0006: Migration = {
  version: 6,
  name: 'hub-trust-mode',
  minReaderVersion: 1,
  sql: `
ALTER TABLE hub_enrollment ADD COLUMN trust_mode TEXT NOT NULL DEFAULT 'pinned' CHECK (trust_mode IN ('pinned', 'public-ca'));
ALTER TABLE hub_enrollment ADD COLUMN trust_domain TEXT CHECK (trust_domain IS NULL OR length(trust_domain) BETWEEN 4 AND 253);
`,
};
