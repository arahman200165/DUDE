/** Provisional sync limits; to be measured later. */
export const SYNC_LIMITS = {
  maxRecordBytes: 128 * 1024,
  maxPushOps: 100,
  maxPushBytes: 512 * 1024,
  changesPage: 500,
  snapshotPage: 500,
  retentionDaysDefault: 90,
} as const;
