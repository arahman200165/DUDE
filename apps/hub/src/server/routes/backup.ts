import type { FastifyInstance } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { Db } from '@dude/sqlite-store';
import { BACKUP_V2_RETENTION_DEFAULT, BackupStatusResponse, ErrorEnvelope, HUB_API_PREFIX } from '@dude/contracts/hub';
import type { BackupDestinationStatus } from '@dude/contracts/hub';
import type { HubBackupConfig } from '../../config/hub-config.js';
import { getAuthorityEpoch, getAuthorityState } from '../../hub/authority.js';
import { nextDueAt, readDestinationState } from '../../hub/backup-destination-state.js';
import { readBackupLast } from '../../hub/backup-last.js';
import type { createRequireOwner } from '../../auth/owner-auth.js';

export interface BackupRouteOptions {
  db: Db;
  requireOwner: ReturnType<typeof createRequireOwner>;
  /** The backup block of `hub.json` (schedule and destinations), read per request. */
  backupConfig: () => HubBackupConfig | undefined;
  /** The default backups folder shown to the owner (`<root>/backups`). */
  defaultFolder: string;
  /** Whether the unattended key (the backup v2 master key) exists. Injected by `run`: request handlers never import the key modules. */
  scheduleKeyPresent?: () => boolean;
  now?: () => number;
}

/**
 * `GET /backup/status`: owner cookie or bearer. A read model for the Hub UI (no mutation, so no CSRF and no audit event): authority
 * epoch and state, the last backup outcome, the schedule, the default folder, how many devices await re-pairing and (backup v2,
 * Milestone 847) each destination's kind, label, last success, last error code, last verification, repository size and next due
 * time, the retention policy and the next scheduled run. Backup creation, scheduling, pruning and restore stay admin-pipe and
 * offline commands. It never returns a passphrase, a key, a credential, a destination folder or any path other than the 31G
 * schedule folder and the default backups folder (`lastBackup.file` and `lastBackupId` are names).
 */
export function registerBackupRoutes(app: FastifyInstance, options: BackupRouteOptions): void {
  const now = options.now ?? Date.now;
  app.withTypeProvider<TypeBoxTypeProvider>().get(
    `${HUB_API_PREFIX}/backup/status`,
    { preHandler: options.requireOwner, schema: { response: { 200: BackupStatusResponse, 401: ErrorEnvelope, 403: ErrorEnvelope } } },
    async (_request, reply) => {
      void reply.header('Cache-Control', 'no-store');
      const backup = options.backupConfig();
      const schedule = backup?.schedule;
      const needing = options.db
        .prepare("SELECT COUNT(*) AS n FROM devices WHERE kind = 'desktop' AND needs_re_pair = 1 AND revoked_at IS NULL AND unenrolled_at IS NULL")
        .get() as { n: number | bigint };
      const keyPresent = options.scheduleKeyPresent?.();
      const at = now();
      const destinations: BackupDestinationStatus[] = (backup?.destinations ?? []).map((d) => {
        const state = readDestinationState(options.db, d.id);
        return {
          id: d.id, kind: d.kind, label: d.label,
          lastSuccessAt: state.lastSuccessAt ?? null, lastBackupId: state.lastBackupId ?? null,
          lastError: state.lastOutcome === 'failure' ? state.lastError ?? null : null, lastErrorAt: state.lastErrorAt ?? null,
          lastVerifiedAt: state.lastVerifiedAt ?? null, repoBytes: state.repoBytes ?? null,
          nextDueAt: schedule === undefined ? null : new Date(Math.max(at, nextDueAt(state, schedule.intervalHours, at))).toISOString(),
        };
      });
      const dueTimes = destinations.map((d) => d.nextDueAt).filter((t): t is string => t !== null).sort();
      return reply.code(200).send({
        authority: { epoch: getAuthorityEpoch(options.db), state: getAuthorityState(options.db) },
        lastBackup: readBackupLast(options.db),
        schedule: schedule === undefined
          ? { configured: false, ...(keyPresent === undefined ? {} : { keyPresent }) }
          : {
            configured: true, intervalHours: schedule.intervalHours,
            ...(schedule.folder !== undefined ? { folder: schedule.folder } : {}), ...(schedule.retention !== undefined ? { retention: schedule.retention } : {}),
            ...(keyPresent === undefined ? {} : { keyPresent }),
          },
        defaultFolder: options.defaultFolder,
        devicesNeedingRePair: Number(needing.n),
        destinations,
        retention: { ...BACKUP_V2_RETENTION_DEFAULT },
        nextScheduledAt: dueTimes[0] ?? null,
      });
    },
  );
}
