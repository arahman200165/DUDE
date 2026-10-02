import type { HistoryRetention, NetworkRunRetention } from '@dude/persistence';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Local History caps; the same numbers the renderer enforced before the store existed. */
export const DEFAULT_HISTORY_RETENTION: HistoryRetention = {
  maxPerTool: 200,
  maxTotal: 5000,
  maxAgeMs: 90 * DAY_MS,
  maxEntryBytes: 256 * 1024,
};

/** Network run history caps (100 runs, 30 days, 50 MB). */
export const DEFAULT_NETWORK_RUN_RETENTION: NetworkRunRetention = {
  maxRuns: 100,
  maxAgeMs: 30 * DAY_MS,
  maxTotalBytes: 50_000_000,
};

/** PowerShell history keeps the newest 100 entries. */
export const MAX_POWERSHELL_HISTORY = 100;
/** Journal cap used by main when trimming (fs-mutation uses 500). */
export const DEFAULT_JOURNAL_MAX = 500;
