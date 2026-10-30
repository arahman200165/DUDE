import Type, { type Static } from 'typebox';

/**
 * Owner read model of the Hub's backup state (Phase 31G, extended for backup v2 at 32-SS1 Milestone 847). It never carries a
 * passphrase, a key, a credential or any path beyond the configured schedule folder and the default backups folder;
 * `lastBackup.file` and `destinations[].lastBackupId` are names only. Read-only: no route creates, schedules, prunes or restores a
 * backup (the Hub web stays view-only; those are elevated admin-pipe and offline commands).
 */
export const BACKUP_AUTHORITY_STATES = ['active', 'transferred'] as const;
export type BackupAuthorityState = (typeof BACKUP_AUTHORITY_STATES)[number];

/** The backup v2 retention policy (PD-150): grandfather-father-son per destination, pruned only by the two-step `backup prune`. */
export const BACKUP_V2_RETENTION_DEFAULT = Object.freeze({ daily: 7, weekly: 4, monthly: 6 });

/**
 * The one HTTP route of the Google Drive backup destination (32-SS1, Milestone 856, PD-154): the browser redirect back from Google's
 * consent screen. Credential type: none and session-less (`security/cross-site-get.ts` removes every credential header before the
 * handler runs, and the exemption exists only while a connect the admin pipe started is waiting); the single-use `state` is the
 * authority. It holds the authorization in memory for the elevated admin pipe to complete and answers a plain page, never JSON and never
 * a token. Nothing here connects, disconnects or changes a destination: those are admin-pipe methods with a two-step confirmation.
 */
export const HUB_BACKUP_DRIVE_PATHS = {
  callback: '/api/v1/backup/drive/callback',
} as const;

/** The Drive consent is exactly this scope: the app can see only files and folders it created (never the rest of the owner's Drive). */
export const BACKUP_DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

/** Connecting a Drive destination (an admin-pipe action, two-step): stores a refresh token (`secret-management`) and widens where encrypted backups go (`remote-write`). */
export const BACKUP_DRIVE_CONNECT_ACTION = 'backup.destination.drive.connect';
export const BACKUP_DRIVE_CONNECT_CONSEQUENCE_CLASS = ['secret-management', 'remote-write'] as const;

/**
 * The one HTTP route of the OneDrive backup destination (32-SS1, Milestone 857, PD-150): the browser redirect back from Microsoft's
 * consent screen. Same contract as the Drive callback: credential type none and session-less, exempt from the cross-site refusal only
 * while a connect the admin pipe started is waiting, holds the authorization in memory only and answers a plain page.
 */
export const HUB_BACKUP_ONEDRIVE_PATHS = {
  callback: '/api/v1/backup/onedrive/callback',
} as const;

/** The OneDrive consent is exactly these scopes: the app folder only (the special folder `/me/drive/special/approot`) and a refresh token; never the rest of the owner's OneDrive. */
export const BACKUP_ONEDRIVE_SCOPES = ['Files.ReadWrite.AppFolder', 'offline_access'] as const;

/** Connecting a OneDrive destination (an admin-pipe action, two-step): stores a refresh token (`secret-management`) and widens where encrypted backups go (`remote-write`). */
export const BACKUP_ONEDRIVE_CONNECT_ACTION = 'backup.destination.onedrive.connect';
export const BACKUP_ONEDRIVE_CONNECT_CONSEQUENCE_CLASS = ['secret-management', 'remote-write'] as const;

const NullableString = Type.Union([Type.String(), Type.Null()]);

export const BackupDestinationStatus = Type.Object({
  id: Type.String(),
  kind: Type.String(),
  label: Type.String(),
  lastSuccessAt: NullableString,
  lastBackupId: NullableString,
  /** A short failure code of the last failed run, never a message. */
  lastError: NullableString,
  lastErrorAt: NullableString,
  lastVerifiedAt: NullableString,
  /** Bytes the destination holds after the last successful run. */
  repoBytes: Type.Union([Type.Integer({ minimum: 0 }), Type.Null()]),
  /** When the schedule next runs for this destination (null without a schedule). */
  nextDueAt: NullableString,
  /** Backup health (Milestone 850, PD-150): true once no backup succeeded for twice the interval (counted from the schedule or the destination being added when none ever did). Absent on a Hub from before. */
  overdue: Type.Optional(Type.Boolean()),
  /** The restore drill (Milestone 850): when the last drill that reached a verdict finished and what it found; a failure carries a short code, never a message. */
  lastDrillAt: Type.Optional(NullableString),
  lastDrillOutcome: Type.Optional(Type.Union([Type.Literal('success'), Type.Literal('failure'), Type.Null()])),
  lastDrillBackupId: Type.Optional(NullableString),
  lastDrillError: Type.Optional(NullableString),
  /** When the next monthly drill is due (null until the destination has a verified backup). */
  nextDrillDueAt: Type.Optional(NullableString),
});
export type BackupDestinationStatus = Static<typeof BackupDestinationStatus>;

export const BackupStatusResponse = Type.Object({
  authority: Type.Object({
    epoch: Type.Integer({ minimum: 1 }),
    state: Type.Union([Type.Literal('active'), Type.Literal('transferred')]),
  }),
  /** The outcome of the most recent backup run (manual or scheduled), or null when none was recorded. */
  lastBackup: Type.Union([
    Type.Object({
      at: Type.String(),
      ok: Type.Boolean(),
      file: Type.Optional(Type.String()),
      size: Type.Optional(Type.Integer({ minimum: 0 })),
      error: Type.Optional(Type.String()),
    }),
    Type.Null(),
  ]),
  schedule: Type.Object({
    configured: Type.Boolean(),
    folder: Type.Optional(Type.String()),
    intervalHours: Type.Optional(Type.Integer({ minimum: 1 })),
    /** 31G only: the old count retention of a schedule that was not set again since the upgrade. */
    retention: Type.Optional(Type.Integer({ minimum: 1 })),
    /** Whether the unattended key (the backup v2 master key in the secret store) is present; never the key. */
    keyPresent: Type.Optional(Type.Boolean()),
  }),
  /** The Hub's default backups folder (`<root>/backups`). */
  defaultFolder: Type.String(),
  /** Active desktop devices a restore marked for re-pairing. */
  devicesNeedingRePair: Type.Integer({ minimum: 0 }),
  /** Backup v2 destinations (Milestone 847); absent on a Hub that reports none. */
  destinations: Type.Optional(Type.Array(BackupDestinationStatus, { maxItems: 16 })),
  /** The retention policy every destination is pruned to. */
  retention: Type.Optional(Type.Object({ daily: Type.Integer({ minimum: 0 }), weekly: Type.Integer({ minimum: 0 }), monthly: Type.Integer({ minimum: 0 }) })),
  /** The earliest time the schedule next runs for any destination, or null without a schedule or destination. */
  nextScheduledAt: Type.Optional(NullableString),
  /** Backup health across the Hub (Milestone 850): any destination overdue, failed or failing its drill, and since when a schedule has had no destination to run into. */
  health: Type.Optional(Type.Object({
    overdue: Type.Boolean(),
    lastRunFailed: Type.Boolean(),
    drillFailed: Type.Boolean(),
    noDestinationSince: NullableString,
  })),
});
export type BackupStatusResponse = Static<typeof BackupStatusResponse>;
