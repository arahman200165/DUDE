import type { RateLimiterOptions } from '../security/rate-limit.js';
import type { SyncCompactionOptions } from '../server/sync-compaction.js';

/**
 * TEST-ONLY knobs read by `dude-hub run` from the environment, so the two-Agent integration suite can finish in
 * minutes. Every one is off unless explicitly set; nothing here is a CLI flag, a config-file field or documented for
 * users, and a production Hub never sets them.
 *
 * - DUDE_HUB_TEST_RELAX_RATE_LIMITS=1: effectively unlimited request buckets (loopback test traffic only).
 * - DUDE_HUB_TEST_SYNC_RETENTION_DAYS=<n>: sync retention in days (may be fractional); compaction applies it at startup.
 * - DUDE_HUB_TEST_SYNC_COMPACTION_MS=<n>: compaction timer period in ms (0 disables the timer).
 */
export interface HubTestOverrides { rateLimit?: RateLimiterOptions; sync?: SyncCompactionOptions }

const positive = (raw: string | undefined): number | undefined => {
  if (raw === undefined || raw === '') return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
};

export function readHubTestOverrides(env: NodeJS.ProcessEnv = process.env): HubTestOverrides {
  const result: HubTestOverrides = {};
  if (env['DUDE_HUB_TEST_RELAX_RATE_LIMITS'] === '1') {
    const open = { perMinute: 6_000_000, burst: 1_000_000 };
    result.rateLimit = { global: open, auth: open, read: open, flood: open };
  }
  const retentionDays = positive(env['DUDE_HUB_TEST_SYNC_RETENTION_DAYS']);
  const compactionIntervalMs = positive(env['DUDE_HUB_TEST_SYNC_COMPACTION_MS']);
  if (retentionDays !== undefined || compactionIntervalMs !== undefined) {
    result.sync = { ...(retentionDays !== undefined ? { retentionDays } : {}), ...(compactionIntervalMs !== undefined ? { compactionIntervalMs } : {}) };
  }
  return result;
}
