import type { FastifyInstance } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { Db } from '@dude/sqlite-store';
import { BackupStatusResponse, ErrorEnvelope, HUB_API_PREFIX } from '@dude/contracts/hub';
import type { HubBackupScheduleConfig } from '../../config/hub-config.js';
import { getAuthorityEpoch, getAuthorityState } from '../../hub/authority.js';
import { readBackupLast } from '../../hub/backup-last.js';
import type { createRequireOwner } from '../../auth/owner-auth.js';

export interface BackupRouteOptions {
  db: Db;
  requireOwner: ReturnType<typeof createRequireOwner>;
  /** The configured backup schedule (`hub.json`), if any. */
  schedule: () => HubBackupScheduleConfig | undefined;
  /** The default backups folder shown to the owner (`<root>/backups`). */
  defaultFolder: string;
  /** Whether the DPAPI-protected schedule key exists. Injected by `run`: request handlers never import the schedule-key module. */
  scheduleKeyPresent?: () => boolean;
}

/**
 * `GET /backup/status`: owner cookie or bearer. A read model for the Hub UI (no mutation, so no CSRF and no audit event): authority
 * epoch and state, the last backup outcome, the schedule, the default folder and how many devices await re-pairing. Backup creation,
 * the schedule and restore stay admin-pipe and offline commands. It never returns a passphrase, the schedule key, a file path
 * (`lastBackup.file` is a name) or any folder other than the schedule folder and the default backups folder.
 */
export function registerBackupRoutes(app: FastifyInstance, options: BackupRouteOptions): void {
  app.withTypeProvider<TypeBoxTypeProvider>().get(
    `${HUB_API_PREFIX}/backup/status`,
    { preHandler: options.requireOwner, schema: { response: { 200: BackupStatusResponse, 401: ErrorEnvelope, 403: ErrorEnvelope } } },
    async (_request, reply) => {
      void reply.header('Cache-Control', 'no-store');
      const schedule = options.schedule();
      const needing = options.db
        .prepare("SELECT COUNT(*) AS n FROM devices WHERE kind = 'desktop' AND needs_re_pair = 1 AND revoked_at IS NULL AND unenrolled_at IS NULL")
        .get() as { n: number | bigint };
      const keyPresent = options.scheduleKeyPresent?.();
      return reply.code(200).send({
        authority: { epoch: getAuthorityEpoch(options.db), state: getAuthorityState(options.db) },
        lastBackup: readBackupLast(options.db),
        schedule: schedule === undefined
          ? { configured: false, ...(keyPresent === undefined ? {} : { keyPresent }) }
          : { configured: true, folder: schedule.folder, intervalHours: schedule.intervalHours, retention: schedule.retention, ...(keyPresent === undefined ? {} : { keyPresent }) },
        defaultFolder: options.defaultFolder,
        devicesNeedingRePair: Number(needing.n),
      });
    },
  );
}
