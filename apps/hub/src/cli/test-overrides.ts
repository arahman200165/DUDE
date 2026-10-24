import type { RateLimiterOptions } from '../security/rate-limit.js';
import type { SyncCompactionOptions } from '../server/sync-compaction.js';

/**
 * TEST-ONLY knobs read by `dude-hub run` from the environment, so the two-Agent integration suite and the Hub e2e can finish
 * in minutes. Every one is off unless explicitly set; nothing here is a CLI flag, a config-file field or documented for
 * users, and a production Hub never sets them.
 *
 * - DUDE_HUB_TEST_RELAX_RATE_LIMITS=1: effectively unlimited request buckets (loopback test traffic only).
 * - DUDE_HUB_TEST_SYNC_RETENTION_DAYS=<n>: sync retention in days (may be fractional); compaction applies it at startup.
 * - DUDE_HUB_TEST_SYNC_COMPACTION_MS=<n>: compaction timer period in ms (0 disables the timer).
 * - DUDE_HUB_TEST_BACKUP_CHECK_MS=<n>: the scheduled-backup check period in ms (more than 0), so a configured schedule runs within seconds.
 * - DUDE_HUB_TEST_COLLAB_SNAPSHOT_IDLE_MS=<n> and DUDE_HUB_TEST_COLLAB_SNAPSHOT_MIN_INTERVAL_MS=<n>: the history snapshot idle delay and
 *   minimum spacing (PD-105) in ms, so version history fills within seconds.
 */
export const HUB_TEST_KNOB_NAMES = [
  'DUDE_HUB_TEST_RELAX_RATE_LIMITS', 'DUDE_HUB_TEST_SYNC_RETENTION_DAYS', 'DUDE_HUB_TEST_SYNC_COMPACTION_MS', 'DUDE_HUB_TEST_BACKUP_CHECK_MS',
  'DUDE_HUB_TEST_COLLAB_SNAPSHOT_IDLE_MS', 'DUDE_HUB_TEST_COLLAB_SNAPSHOT_MIN_INTERVAL_MS',
] as const;

/**
 * The knobs exist only in a test build (`npm run hub:compile:test`, PD-068). A release bundle bakes the flag to false and ignores
 * them entirely. Running from source (vitest) leaves the flag undefined and allows them.
 */
export function testKnobsEnabled(): boolean {
  return typeof __DUDE_HUB_TEST_BUILD__ === 'boolean' ? __DUDE_HUB_TEST_BUILD__ : true;
}

/** Names of any knob variables present in the environment, whether or not this build honours them. */
export function presentTestKnobs(env: NodeJS.ProcessEnv = process.env): string[] {
  return HUB_TEST_KNOB_NAMES.filter((name) => env[name] !== undefined && env[name] !== '');
}

export interface HubTestOverrides {
  rateLimit?: RateLimiterOptions;
  sync?: SyncCompactionOptions;
  collab?: { history: { idleMs?: number; minIntervalMs?: number } };
  /** Not a server option: `run` passes it to the backup scheduler (and the job registry period). */
  backupCheckMs?: number;
}

const positive = (raw: string | undefined): number | undefined => {
  if (raw === undefined || raw === '') return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
};

export function readHubTestOverrides(env: NodeJS.ProcessEnv = process.env, enabled: boolean = testKnobsEnabled()): HubTestOverrides {
  const result: HubTestOverrides = {};
  if (!enabled) return result;
  if (env['DUDE_HUB_TEST_RELAX_RATE_LIMITS'] === '1') {
    const open = { perMinute: 6_000_000, burst: 1_000_000 };
    result.rateLimit = { global: open, auth: open, read: open, flood: open };
  }
  const retentionDays = positive(env['DUDE_HUB_TEST_SYNC_RETENTION_DAYS']);
  const compactionIntervalMs = positive(env['DUDE_HUB_TEST_SYNC_COMPACTION_MS']);
  if (retentionDays !== undefined || compactionIntervalMs !== undefined) {
    result.sync = { ...(retentionDays !== undefined ? { retentionDays } : {}), ...(compactionIntervalMs !== undefined ? { compactionIntervalMs } : {}) };
  }
  // A zero period would spin the timer: the check period must be positive.
  const backupCheckMs = positive(env['DUDE_HUB_TEST_BACKUP_CHECK_MS']);
  if (backupCheckMs !== undefined && backupCheckMs > 0) result.backupCheckMs = backupCheckMs;
  const idleMs = positive(env['DUDE_HUB_TEST_COLLAB_SNAPSHOT_IDLE_MS']);
  const minIntervalMs = positive(env['DUDE_HUB_TEST_COLLAB_SNAPSHOT_MIN_INTERVAL_MS']);
  if (idleMs !== undefined || minIntervalMs !== undefined) {
    result.collab = { history: { ...(idleMs !== undefined ? { idleMs } : {}), ...(minIntervalMs !== undefined ? { minIntervalMs } : {}) } };
  }
  return result;
}
