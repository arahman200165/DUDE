import Type, { type Static } from 'typebox';

/**
 * Owner read model of the Hub's backup state (Phase 31G). It never carries a passphrase, a schedule key or any path beyond
 * the configured schedule folder and the default backups folder; `lastBackup.file` is a file NAME only.
 */
export const BACKUP_AUTHORITY_STATES = ['active', 'transferred'] as const;
export type BackupAuthorityState = (typeof BACKUP_AUTHORITY_STATES)[number];

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
    retention: Type.Optional(Type.Integer({ minimum: 1 })),
    keyPresent: Type.Optional(Type.Boolean()),
  }),
  /** The Hub's default backups folder (`<root>/backups`). */
  defaultFolder: Type.String(),
  /** Active desktop devices a restore marked for re-pairing. */
  devicesNeedingRePair: Type.Integer({ minimum: 0 }),
});
export type BackupStatusResponse = Static<typeof BackupStatusResponse>;
