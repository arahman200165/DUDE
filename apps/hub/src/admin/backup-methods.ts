import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { BackupError, DEFAULT_KDF_PARAMS, REPO_OBJECT_NAME, backupFileName, createRepository, openBackupFile, openBackupV2, openRepository, readRepositoryObject, rewrapRepository } from '@dude/hub-backup';
import type { BackupManifest, BackupRepository, BackupV2Head } from '@dude/hub-backup';
import { transaction } from '@dude/sqlite-store';
import type { Db } from '@dude/sqlite-store';
import { BACKUP_LAST_META, backupFailureCode, readBackupLast, writeBackupLast } from '../backup/backup-state.js';
import { BACKUP_CONSEQUENCE_CLASS, BACKUP_REACTIVATE_CONSEQUENCE_CLASS, BACKUP_TRANSFER_CONSEQUENCE_CLASS } from '../backup/create-backup.js';
import { createBackupExportFile, fileByteSource } from '../backup/create-export.js';
import { destinationLockKey, tryLockDestination } from '../backup/destination-lock.js';
import { DestinationError, MANIFEST_PREFIX, assertSafeLocalFolder, backupIdOfManifest, defaultDriveCredentialStore, defaultS3CredentialStore, isDriveDefinition, isInsideFolder, isS3Definition, openBackupDestination, validateS3Credentials } from '../backup/destinations/index.js';
import type { BackupDestination, DriveBackupDestination, DriveCredentialStore, S3BackupDestination, S3CredentialStore } from '../backup/destinations/index.js';
import { nodeBackupDeps, validateBackupPassphrase } from '../backup/kdf.js';
import { defaultMasterKeyStore } from '../backup/master-key.js';
import type { MasterKeyStore } from '../backup/master-key.js';
import { listBackups } from '../backup/retention.js';
import { BACKUP_PRUNE_ACTION, BACKUP_PRUNE_CONSEQUENCE_CLASS, DEFAULT_RETENTION, PruneError, applyPrunePlan, backupIdTime, planPrune } from '../backup/retention-v2.js';
import { createRestoreDrillService } from '../backup/restore-drill.js';
import { BACKUP_JOURNAL_PREFIX, BackupRunError, backupRunFailureCode, runBackupV2 } from '../backup/run-backup-v2.js';
import type { RunBackupV2Result } from '../backup/run-backup-v2.js';
import { clearScheduleKey, scheduleKeyExists } from '../backup/schedule-key.js';
import { COUNTED_TABLES } from '../backup/snapshot.js';
import {
  BACKUP_DESTINATIONS_MAX, BACKUP_INTERVAL_HOURS_MAX, BACKUP_RETENTION_MAX, applyBackupConfigChange, loadOrCreateHubConfig, parseS3Endpoint, parseS3Prefix, writeHubConfig,
} from '../config/hub-config.js';
import type { HubBackupDestinationConfig, HubBackupS3Destination } from '../config/hub-config.js';
import { getAuthorityEpoch, getAuthorityState, setAuthority } from '../hub/authority.js';
import { clearDestinationState, readDestinationState, updateDestinationState } from '../hub/backup-destination-state.js';
import { evaluateBackupHealth } from '../hub/backup-health.js';
import { setSecretExpected } from '../provisioning/index.js';

/** The secret-store purposes a destination kind can store credentials under (the closed list lives with the store; request handlers never import it). */
type SecretPurpose = Parameters<typeof setSecretExpected>[1];
import { audit } from '../security/audit.js';
import { ConfirmationStore } from '../security/confirmation-store.js';
import { AdminError } from './admin-endpoint.js';
import type { AdminMethod } from './admin-endpoint.js';
import { buildDriveMethods } from './drive-methods.js';
import { revokeDriveToken } from '../backup/destinations/index.js';
import type { DriveEndpoints, DriveFetch } from '../backup/destinations/index.js';
import { GOOGLE_DRIVE_ENDPOINTS } from '../backup/destinations/index.js';
import type { AdminMethodContext } from './methods.js';

/** The ConfirmationStore action of `backup create` (also `--for-transfer`). Only the admin pipe can issue or consume it. */
export const BACKUP_CREATE_ACTION = 'backup.create';
/** The ConfirmationStore action of `backup reactivate`. Only the admin pipe can issue or consume it. */
export const BACKUP_REACTIVATE_ACTION = 'backup.reactivate';
/** `backup destination remove` (Milestone 847): the definition goes; the objects at the destination are never deleted. */
export const BACKUP_DESTINATION_REMOVE_ACTION = 'backup.destination.remove';
/** `backup rewrap` (Milestone 847): a new passphrase for every destination repository. */
export const BACKUP_REWRAP_ACTION = 'backup.rewrap';
export { BACKUP_PRUNE_ACTION };
export const BACKUP_DESTINATION_REMOVE_CONSEQUENCE_CLASS = ['system-config'] as const;
/** Removing an S3 destination also deletes its stored credentials (Milestone 848). */
export const BACKUP_DESTINATION_REMOVE_S3_CONSEQUENCE_CLASS = ['system-config', 'secret-management'] as const;
/** Removing a Google Drive destination also deletes its stored authorization and revokes the token at Google (Milestone 856). */
export const BACKUP_DESTINATION_REMOVE_DRIVE_CONSEQUENCE_CLASS = ['system-config', 'secret-management', 'remote-write'] as const;
/** Removing the last destination also deletes the master key from the secret store. */
export const BACKUP_DESTINATION_REMOVE_LAST_CONSEQUENCE_CLASS = ['system-config', 'secret-management'] as const;
export const BACKUP_REWRAP_CONSEQUENCE_CLASS = ['secret-management', 'filesystem-write'] as const;
const ADMIN_BINDING = 'cli';
const RETIRE_WARNING = 'After the backup is written and verified, this Hub will refuse sign-in, sync, pairing and web access until it is reactivated.';
const REACTIVATE_WARNING = 'If the backup was already restored elsewhere, there will be two Hubs. Devices follow the higher epoch.';
const PASSPHRASE_WARNING = 'Losing the passphrase makes the backup unrecoverable.';
const SAME_MACHINE_WARNING = 'A backup stored on the Hub\'s own machine does not protect against losing that machine. Keep a copy elsewhere.';
const KEPT_OBJECTS_NOTE = 'Backups already written to this destination are NOT deleted; delete the folder yourself if you no longer need them.';
const KEPT_DRIVE_OBJECTS_NOTE = 'Backups already written to Google Drive are NOT deleted; delete the folder in Drive yourself if you no longer need them. The stored Google authorization is deleted and, when Google can be reached, revoked.';
const KEPT_S3_OBJECTS_NOTE = 'Backups already written to this bucket are NOT deleted; delete the objects under the prefix yourself if you no longer need them. The stored S3 credentials are deleted.';

/** The facts about a v1 backup that are safe to show: no keys, no credentials, no paths. */
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

/** The same facts for a v2 backup (head plus its named files and blob count). */
export function summarizeHead(head: BackupV2Head, files: Array<{ name: string; size: number }>, blobs: number): Record<string, unknown> {
  return {
    formatVersion: head.formatVersion,
    minReaderVersion: head.minReaderVersion,
    backupId: head.backupId,
    createdAt: head.createdAt,
    hubVersion: head.hubVersion,
    source: { ...head.source },
    forTransfer: head.forTransfer,
    counts: { ...head.counts },
    files,
    blobs,
  };
}

const comparable = (value: string, platform: NodeJS.Platform): string => (platform === 'win32' ? path.resolve(value).toLowerCase() : path.resolve(value));
const equalBytes = (a: Uint8Array, b: Uint8Array): boolean => a.length === b.length && a.every((byte, i) => byte === b[i]);

/** What a destination kind contributes to the shared add flow: its definition and the credentials it keeps in the secret store. */
export interface PreparedDestination {
  definition: HubBackupDestinationConfig;
  /** The already configured destination at the same location, if any. */
  same: HubBackupDestinationConfig | undefined;
  /** Called once the add proceeds (a local folder is created). */
  beforeOpen?: () => void;
  /** The credentials this kind keeps in the secret store: stored for the duration of the add and removed again when it fails. */
  storeCredentials?: { purpose: SecretPurpose; put(): void; discard(): void };
  /** Best-effort cleanup of anything the preparation created elsewhere (a Drive folder) when the add fails. */
  onFailure?: () => Promise<void>;
  failureNoun: string;
}

/** Backup admin methods (PD-074, Milestone 847). Params carrying a passphrase are never logged, audited or echoed in an error. */
export function buildBackupMethods(context: AdminMethodContext, shared: { now: () => number; confirmations: ConfirmationStore }): Record<string, AdminMethod> {
  const { now, confirmations } = shared;
  const platform = context.platform ?? process.platform;
  const backupDeps = (): ReturnType<typeof nodeBackupDeps> => context.backupDeps ?? nodeBackupDeps(() => new Date(now()));
  const paths = (): NonNullable<AdminMethodContext['paths']> => {
    if (!context.paths) throw new AdminError('unavailable', 'Backups are not available in this context.');
    return context.paths;
  };
  let masterKeyStore: MasterKeyStore | undefined = context.masterKeyStore;
  const masterKeys = (): MasterKeyStore => (masterKeyStore ??= defaultMasterKeyStore(paths()));
  const config = () => loadOrCreateHubConfig(paths().configFile);
  const destinationsOf = (): HubBackupDestinationConfig[] => config().backup?.destinations ?? [];
  let s3Store: S3CredentialStore | undefined = context.s3CredentialStore;
  const s3Credentials = (): S3CredentialStore => (s3Store ??= defaultS3CredentialStore(paths()));
  let driveStore: DriveCredentialStore | undefined = context.driveCredentialStore;
  const driveCredentials = (): DriveCredentialStore => (driveStore ??= defaultDriveCredentialStore(paths()));
  const openDestination = (definition: HubBackupDestinationConfig): BackupDestination => {
    try {
      return (context.openBackupDestination ?? ((d) => openBackupDestination(d, paths(), platform, {
        s3Credentials: s3Credentials(), driveCredentials: driveCredentials(),
        ...(context.s3Test !== undefined ? { s3: context.s3Test } : {}), ...(context.driveTest !== undefined ? { drive: context.driveTest } : {}),
      })))(definition);
    } catch (error) {
      if (error instanceof DestinationError) throw new AdminError(error.code === 'unavailable' ? 'unavailable' : 'bad-request', error.message);
      throw error;
    }
  };
  /** Where a destination lives, comparable across definitions (a folder, or endpoint, bucket and prefix). */
  const locationOf = (definition: HubBackupDestinationConfig): string =>
    isS3Definition(definition) ? `s3:${definition.endpoint}|${definition.bucket}|${definition.prefix ?? ''}` : isDriveDefinition(definition) ? `drive:${definition.folderId}` : comparable(definition.folder, platform);
  const record = (params: unknown): Record<string, unknown> => (typeof params === 'object' && params !== null && !Array.isArray(params) ? (params as Record<string, unknown>) : {});
  const saveSphere = (): Db | undefined => context.saveSphereDb?.();
  const lockKey = (id: string): string => destinationLockKey(paths().root, id);

  /** An absolute folder that is not inside the live data, configuration, certificate, secret or storage directories. */
  const resolveTargetFolder = (raw: unknown): string => {
    const p = paths();
    let resolved: string;
    try {
      resolved = assertSafeLocalFolder(raw === undefined ? p.backupsDir : raw, p, platform);
    } catch (error) {
      if (error instanceof DestinationError) throw new AdminError('bad-request', error.message);
      throw error;
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
  const destinationById = (raw: unknown): HubBackupDestinationConfig => {
    if (typeof raw !== 'string' || raw.length === 0) throw new AdminError('bad-request', 'A destination id is required.');
    const found = destinationsOf().find((d) => d.id === raw);
    if (found === undefined) throw new AdminError('not-found', 'There is no backup destination with that id.');
    return found;
  };
  /** The held master key (the caller zeroes it). */
  const loadMasterKey = (): Uint8Array => {
    let key: Uint8Array | null;
    try { key = masterKeys().load(); } catch { throw new AdminError('unavailable', 'The stored backup master key is unreadable; add a destination again with the passphrase.'); }
    if (key === null) throw new AdminError('refused', 'No backup master key is stored on this Hub; add a backup destination with the passphrase first.');
    return key;
  };
  const openRepositoryAt = async (destination: BackupDestination, credential: { masterKey: Uint8Array } | { passphrase: string }): Promise<BackupRepository> => {
    try {
      return await openRepository(await readRepositoryObject(destination.source()), credential, backupDeps());
    } catch (error) {
      if (error instanceof BackupError) throw new AdminError(error.code === 'integrity' ? 'not-found' : error.code, error.code === 'integrity' ? 'The destination has no readable backup repository.' : error.message);
      throw error;
    }
  };
  const digestOf = (folder: string, forTransfer: boolean): string =>
    createHash('sha256').update(JSON.stringify({ folder: comparable(folder, platform), hubInstanceId: context.hubInstanceId, epoch: getAuthorityEpoch(context.db), forTransfer })).digest('hex');
  const reactivateDigest = (): string =>
    createHash('sha256').update(JSON.stringify({ epoch: getAuthorityEpoch(context.db), hubInstanceId: context.hubInstanceId })).digest('hex');
  const removeDigest = (definition: HubBackupDestinationConfig): string =>
    createHash('sha256').update(JSON.stringify({ v: 1, id: definition.id, kind: definition.kind, folder: locationOf(definition) })).digest('hex');
  const rewrapDigest = (definitions: HubBackupDestinationConfig[]): string =>
    createHash('sha256').update(JSON.stringify({ v: 1, destinations: definitions.map((d) => [d.id, locationOf(d)]).sort() })).digest('hex');
  /** `forTransfer` is absent (false) or a boolean; a Hub that already was transferred cannot start another transfer. */
  const forTransferOf = (params: Record<string, unknown>): boolean => {
    const value = params['forTransfer'];
    if (value === undefined) return false;
    if (typeof value !== 'boolean') throw new AdminError('bad-request', 'forTransfer must be true or false.');
    if (value && getAuthorityState(context.db) === 'transferred') throw new AdminError('conflict', 'This Hub was already transferred. Reactivate it first.');
    return value;
  };
  /**
   * Retires the Hub after its transfer backup was written and verified: the state flips, the audit event is written in the
   * same transaction (both or neither). Never throws a credential; the epoch is unchanged (reactivation is what bumps it).
   */
  const retire = (name: string): void => {
    const epoch = getAuthorityEpoch(context.db);
    transaction(context.db, () => {
      setAuthority(context.db, { epoch, state: 'transferred' });
      auditCli('backup.transferred', 'success', { epoch, name });
    });
  };
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

  const validLabel = (labelRaw: unknown): void => {
    if (labelRaw !== undefined && (typeof labelRaw !== 'string' || labelRaw.trim().length === 0 || labelRaw.length > 64 || /[\u0000-\u001f\u007f]/.test(labelRaw))) {
      throw new AdminError('bad-request', 'label must be 1 to 64 printable characters.');
    }
  };

  const prepareLocal = (folderRaw: unknown, labelRaw: unknown): PreparedDestination => {
    const folder = resolveTargetFolder(folderRaw);
    validLabel(labelRaw);
    const existing = destinationsOf();
    const same = existing.find((d) => d.kind === 'local-folder' && comparable(d.folder, platform) === comparable(folder, platform));
    if (same === undefined && existing.some((d) => d.kind === 'local-folder' && (isInsideFolder(folder, d.folder, platform) || isInsideFolder(d.folder, folder, platform)))) {
      throw new AdminError('conflict', 'The folder is inside (or contains) another backup destination.');
    }
    const id = `d-${randomBytes(4).toString('hex')}`;
    return {
      definition: { id, kind: 'local-folder', label: typeof labelRaw === 'string' ? labelRaw.trim() : `Local folder ${path.basename(folder) || folder}`, folder },
      same,
      beforeOpen: () => { try { mkdirSync(folder, { recursive: true }); } catch { throw new AdminError('bad-request', 'The backup folder could not be created.'); } },
      failureNoun: 'folder',
    };
  };

  /** True when two key prefixes in one bucket can hold the other's objects (equal, or one is a path ancestor of the other). */
  const prefixesOverlap = (a: string | undefined, b: string | undefined): boolean => {
    const x = a === undefined ? '' : `${a}/`;
    const y = b === undefined ? '' : `${b}/`;
    return x.startsWith(y) || y.startsWith(x);
  };

  const prepareS3 = (input: Record<string, unknown>): PreparedDestination => {
    validLabel(input['label']);
    const flag = (name: 'forcePathStyle' | 'allowPrivateNetwork'): boolean | undefined => {
      const value = input[name];
      if (value === undefined) return undefined;
      if (typeof value !== 'boolean') throw new AdminError('bad-request', `${name} must be true or false.`);
      return value;
    };
    const forcePathStyle = flag('forcePathStyle');
    const allowPrivateNetwork = flag('allowPrivateNetwork');
    const endpoint = parseS3Endpoint(input['endpoint'], allowPrivateNetwork === true);
    if ('error' in endpoint) throw new AdminError('bad-request', `endpoint ${endpoint.error}.`);
    const region = input['region'];
    if (typeof region !== 'string' || !/^[a-z0-9][a-z0-9-]{0,31}$/.test(region)) throw new AdminError('bad-request', 'region must be 1 to 32 lower-case letters, digits or hyphens.');
    const bucket = input['bucket'];
    if (typeof bucket !== 'string' || !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket)) throw new AdminError('bad-request', 'bucket must be 3 to 63 lower-case letters, digits, dots or hyphens.');
    const prefix = parseS3Prefix(input['prefix']);
    if ('error' in prefix) throw new AdminError('bad-request', `prefix ${prefix.error}.`);
    const credentials = validateS3Credentials(input['credentials']);
    if (typeof credentials === 'string') throw new AdminError('bad-request', `${credentials}.`);
    const existing = destinationsOf();
    const same = existing.find((d): d is HubBackupS3Destination => isS3Definition(d) && d.endpoint === endpoint.origin && d.bucket === bucket && (d.prefix ?? '') === (prefix.prefix ?? ''));
    if (same === undefined && existing.some((d) => isS3Definition(d) && d.endpoint === endpoint.origin && d.bucket === bucket && prefixesOverlap(d.prefix, prefix.prefix))) {
      throw new AdminError('conflict', 'The bucket prefix overlaps another backup destination.');
    }
    const id = `d-${randomBytes(4).toString('hex')}`;
    const label = typeof input['label'] === 'string' ? input['label'].trim() : `S3 ${bucket}${prefix.prefix !== undefined ? `/${prefix.prefix}` : ''}`;
    const definition: HubBackupS3Destination = {
      id, kind: 's3', label, endpoint: endpoint.origin, region, bucket,
      ...(prefix.prefix !== undefined ? { prefix: prefix.prefix } : {}), ...(forcePathStyle !== undefined ? { forcePathStyle } : {}), ...(allowPrivateNetwork === true ? { allowPrivateNetwork: true } : {}),
    };
    return {
      definition, same, failureNoun: 'bucket',
      storeCredentials: { purpose: 'backup.s3.credentials', put: () => s3Credentials().put(id, credentials), discard: () => { s3Credentials().delete(id); } },
    };
  };

  /**
   * Adds a destination (or returns the one already configured at the same location). A location that already holds a
   * repository is ADOPTED when the passphrase opens it and its master key is the Hub's (or the Hub has none yet: after a restore
   * onto a new machine, re-adding the old folder or bucket continues its chain); otherwise a repository is created wrapping the
   * Hub's master key (created on the first destination) under the passphrase. The passphrase must open the existing destinations
   * too, so every repository of one Hub answers to one passphrase. An S3 destination's credentials are stored in the secret store
   * for the duration of the add and removed again when it fails; they are never in `hub.json`, the audit log or an answer.
   */
  const addDestination = async (prepared: PreparedDestination, passphraseOrNull: string | null): Promise<{ definition: HubBackupDestinationConfig; added: boolean; adopted: boolean }> => {
    const existing = destinationsOf();
    if (prepared.same !== undefined) return { definition: prepared.same, added: false, adopted: false };
    if (existing.length >= BACKUP_DESTINATIONS_MAX) throw new AdminError('conflict', `At most ${BACKUP_DESTINATIONS_MAX} backup destinations can be configured.`);
    if (passphraseOrNull === null) throw new AdminError('bad-request', 'passphrase is required to add a backup destination.');
    const passphrase = passphraseOrNull;
    const { definition } = prepared;
    const id = definition.id;
    prepared.beforeOpen?.();
    let credentialsStored = false;
    if (prepared.storeCredentials !== undefined) {
      try { prepared.storeCredentials.put(); credentialsStored = true; } catch {
        await prepared.onFailure?.();
        throw new AdminError('unavailable', 'The credentials could not be stored (key protection failed).');
      }
    }
    let added = false;
    try {
      const destination = openDestination(definition);
      const probe = await destination.probe();
      if (!probe.ok) throw new AdminError('unavailable', `The backup ${prepared.failureNoun} cannot be written (${probe.reason}).`);

      let stored: Uint8Array | null;
      try { stored = masterKeys().load(); } catch { throw new AdminError('unavailable', 'The stored backup master key is unreadable.'); }
      let master: Uint8Array | null = null;
      let adopted = false;
      let repoId: string;
      try {
        if ((await destination.stat(REPO_OBJECT_NAME)) !== null) {
          const repository = await openRepositoryAt(destination, { passphrase });
          try {
            master = repository.exportMasterKey();
            repoId = repository.repoId;
          } finally {
            repository.close();
          }
          if (stored !== null && !equalBytes(stored, master)) throw new AdminError('conflict', `This ${prepared.failureNoun} holds a backup repository made with another key; it cannot be added to this Hub.`);
          adopted = true;
        } else {
          if (stored !== null) {
            // One passphrase for every repository of this Hub: it must open an existing destination's repository.
            const other = existing[0];
            if (other !== undefined) {
              const repository = await openRepositoryAt(openDestination(other), { passphrase }).catch((error: unknown) => {
                if (error instanceof AdminError && error.code === 'wrong-passphrase-or-corrupt') throw new AdminError('wrong-passphrase-or-corrupt', 'The passphrase does not open the existing backup destinations. Use the same passphrase, or change it everywhere with "dude-hub backup rewrap".');
                throw error;
              });
              const matches = equalBytes(repository.exportMasterKey(), stored);
              repository.close();
              if (!matches) throw new AdminError('conflict', 'The existing destinations use another key.');
            }
          }
          master = stored !== null ? stored.slice() : backupDeps().randomBytes(32).slice();
          const { repository, object } = await createRepository(passphrase, backupDeps(), DEFAULT_KDF_PARAMS, { masterKey: master });
          repoId = repository.repoId;
          repository.close();
          const out = await destination.sink().create(REPO_OBJECT_NAME);
          try {
            await out.write(object);
            await out.commit();
          } catch (error) {
            await out.abort();
            throw error;
          }
        }
        if (stored === null) {
          try { masterKeys().save(master); } catch { throw new AdminError('unavailable', 'The backup master key could not be stored (key protection failed).'); }
          const sdb = saveSphere();
          if (sdb !== undefined) { try { setSecretExpected(sdb, 'backup.masterKey'); } catch { /* provisioning status only */ } }
        }
      } finally {
        master?.fill(0);
        stored?.fill(0);
      }
      const before = config();
      writeHubConfig(paths().configFile, applyBackupConfigChange(before, { destinations: [...(before.backup?.destinations ?? []), definition] }));
      added = true;
      if (prepared.storeCredentials !== undefined) {
        const sdb = saveSphere();
        if (sdb !== undefined) { try { setSecretExpected(sdb, prepared.storeCredentials.purpose); } catch { /* provisioning status only */ } }
      }
      updateDestinationState(context.db, id, { repoId });
      auditCli('backup.destination-added', 'success', { destination: id, kind: definition.kind, adopted });
      return { definition, added: true, adopted };
    } finally {
      if (!added) {
        if (credentialsStored) { try { prepared.storeCredentials?.discard(); } catch { /* nothing more to clean */ } }
        await prepared.onFailure?.();
      }
    }
  };

  const driveFetch = (): DriveFetch => context.driveTest?.client?.fetch ?? ((input, init) => fetch(input, init));
  const driveEndpoints = (): DriveEndpoints => context.driveTest?.client?.endpoints ?? GOOGLE_DRIVE_ENDPOINTS;
  const credentialsStored = (definition: HubBackupDestinationConfig): boolean => {
    try { return isDriveDefinition(definition) ? driveCredentials().has(definition.id) : s3Credentials().has(definition.id); } catch { return false; }
  };
  /** Non-secret facts about a destination; an S3 destination reports whether its credentials are stored, never the credentials. */
  const describeDestination = (definition: HubBackupDestinationConfig): Record<string, unknown> => isS3Definition(definition)
    ? {
      id: definition.id, kind: definition.kind, label: definition.label, endpoint: definition.endpoint, region: definition.region, bucket: definition.bucket,
      ...(definition.prefix !== undefined ? { prefix: definition.prefix } : {}), ...(definition.forcePathStyle !== undefined ? { forcePathStyle: definition.forcePathStyle } : {}),
      allowPrivateNetwork: definition.allowPrivateNetwork === true, credentialsStored: credentialsStored(definition), state: readDestinationState(context.db, definition.id),
    }
    : isDriveDefinition(definition)
      ? { id: definition.id, kind: definition.kind, label: definition.label, folderId: definition.folderId, clientId: definition.clientId, credentialsStored: credentialsStored(definition), state: readDestinationState(context.db, definition.id) }
      : { id: definition.id, kind: definition.kind, label: definition.label, folder: definition.folder, state: readDestinationState(context.db, definition.id) };

  const runDestinations = async (definitions: HubBackupDestinationConfig[]): Promise<Array<Record<string, unknown>>> => {
    const masterKey = loadMasterKey();
    const results: Array<Record<string, unknown>> = [];
    let lastOk: RunBackupV2Result | undefined;
    let firstError: string | undefined;
    try {
      for (const definition of definitions) {
        try {
          const sdb = saveSphere();
          const result = await runBackupV2({
            db: context.db, paths: paths(), hubVersion: context.hubVersion, hubInstanceId: context.hubInstanceId, destination: openDestination(definition), masterKey,
            deps: backupDeps(), now, trigger: 'manual',
            ...(sdb !== undefined ? { saveSphereDb: sdb } : {}),
            ...(context.flushCollab ? { beforeSnapshot: context.flushCollab } : {}),
            ...(context.backupRunTest ?? {}),
          });
          lastOk = result;
          results.push({ destination: definition.id, ok: true, backupId: result.backupId, files: result.files, blobs: result.blobs, newBlobs: result.newBlobs, reusedBlobs: result.reusedBlobs, skippedBlobs: result.skippedBlobs, bytesWritten: result.bytesWritten });
        } catch (error) {
          const reason = error instanceof AdminError ? error.code : backupRunFailureCode(error);
          firstError ??= reason;
          results.push({ destination: definition.id, ok: false, error: reason, ...(error instanceof BackupRunError && error.code === 'busy' ? { busy: true } : {}) });
        }
      }
    } finally {
      masterKey.fill(0);
    }
    const at = new Date(now()).toISOString();
    try {
      writeBackupLast(context.db, firstError === undefined ? { at, ok: true, ...(lastOk ? { file: lastOk.backupId, size: lastOk.bytesWritten } : {}) } : { at, ok: false, error: firstError });
    } catch { /* best effort */ }
    return results;
  };

  return {
    /** Step one of `backup create`: validates the folder and reports what would be written. Writes nothing. */
    'backup.create.preview': (params) => {
      const input = record(params);
      const folder = resolveTargetFolder(input['folder']);
      const forTransfer = forTransferOf(input);
      const at = now();
      const file = backupFileName(new Date(at));
      const onHubVolume = sameVolume(folder);
      const confirmToken = confirmations.issue({ action: BACKUP_CREATE_ACTION, digest: digestOf(folder, forTransfer), bindingId: ADMIN_BINDING, now: at });
      auditCli('backup.create-previewed', 'success', { file, onHubVolume, ...(forTransfer ? { forTransfer } : {}) });
      return {
        confirmToken,
        expiresAt: ConfirmationStore.expiresAt(at),
        consequenceClass: [...(forTransfer ? BACKUP_TRANSFER_CONSEQUENCE_CLASS : BACKUP_CONSEQUENCE_CLASS)],
        summary: {
          forTransfer,
          ...(forTransfer ? { retiresThisHub: true, retireWarning: RETIRE_WARNING } : {}),
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
    /**
     * Step two: writes the single-file backup v2 (both databases and every referenced blob), verifies it with the passphrase and
     * renames it into place. The passphrase is used for this call only.
     */
    'backup.create.apply': async (params) => {
      const input = record(params);
      const confirmToken = input['confirmToken'];
      if (typeof confirmToken !== 'string' || confirmToken.length === 0) throw new AdminError('bad-request', 'confirmToken is required.');
      const folder = resolveTargetFolder(input['folder']);
      const forTransfer = forTransferOf(input);
      const passphrase = passphraseOf(input);
      const result = confirmations.consumeDetailed({ token: confirmToken, action: BACKUP_CREATE_ACTION, digest: digestOf(folder, forTransfer), bindingId: ADMIN_BINDING, now: now() });
      if (result === 'invalid') throw new AdminError('confirmation-required', 'The confirmation is missing, expired or already used.');
      if (result === 'digest-mismatch') throw new AdminError('conflict', 'The target folder or the Hub changed since the preview. Run the preview again.');
      const p = paths();
      try {
        const sdb = saveSphere();
        const created = await createBackupExportFile({
          db: context.db, paths: p, hubVersion: context.hubVersion, hubInstanceId: context.hubInstanceId,
          forTransfer, targetDir: folder, passphrase, deps: backupDeps(), now, workDir: path.join(p.backupsDir, '.tmp'),
          ...(sdb !== undefined ? { saveSphereDb: sdb } : {}),
          ...(context.flushCollab ? { beforeSnapshot: context.flushCollab } : {}),
        });
        const name = path.basename(created.file);
        writeBackupLast(context.db, { at: new Date(now()).toISOString(), ok: true, file: name, size: created.size });
        auditCli('backup.created', 'success', { file: name, size: created.size, trigger: 'manual', ...(forTransfer ? { forTransfer } : {}) });
        const summary = { file: created.file, name, size: created.size, sha256: created.sha256, manifest: summarizeHead(created.head, created.files, created.blobs) };
        if (!forTransfer) return { ...summary, retired: false };
        // ONLY now, with the file written and verified, may the Hub retire itself.
        try {
          retire(name);
        } catch {
          try { auditCli('backup.failed', 'failure', { reason: 'retire-failed', trigger: 'manual' }); } catch { /* best effort */ }
          // The verified backup is KEPT and this Hub stays active: the operator can retry, or use the file as an ordinary backup.
          throw new AdminError('backup-failed', 'The backup was written and verified, but the Hub could not be retired. The Hub is still active; the backup file was kept.', { reason: 'retire-failed', file: created.file });
        }
        // Sockets close after the state flipped; a failure here cannot undo the retirement (the fence and the socket handlers re-check the state).
        try { context.onTransferred?.(); } catch { /* best effort */ }
        return { ...summary, retired: true };
      } catch (error) {
        if (error instanceof AdminError) throw error;
        const reason = backupFailureCode(error);
        try { writeBackupLast(context.db, { at: new Date(now()).toISOString(), ok: false, error: reason }); } catch { /* best effort */ }
        try { auditCli('backup.failed', 'failure', { reason, trigger: 'manual' }); } catch { /* best effort */ }
        throw new AdminError('backup-failed', `The backup could not be created (${reason}). Nothing was kept.`, { reason });
      }
    },
    /** Step one of `backup reactivate`: a transferred Hub only. Changes nothing. */
    'backup.reactivate.preview': () => {
      if (getAuthorityState(context.db) !== 'transferred') throw new AdminError('conflict', 'This Hub is not transferred.');
      const at = now();
      const authorityEpoch = getAuthorityEpoch(context.db);
      const confirmToken = confirmations.issue({ action: BACKUP_REACTIVATE_ACTION, digest: reactivateDigest(), bindingId: ADMIN_BINDING, now: at });
      return {
        confirmToken,
        expiresAt: ConfirmationStore.expiresAt(at),
        consequenceClass: [...BACKUP_REACTIVATE_CONSEQUENCE_CLASS],
        summary: { authorityEpoch, newEpoch: authorityEpoch + 1, warning: REACTIVATE_WARNING },
      };
    },
    /** Step two: returns the Hub to service under the next epoch, so a device that followed the transfer keeps following the higher epoch. */
    'backup.reactivate.apply': (params) => {
      const confirmToken = record(params)['confirmToken'];
      if (typeof confirmToken !== 'string' || confirmToken.length === 0) throw new AdminError('bad-request', 'confirmToken is required.');
      const result = confirmations.consumeDetailed({ token: confirmToken, action: BACKUP_REACTIVATE_ACTION, digest: reactivateDigest(), bindingId: ADMIN_BINDING, now: now() });
      if (result === 'invalid') throw new AdminError('confirmation-required', 'The confirmation is missing, expired or already used.');
      if (result === 'digest-mismatch') throw new AdminError('conflict', 'The Hub changed since the preview. Run the preview again.');
      if (getAuthorityState(context.db) !== 'transferred') throw new AdminError('conflict', 'This Hub is not transferred.');
      const previousEpoch = getAuthorityEpoch(context.db);
      const epoch = previousEpoch + 1;
      transaction(context.db, () => {
        setAuthority(context.db, { epoch, state: 'active' });
        auditCli('backup.reactivated', 'success', { previousEpoch, epoch });
      });
      return { authorityEpoch: epoch, authorityState: 'active' };
    },
    /** Backup files (`.dudebackup`) in a folder (default: the first local destination, else `<root>/backups`). */
    'backup.list': (params) => {
      const raw = record(params)['folder'];
      const firstLocal = destinationsOf().find((d) => d.kind === 'local-folder');
      const folderRaw = raw === undefined ? (firstLocal !== undefined && firstLocal.kind === 'local-folder' ? firstLocal.folder : paths().backupsDir) : raw;
      if (typeof folderRaw !== 'string' || folderRaw.length === 0 || !path.isAbsolute(folderRaw)) throw new AdminError('bad-request', 'The backup folder must be an absolute path.');
      const folder = path.resolve(folderRaw);
      let backups;
      try { backups = listBackups(folder); } catch { throw new AdminError('unavailable', 'The backup folder could not be read.'); }
      return { folder, backups: backups.map((entry) => ({ name: entry.name, size: entry.size, modifiedAt: entry.mtime.toISOString() })) };
    },
    /** Opens a `.dudebackup` file (v1 or v2) with the passphrase, verifies it end to end and reports what it holds. Writes nothing. */
    'backup.verify': async (params) => {
      const input = record(params);
      const file = input['file'];
      if (typeof file !== 'string' || file.length === 0 || !path.isAbsolute(file)) throw new AdminError('bad-request', 'file must be an absolute path to a backup file.');
      const passphrase = input['passphrase'];
      if (typeof passphrase !== 'string' || passphrase.length === 0) throw new AdminError('bad-request', 'passphrase is required.');
      let size: number;
      try {
        const stat = statSync(file);
        if (!stat.isFile()) throw new AdminError('bad-request', 'file is not a regular file.');
        size = stat.size;
      } catch (error) {
        if (error instanceof AdminError) throw error;
        throw new AdminError('not-found', 'The backup file could not be read.');
      }
      try {
        const opened = await openBackupFile(fileByteSource(file, size), { passphrase }, backupDeps());
        if (opened.formatVersion === 1) return { ok: true, manifest: summarizeManifest(opened.backup.manifest) };
        try {
          await opened.reader.verify({ scope: 'full' });
          const files: Array<{ name: string; size: number }> = [];
          let blobs = 0;
          for await (const entry of opened.reader.listEntries()) {
            if (entry.kind === 'file') files.push({ name: entry.name, size: entry.size });
            else blobs += 1;
          }
          return { ok: true, manifest: summarizeHead(opened.reader.head, files, blobs) };
        } finally {
          opened.reader.close();
        }
      } catch (error) {
        if (error instanceof BackupError) throw new AdminError(error.code, error.message);
        throw new AdminError('verify-failed', 'The backup could not be opened.');
      }
    },
    /**
     * Sets (or replaces) the schedule interval. With `folder`, the folder becomes a destination first (the 31G call shape; the
     * passphrase is needed when it is new). A schedule needs at least one destination and the master key. `retention` is the 31G
     * count: still validated, no longer used (retention is 7/4/6 and pruned by `backup prune`).
     */
    'backup.schedule.set': async (params) => {
      const input = record(params);
      const p = paths();
      const intervalHours = input['intervalHours'];
      if (typeof intervalHours !== 'number' || !Number.isInteger(intervalHours) || intervalHours < 1 || intervalHours > BACKUP_INTERVAL_HOURS_MAX) {
        throw new AdminError('bad-request', `intervalHours must be an integer from 1 to ${BACKUP_INTERVAL_HOURS_MAX}.`);
      }
      const retention = input['retention'];
      if (retention !== undefined && (typeof retention !== 'number' || !Number.isInteger(retention) || retention < 1 || retention > BACKUP_RETENTION_MAX)) {
        throw new AdminError('bad-request', `retention must be an integer from 1 to ${BACKUP_RETENTION_MAX}.`);
      }
      let passphrase: string | null = null;
      if (input['passphrase'] !== undefined) passphrase = passphraseOf(input);
      let destinationAdded: string | null = null;
      if (input['folder'] !== undefined) {
        const folder = resolveTargetFolder(input['folder']);
        const added = await addDestination(prepareLocal(folder, undefined), passphrase);
        if (added.added) destinationAdded = added.definition.id;
      } else if (destinationsOf().length === 0) {
        throw new AdminError('bad-request', 'Add a backup destination first ("dude-hub backup destination add --folder <abs dir>"), or pass folder.');
      }
      if (!masterKeys().exists()) throw new AdminError('refused', 'No backup master key is stored on this Hub; add a backup destination with the passphrase.');
      const before = config();
      writeHubConfig(p.configFile, applyBackupConfigChange(before, { schedule: { intervalHours } }));
      // The 31G derived key is not used by backup v2: remove it.
      clearScheduleKey(p.configDir);
      // A stale failure (for example a missing key) must not delay the first run of the new schedule.
      if (readBackupLast(context.db)?.ok === false) context.db.prepare('DELETE FROM meta WHERE key = ?').run(BACKUP_LAST_META);
      const destinations = destinationsOf().map((d) => d.id);
      auditCli('backup.scheduled', 'success', { action: 'set', intervalHours, destinations: destinations.length });
      return { configured: true, intervalHours, destinations, destinationAdded, replaced: before.backup?.schedule !== undefined, retention: { ...DEFAULT_RETENTION } };
    },
    'backup.schedule.off': () => {
      const p = paths();
      const before = config();
      const had = before.backup?.schedule !== undefined || scheduleKeyExists(p.configDir);
      if (before.backup?.schedule !== undefined) writeHubConfig(p.configFile, applyBackupConfigChange(before, { schedule: null }));
      clearScheduleKey(p.configDir);
      if (had) auditCli('backup.scheduled', 'success', { action: 'off' });
      return { configured: false, wasConfigured: had };
    },
    'backup.schedule.status': () => {
      const current = config();
      const schedule = current.backup?.schedule;
      return {
        configured: schedule !== undefined,
        intervalHours: schedule?.intervalHours ?? null,
        destinations: (current.backup?.destinations ?? []).map((d) => ({ id: d.id, kind: d.kind, label: d.label })),
        retention: { ...DEFAULT_RETENTION },
        last: readBackupLast(context.db),
        keyPresent: masterKeys().exists(),
        // Backup health (Milestone 850): overdue at twice the interval, last run failed, last restore drill failed; ids, labels, ages and codes only.
        health: evaluateBackupHealth(context.db, { schedule, destinations: (current.backup?.destinations ?? []).map((d) => ({ id: d.id, label: d.label })) }, now()),
        ...(schedule?.folder !== undefined ? { legacyFolder: schedule.folder } : {}),
      };
    },
    /** Adds a backup v2 destination (elevated, passphrase). Additive: no confirmation token; audited. */
    'backup.destination.add': async (params) => {
      const input = record(params);
      const kind = input['kind'] ?? 'local-folder';
      if (kind === 'drive') throw new AdminError('bad-request', 'A Google Drive destination is added with the two-step Drive connect (backup.destination.drive.connect.preview), never in one call.');
      if (kind !== 'local-folder' && kind !== 's3') throw new AdminError('bad-request', 'kind must be "local-folder" or "s3".');
      const passphrase = passphraseOf(input);
      const added = await addDestination(kind === 's3' ? prepareS3(input) : prepareLocal(input['folder'], input['label']), passphrase);
      if (!added.added) throw new AdminError('conflict', kind === 's3' ? 'That bucket location is already a backup destination.' : 'That folder is already a backup destination.', { id: added.definition.id });
      return { added: true, adopted: added.adopted, destination: describeDestination(added.definition) };
    },
    'backup.destination.list': () => ({ destinations: destinationsOf().map(describeDestination), retention: { ...DEFAULT_RETENTION } }),
    /** The backups a destination holds (from the manifest names; nothing is decrypted). */
    'backup.destination.backups': async (params) => {
      const definition = destinationById(record(params)['id']);
      const manifests = await openDestination(definition).list(MANIFEST_PREFIX);
      return {
        id: definition.id,
        backups: manifests.map((m) => backupIdOfManifest(m.name)).filter((id): id is string => id !== null)
          .map((backupId) => ({ backupId, at: new Date(backupIdTime(backupId)).toISOString() })),
      };
    },
    /**
     * Tests a destination end to end (Milestone 848): for S3 a tiny object is written, read back, overwritten conditionally and
     * deleted, a tiny multipart upload is completed, and the report says whether conditional writes are enforced, ignored or
     * unsupported, the addressing style, the latency and the clock skew. Writes nothing that stays. Read-only in effect, so no
     * confirmation token; elevated like the rest of the destination commands.
     */
    'backup.destination.probe': async (params) => {
      const definition = destinationById(record(params)['id']);
      const destination = openDestination(definition);
      if (destination.kind === 's3') return { id: definition.id, kind: 's3', ...(await (destination as S3BackupDestination).probeDetailed()) };
      if (destination.kind === 'drive') return { id: definition.id, kind: 'drive', ...(await (destination as DriveBackupDestination).probeDetailed()) };
      const result = await destination.probe();
      return { id: definition.id, kind: destination.kind, ok: result.ok, ...(result.ok ? {} : { reason: result.reason }) };
    },
    /** Full verification of one backup (default: the newest) at a destination with the held key; records `lastVerifiedAt`. */
    'backup.destination.verify': async (params) => {
      const input = record(params);
      const definition = destinationById(input['id']);
      const destination = openDestination(definition);
      let backupId = input['backupId'];
      if (backupId === undefined) {
        backupId = (await destination.list(MANIFEST_PREFIX)).map((m) => backupIdOfManifest(m.name)).filter((id): id is string => id !== null).pop();
        if (backupId === undefined) throw new AdminError('not-found', 'The destination holds no backup.');
      }
      if (typeof backupId !== 'string') throw new AdminError('bad-request', 'backupId must be a backup id.');
      const masterKey = loadMasterKey();
      let repository: BackupRepository;
      try { repository = await openRepositoryAt(destination, { masterKey }); } finally { masterKey.fill(0); }
      try {
        const reader = await openBackupV2(destination.source(), backupId, { repository }, backupDeps());
        try {
          const report = await reader.verify({ scope: 'full' });
          updateDestinationState(context.db, definition.id, { lastVerifiedAt: new Date(now()).toISOString() });
          auditCli('backup.v2-verified', 'success', { destination: definition.id, backupId, scope: 'full', packs: report.packs, trigger: 'manual' });
          return { ok: true, id: definition.id, backupId, files: report.files, blobs: report.blobs, packs: report.packs, bytes: report.bytes };
        } finally {
          reader.close();
        }
      } catch (error) {
        if (error instanceof AdminError) throw error;
        const reason = backupRunFailureCode(error);
        auditCli('backup.v2-verified', 'failure', { destination: definition.id, backupId, scope: 'full', reason, trigger: 'manual' });
        throw new AdminError('verify-failed', `The backup failed verification (${reason}).`, { reason });
      } finally {
        repository.close();
      }
    },
    /** Step one of `backup destination remove`: reports what goes (the definition; with the last one, the key and the schedule). Changes nothing. */
    'backup.destination.remove.preview': (params) => {
      const definition = destinationById(record(params)['id']);
      const last = destinationsOf().length === 1;
      const at = now();
      const confirmToken = confirmations.issue({ action: BACKUP_DESTINATION_REMOVE_ACTION, digest: removeDigest(definition), bindingId: ADMIN_BINDING, now: at });
      const s3 = isS3Definition(definition);
      const drive = isDriveDefinition(definition);
      return {
        confirmToken,
        expiresAt: ConfirmationStore.expiresAt(at),
        consequenceClass: [...(drive ? BACKUP_DESTINATION_REMOVE_DRIVE_CONSEQUENCE_CLASS : last ? BACKUP_DESTINATION_REMOVE_LAST_CONSEQUENCE_CLASS : s3 ? BACKUP_DESTINATION_REMOVE_S3_CONSEQUENCE_CLASS : BACKUP_DESTINATION_REMOVE_CONSEQUENCE_CLASS)],
        summary: {
          id: definition.id, kind: definition.kind, label: definition.label,
          ...(isS3Definition(definition)
            ? { endpoint: definition.endpoint, bucket: definition.bucket, ...(definition.prefix !== undefined ? { prefix: definition.prefix } : {}), removesCredentials: true }
            : isDriveDefinition(definition)
              ? { folderId: definition.folderId, removesCredentials: true, revokesToken: true }
              : { folder: definition.folder }),
          last, removesMasterKey: last, turnsOffSchedule: last && config().backup?.schedule !== undefined, note: drive ? KEPT_DRIVE_OBJECTS_NOTE : s3 ? KEPT_S3_OBJECTS_NOTE : KEPT_OBJECTS_NOTE,
        },
      };
    },
    'backup.destination.remove.apply': async (params) => {
      const input = record(params);
      const confirmToken = input['confirmToken'];
      if (typeof confirmToken !== 'string' || confirmToken.length === 0) throw new AdminError('bad-request', 'confirmToken is required.');
      const definition = destinationById(input['id']);
      const lock = tryLockDestination(lockKey(definition.id), 'remove');
      if ('heldBy' in lock) throw new AdminError('conflict', `A backup operation (${lock.heldBy}) is running on this destination; try again when it finishes.`);
      try {
        const verdict = confirmations.consumeDetailed({ token: confirmToken, action: BACKUP_DESTINATION_REMOVE_ACTION, digest: removeDigest(definition), bindingId: ADMIN_BINDING, now: now() });
        if (verdict === 'invalid') throw new AdminError('confirmation-required', 'The confirmation is missing, expired or already used.');
        if (verdict === 'digest-mismatch') throw new AdminError('conflict', 'The destination changed since the preview. Run the preview again.');
        const before = config();
        const remaining = (before.backup?.destinations ?? []).filter((d) => d.id !== definition.id);
        const last = remaining.length === 0;
        writeHubConfig(paths().configFile, applyBackupConfigChange(before, { destinations: remaining, ...(last ? { schedule: null } : {}) }));
        clearDestinationState(context.db, definition.id);
        context.db.prepare('DELETE FROM meta WHERE key = ?').run(`${BACKUP_JOURNAL_PREFIX}${definition.id}`);
        let keyRemoved = false;
        if (last) { try { keyRemoved = masterKeys().clear(); } catch { /* reported as not removed */ } }
        let credentialsRemoved = false;
        let revokedAtGoogle: boolean | undefined;
        if (isS3Definition(definition)) { try { credentialsRemoved = s3Credentials().delete(definition.id); } catch { /* reported as not removed */ } }
        if (isDriveDefinition(definition)) {
          // The stored authorization goes first (it is the Hub's own secret); the revocation at Google is best effort and reported, never audited with a token.
          let stored: ReturnType<DriveCredentialStore['get']> = null;
          try { stored = driveCredentials().get(definition.id); } catch { /* unreadable: nothing to revoke */ }
          try { credentialsRemoved = driveCredentials().delete(definition.id); } catch { /* reported as not removed */ }
          revokedAtGoogle = stored === null ? false : await revokeDriveToken({ fetch: driveFetch(), endpoints: driveEndpoints(), refreshToken: stored.refreshToken });
        }
        const withCredentials = isS3Definition(definition) || isDriveDefinition(definition);
        auditCli('backup.destination-removed', 'success', { destination: definition.id, kind: definition.kind, last, unattendedCleared: keyRemoved, ...(withCredentials ? { credentialsCleared: credentialsRemoved } : {}), ...(revokedAtGoogle !== undefined ? { revokedAtGoogle } : {}) });
        return { removed: true, id: definition.id, last, keyRemoved, ...(withCredentials ? { credentialsRemoved } : {}), ...(revokedAtGoogle !== undefined ? { revokedAtGoogle } : {}), scheduleOff: last && before.backup?.schedule !== undefined };
      } finally {
        lock.release();
      }
    },
    /** Runs a backup now into one destination or all of them (additive, no confirmation; elevated). */
    'backup.run': async (params) => {
      const raw = record(params)['destination'];
      const definitions = raw === undefined ? destinationsOf() : [destinationById(raw)];
      if (definitions.length === 0) throw new AdminError('refused', 'No backup destination is configured.');
      const results = await runDestinations(definitions);
      return { ok: results.every((r) => r['ok'] === true), results };
    },
    /**
     * Restores the newest verified backup of one destination or all of them into a scratch folder and checks it (Milestone 850): the
     * monthly drill, now. The destination is only read, the live data is never touched and the scratch folder is removed afterwards, so
     * there is nothing to confirm (the Destructive-Action Contract applies to actions that change existing data). Elevated; audited.
     */
    'backup.drill': async (params) => {
      const raw = record(params)['destination'];
      const definitions = raw === undefined ? destinationsOf() : [destinationById(raw)];
      if (definitions.length === 0) throw new AdminError('refused', 'No backup destination is configured.');
      loadMasterKey().fill(0);
      const service = createRestoreDrillService({
        db: context.db, paths: paths(), readConfig: config, masterKeys: masterKeys(), deps: backupDeps(), now, openDestination,
        ...(context.restoreDrillTest ?? {}),
      });
      const { results } = await service.run(definitions.map((d) => d.id), { trigger: 'manual' });
      return { ok: results.every((r) => r.outcome === 'passed'), results };
    },
    /** Step one of `backup prune`: the read-only retention plan of one destination and a token bound to it. Deletes nothing. */
    'backup.prune.preview': async (params) => {
      const definition = destinationById(record(params)['destination']);
      const destination = openDestination(definition);
      const masterKey = loadMasterKey();
      let repository: BackupRepository;
      try { repository = await openRepositoryAt(destination, { masterKey }); } finally { masterKey.fill(0); }
      try {
        const plan = await planPrune({ db: context.db, destination, repository, deps: backupDeps(), workDir: path.join(paths().backupsDir, '.tmp') });
        const at = now();
        const confirmToken = confirmations.issue({ action: BACKUP_PRUNE_ACTION, digest: plan.digest, bindingId: ADMIN_BINDING, now: at });
        return {
          confirmToken,
          expiresAt: ConfirmationStore.expiresAt(at),
          consequenceClass: [...BACKUP_PRUNE_CONSEQUENCE_CLASS],
          summary: {
            destination: definition.id, policy: plan.policy, keep: plan.keep, deleteBackups: plan.deleteManifests.map((n) => backupIdOfManifest(n)),
            sweepPacks: plan.sweepPacks.length, bytes: plan.bytes,
          },
        };
      } catch (error) {
        if (error instanceof PruneError) throw new AdminError(error.code, error.message);
        throw error;
      } finally {
        repository.close();
      }
    },
    /** Step two: under the destination lock (never while a backup runs there), re-plans and deletes exactly the previewed plan. */
    'backup.prune.apply': async (params) => {
      const input = record(params);
      const confirmToken = input['confirmToken'];
      if (typeof confirmToken !== 'string' || confirmToken.length === 0) throw new AdminError('bad-request', 'confirmToken is required.');
      const definition = destinationById(input['destination']);
      const lock = tryLockDestination(lockKey(definition.id), 'prune');
      if ('heldBy' in lock) throw new AdminError('conflict', `A backup operation (${lock.heldBy}) is running on this destination; the prune did not start and the confirmation is still valid.`);
      let repository: BackupRepository | undefined;
      try {
        const destination = openDestination(definition);
        const masterKey = loadMasterKey();
        try { repository = await openRepositoryAt(destination, { masterKey }); } finally { masterKey.fill(0); }
        let plan;
        try {
          plan = await planPrune({ db: context.db, destination, repository, deps: backupDeps(), workDir: path.join(paths().backupsDir, '.tmp') });
        } catch (error) {
          if (error instanceof PruneError) throw new AdminError(error.code, error.message);
          throw error;
        }
        const verdict = confirmations.consumeDetailed({ token: confirmToken, action: BACKUP_PRUNE_ACTION, digest: plan.digest, bindingId: ADMIN_BINDING, now: now() });
        if (verdict === 'invalid') throw new AdminError('confirmation-required', 'The confirmation is missing, expired or already used.');
        if (verdict === 'digest-mismatch') throw new AdminError('conflict', 'The backups at this destination changed since the preview. Run the preview again.');
        const removed = await applyPrunePlan(destination, plan);
        let repoBytes = 0;
        try {
          for (const prefix of ['packs/', 'manifests/'] as const) for (const object of await destination.list(prefix)) repoBytes += object.size;
          repoBytes += (await destination.stat(REPO_OBJECT_NAME))?.size ?? 0;
          updateDestinationState(context.db, definition.id, { repoBytes });
        } catch { /* informational */ }
        auditCli('backup.v2-pruned', 'success', { destination: definition.id, manifests: removed.manifests, packs: removed.packs, bytes: removed.bytes });
        return { destination: definition.id, ...removed, kept: plan.keep.length };
      } finally {
        repository?.close();
        lock.release();
      }
    },
    /** Step one of `backup rewrap` (passphrase change): lists the repositories that will be re-wrapped. Changes nothing. */
    'backup.rewrap.preview': () => {
      const definitions = destinationsOf();
      if (definitions.length === 0) throw new AdminError('refused', 'No backup destination is configured.');
      if (!masterKeys().exists()) throw new AdminError('refused', 'No backup master key is stored on this Hub.');
      const at = now();
      const confirmToken = confirmations.issue({ action: BACKUP_REWRAP_ACTION, digest: rewrapDigest(definitions), bindingId: ADMIN_BINDING, now: at });
      return {
        confirmToken,
        expiresAt: ConfirmationStore.expiresAt(at),
        consequenceClass: [...BACKUP_REWRAP_CONSEQUENCE_CLASS],
        summary: {
          destinations: definitions.map((d) => ({ id: d.id, label: d.label })),
          note: 'Every backup at these destinations will open with the NEW passphrase only; packs and manifests are not rewritten. A .dudebackup file made with "backup create" keeps its own passphrase.',
          passphraseWarning: PASSPHRASE_WARNING,
        },
      };
    },
    /** Step two: re-wraps the master key of every destination repository under the new passphrase (an atomic `repo` replace each). */
    'backup.rewrap.apply': async (params) => {
      const input = record(params);
      const confirmToken = input['confirmToken'];
      if (typeof confirmToken !== 'string' || confirmToken.length === 0) throw new AdminError('bad-request', 'confirmToken is required.');
      const passphrase = passphraseOf(input);
      const definitions = destinationsOf();
      const locks: Array<{ release: () => void }> = [];
      try {
        for (const definition of definitions) {
          const lock = tryLockDestination(lockKey(definition.id), 'rewrap');
          if ('heldBy' in lock) throw new AdminError('conflict', `A backup operation (${lock.heldBy}) is running; the re-wrap did not start and the confirmation is still valid.`);
          locks.push(lock);
        }
        const verdict = confirmations.consumeDetailed({ token: confirmToken, action: BACKUP_REWRAP_ACTION, digest: rewrapDigest(definitions), bindingId: ADMIN_BINDING, now: now() });
        if (verdict === 'invalid') throw new AdminError('confirmation-required', 'The confirmation is missing, expired or already used.');
        if (verdict === 'digest-mismatch') throw new AdminError('conflict', 'The destinations changed since the preview. Run the preview again.');
        const masterKey = loadMasterKey();
        const results: Array<{ id: string; ok: boolean; error?: string }> = [];
        try {
          for (const definition of definitions) {
            try {
              const destination = openDestination(definition);
              const before = await readRepositoryObject(destination.source());
              const rewrapped = await rewrapRepository(before, { masterKey }, passphrase, backupDeps());
              const check = await openRepository(rewrapped, { passphrase }, backupDeps());
              const same = equalBytes(check.exportMasterKey(), masterKey);
              check.close();
              if (!same) throw new Error('rewrap-check-failed');
              await destination.replaceRepo(rewrapped);
              results.push({ id: definition.id, ok: true });
            } catch (error) {
              results.push({ id: definition.id, ok: false, error: error instanceof Error && error.message === 'rewrap-check-failed' ? 'rewrap-check-failed' : backupRunFailureCode(error) });
            }
          }
        } finally {
          masterKey.fill(0);
        }
        const failed = results.filter((r) => !r.ok).length;
        auditCli('backup.rewrapped', failed === 0 ? 'success' : 'failure', { destinations: results.length, failed });
        return { ok: failed === 0, results };
      } finally {
        for (const lock of locks) lock.release();
      }
    },
    ...buildDriveMethods(context, shared, {
      paths, config, destinationsOf, openDestination, passphraseOf, record, auditCli, validLabel, addDestination, describeDestination, saveSphere, driveCredentials, driveFetch, driveEndpoints, destinationById, ADMIN_BINDING,
    }),
  };
}
