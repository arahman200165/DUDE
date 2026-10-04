import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { BackupError, MAX_BACKUP_PLAINTEXT_BYTES, backupFileName, deriveBackupKey, openBackup } from '@dude/hub-backup';
import type { BackupManifest } from '@dude/hub-backup';
import { BACKUP_LAST_META, backupFailureCode, readBackupLast, writeBackupLast } from '../backup/backup-state.js';
import { BACKUP_CONSEQUENCE_CLASS, createBackupFile } from '../backup/create-backup.js';
import { nodeBackupDeps, validateBackupPassphrase } from '../backup/kdf.js';
import { listBackups } from '../backup/retention.js';
import { clearScheduleKey, defaultScheduleKeyProtector, saveScheduleKey, scheduleKeyExists } from '../backup/schedule-key.js';
import { COUNTED_TABLES } from '../backup/snapshot.js';
import { applyBackupScheduleChange, loadOrCreateHubConfig, writeHubConfig, BACKUP_INTERVAL_HOURS_MAX, BACKUP_RETENTION_MAX } from '../config/hub-config.js';
import { getAuthorityEpoch } from '../hub/authority.js';
import { audit } from '../security/audit.js';
import { ConfirmationStore } from '../security/confirmation-store.js';
import { AdminError } from './admin-endpoint.js';
import type { AdminMethod } from './admin-endpoint.js';
import type { AdminMethodContext } from './methods.js';

/** The ConfirmationStore action of `backup create` (also `--for-transfer`, later). Only the admin pipe can issue or consume it. */
export const BACKUP_CREATE_ACTION = 'backup.create';
const ADMIN_BINDING = 'cli';
const PASSPHRASE_WARNING = 'Losing the passphrase makes the backup unrecoverable.';
const SAME_MACHINE_WARNING = 'A backup stored on the Hub\'s own machine does not protect against losing that machine. Keep a copy elsewhere.';
const MAX_BACKUP_FILE_BYTES = MAX_BACKUP_PLAINTEXT_BYTES + 4 * 1024 * 1024;

/** The facts about a backup that are safe to show: no keys, no credentials, no paths. */
export function summarizeManifest(manifest: BackupManifest): Record<string, unknown> {
  return {
    formatVersion: manifest.formatVersion,
    minReaderVersion: manifest.minReaderVersion,
    createdAt: manifest.createdAt,
    hubVersion: manifest.hubVersion,
    source: { ...manifest.source },
    forTransfer: manifest.forTransfer,
    counts: { ...manifest.counts },
    files: manifest.files.map((file) => ({ name: file.name, size: file.size })),
  };
}

const comparable = (value: string, platform: NodeJS.Platform): string => (platform === 'win32' ? path.resolve(value).toLowerCase() : path.resolve(value));

function isInside(child: string, parent: string, platform: NodeJS.Platform): boolean {
  const rel = path.relative(comparable(parent, platform), comparable(child, platform));
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel));
}

/** Backup admin methods (PD-074). Params carrying a passphrase are never logged, audited or echoed in an error. */
export function buildBackupMethods(context: AdminMethodContext, shared: { now: () => number; confirmations: ConfirmationStore }): Record<string, AdminMethod> {
  const { now, confirmations } = shared;
  const platform = context.platform ?? process.platform;
  const backupDeps = (): ReturnType<typeof nodeBackupDeps> => context.backupDeps ?? nodeBackupDeps(() => new Date(now()));
  const protector = context.scheduleKeyProtector ?? defaultScheduleKeyProtector();
  const paths = (): NonNullable<AdminMethodContext['paths']> => {
    if (!context.paths) throw new AdminError('unavailable', 'Backups are not available in this context.');
    return context.paths;
  };
  const config = () => loadOrCreateHubConfig(paths().configFile);
  const record = (params: unknown): Record<string, unknown> => (typeof params === 'object' && params !== null && !Array.isArray(params) ? (params as Record<string, unknown>) : {});

  /** An absolute folder that is not inside the live data, configuration or TLS directories. */
  const resolveTargetFolder = (raw: unknown): string => {
    const p = paths();
    const folder = raw === undefined ? p.backupsDir : raw;
    if (typeof folder !== 'string' || folder.length === 0 || !path.isAbsolute(folder)) throw new AdminError('bad-request', 'The backup folder must be an absolute path.');
    const resolved = path.resolve(folder);
    for (const forbidden of [p.dataDir, p.configDir, p.tlsDir]) {
      if (isInside(resolved, forbidden, platform)) throw new AdminError('bad-request', 'The backup folder cannot be inside the Hub\'s data, configuration or certificate directories.');
    }
    try {
      if (statSync(resolved).isFile()) throw new AdminError('bad-request', 'The backup folder is a file.');
    } catch (error) {
      if (error instanceof AdminError) throw error;
      /* does not exist yet: it is created at apply time */
    }
    return resolved;
  };
  const passphraseOf = (params: Record<string, unknown>): string => {
    const passphrase = params['passphrase'];
    if (typeof passphrase !== 'string') throw new AdminError('bad-request', 'passphrase is required.');
    const problem = validateBackupPassphrase(passphrase);
    if (problem !== null) throw new AdminError('bad-request', problem);
    return passphrase;
  };
  const digestOf = (folder: string): string =>
    createHash('sha256').update(JSON.stringify({ folder: comparable(folder, platform), hubInstanceId: context.hubInstanceId, epoch: getAuthorityEpoch(context.db) })).digest('hex');
  const counts = (): Record<string, number> => {
    const out: Record<string, number> = {};
    for (const table of COUNTED_TABLES) {
      try {
        out[table] = Number((context.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number | bigint }).n);
      } catch { /* a table this schema does not have */ }
    }
    return out;
  };
  const sameVolume = (folder: string): boolean => path.parse(comparable(folder, platform)).root === path.parse(comparable(paths().dataDir, platform)).root;
  const auditCli = (event: Parameters<typeof audit>[1]['event'], outcome: 'success' | 'failure', detail: Record<string, unknown>): void =>
    audit(context.db, { event, outcome, actorKind: 'cli', detail, now: now() });

  return {
    /** Step one of `backup create`: validates the folder and reports what would be written. Writes nothing. */
    'backup.create.preview': (params) => {
      const folder = resolveTargetFolder(record(params)['folder']);
      const at = now();
      const file = backupFileName(new Date(at));
      const onHubVolume = sameVolume(folder);
      const confirmToken = confirmations.issue({ action: BACKUP_CREATE_ACTION, digest: digestOf(folder), bindingId: ADMIN_BINDING, now: at });
      auditCli('backup.create-previewed', 'success', { file, onHubVolume });
      return {
        confirmToken,
        expiresAt: ConfirmationStore.expiresAt(at),
        consequenceClass: [...BACKUP_CONSEQUENCE_CLASS],
        summary: {
          folder,
          file,
          onHubVolume,
          sameMachineWarning: SAME_MACHINE_WARNING,
          hubInstanceId: context.hubInstanceId,
          authorityEpoch: getAuthorityEpoch(context.db),
          counts: counts(),
          passphraseWarning: PASSPHRASE_WARNING,
        },
      };
    },
    /** Step two: seals, verifies and writes the backup. The passphrase is used for this call only. */
    'backup.create.apply': async (params) => {
      const input = record(params);
      const confirmToken = input['confirmToken'];
      if (typeof confirmToken !== 'string' || confirmToken.length === 0) throw new AdminError('bad-request', 'confirmToken is required.');
      const folder = resolveTargetFolder(input['folder']);
      const passphrase = passphraseOf(input);
      const result = confirmations.consumeDetailed({ token: confirmToken, action: BACKUP_CREATE_ACTION, digest: digestOf(folder), bindingId: ADMIN_BINDING, now: now() });
      if (result === 'invalid') throw new AdminError('confirmation-required', 'The confirmation is missing, expired or already used.');
      if (result === 'digest-mismatch') throw new AdminError('conflict', 'The target folder or the Hub changed since the preview. Run the preview again.');
      const p = paths();
      try {
        const created = await createBackupFile({
          db: context.db, paths: p, hubVersion: context.hubVersion, hubInstanceId: context.hubInstanceId, authorityEpoch: getAuthorityEpoch(context.db),
          forTransfer: false, targetDir: folder, credential: { passphrase }, deps: backupDeps(), workDir: path.join(p.backupsDir, '.tmp'),
        });
        const name = path.basename(created.file);
        writeBackupLast(context.db, { at: new Date(now()).toISOString(), ok: true, file: name, size: created.size });
        auditCli('backup.created', 'success', { file: name, size: created.size, trigger: 'manual' });
        return { file: created.file, name, size: created.size, sha256: created.sha256, manifest: summarizeManifest(created.manifest) };
      } catch (error) {
        const reason = backupFailureCode(error);
        try { writeBackupLast(context.db, { at: new Date(now()).toISOString(), ok: false, error: reason }); } catch { /* best effort */ }
        try { auditCli('backup.failed', 'failure', { reason, trigger: 'manual' }); } catch { /* best effort */ }
        throw new AdminError('backup-failed', `The backup could not be created (${reason}). Nothing was kept.`, { reason });
      }
    },
    /** Backups this Hub could have written in a folder (default: the scheduled folder, else `<root>/backups`). */
    'backup.list': (params) => {
      const raw = record(params)['folder'];
      const folderRaw = raw === undefined ? config().backup?.schedule?.folder ?? paths().backupsDir : raw;
      if (typeof folderRaw !== 'string' || folderRaw.length === 0 || !path.isAbsolute(folderRaw)) throw new AdminError('bad-request', 'The backup folder must be an absolute path.');
      const folder = path.resolve(folderRaw);
      let backups;
      try { backups = listBackups(folder); } catch { throw new AdminError('unavailable', 'The backup folder could not be read.'); }
      return { folder, backups: backups.map((entry) => ({ name: entry.name, size: entry.size, modifiedAt: entry.mtime.toISOString() })) };
    },
    /** Decrypts a backup with the passphrase and reports its manifest. Writes nothing. */
    'backup.verify': async (params) => {
      const input = record(params);
      const file = input['file'];
      if (typeof file !== 'string' || file.length === 0 || !path.isAbsolute(file)) throw new AdminError('bad-request', 'file must be an absolute path to a backup file.');
      const passphrase = input['passphrase'];
      if (typeof passphrase !== 'string' || passphrase.length === 0) throw new AdminError('bad-request', 'passphrase is required.');
      let bytes: Uint8Array;
      try {
        const stat = statSync(file);
        if (!stat.isFile()) throw new AdminError('bad-request', 'file is not a regular file.');
        if (stat.size > MAX_BACKUP_FILE_BYTES) throw new AdminError('bad-request', 'The file is larger than any backup this Hub can open.');
        bytes = new Uint8Array(readFileSync(file));
      } catch (error) {
        if (error instanceof AdminError) throw error;
        throw new AdminError('not-found', 'The backup file could not be read.');
      }
      try {
        const opened = await openBackup(bytes, { passphrase }, backupDeps());
        return { ok: true, manifest: summarizeManifest(opened.manifest) };
      } catch (error) {
        if (error instanceof BackupError) throw new AdminError(error.code, error.message);
        throw new AdminError('verify-failed', 'The backup could not be opened.');
      }
    },
    /** Sets (or replaces) the schedule: validates, derives the key once, stores it protected, then records the schedule in `hub.json`. */
    'backup.schedule.set': async (params) => {
      const input = record(params);
      const p = paths();
      if (input['folder'] === undefined) throw new AdminError('bad-request', 'folder is required.');
      const folder = resolveTargetFolder(input['folder']);
      const intervalHours = input['intervalHours'];
      if (typeof intervalHours !== 'number' || !Number.isInteger(intervalHours) || intervalHours < 1 || intervalHours > BACKUP_INTERVAL_HOURS_MAX) {
        throw new AdminError('bad-request', `intervalHours must be an integer from 1 to ${BACKUP_INTERVAL_HOURS_MAX}.`);
      }
      const retention = input['retention'];
      if (typeof retention !== 'number' || !Number.isInteger(retention) || retention < 1 || retention > BACKUP_RETENTION_MAX) {
        throw new AdminError('bad-request', `retention must be an integer from 1 to ${BACKUP_RETENTION_MAX}.`);
      }
      const passphrase = passphraseOf(input);
      try { mkdirSync(folder, { recursive: true }); } catch { throw new AdminError('bad-request', 'The backup folder could not be created.'); }
      const before = config();
      let derived;
      try { derived = await deriveBackupKey(passphrase, backupDeps()); } catch { throw new AdminError('internal', 'The backup key could not be derived.'); }
      try {
        saveScheduleKey(p.configDir, derived, protector);
      } catch {
        throw new AdminError('unavailable', 'The schedule key could not be stored (key protection failed).');
      } finally {
        derived.key.fill(0);
      }
      try {
        writeHubConfig(p.configFile, applyBackupScheduleChange(before, { folder, intervalHours, retention }));
      } catch (error) {
        if (before.backup?.schedule === undefined) clearScheduleKey(p.configDir);
        throw new AdminError('internal', `The schedule could not be saved: ${(error as Error).message}`);
      }
      // A stale failure (for example a missing key) must not delay the first run of the new schedule.
      if (readBackupLast(context.db)?.ok === false) context.db.prepare('DELETE FROM meta WHERE key = ?').run(BACKUP_LAST_META);
      auditCli('backup.scheduled', 'success', { action: 'set', intervalHours, retention });
      return { configured: true, folder, intervalHours, retention, replaced: before.backup?.schedule !== undefined };
    },
    'backup.schedule.off': () => {
      const p = paths();
      const before = config();
      const had = before.backup?.schedule !== undefined || scheduleKeyExists(p.configDir);
      if (before.backup?.schedule !== undefined) writeHubConfig(p.configFile, applyBackupScheduleChange(before, null));
      clearScheduleKey(p.configDir);
      if (had) auditCli('backup.scheduled', 'success', { action: 'off' });
      return { configured: false, wasConfigured: had };
    },
    'backup.schedule.status': () => {
      const schedule = config().backup?.schedule;
      return {
        configured: schedule !== undefined,
        folder: schedule?.folder ?? null,
        intervalHours: schedule?.intervalHours ?? null,
        retention: schedule?.retention ?? null,
        last: readBackupLast(context.db),
        keyPresent: scheduleKeyExists(paths().configDir),
      };
    },
  };
}
