import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, rmdirSync, statSync, writeFileSync } from 'node:fs';
import { open } from 'node:fs/promises';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { REPO_OBJECT_NAME, openBackupFile, openBackupV2 } from '@dude/hub-backup';
import type { BackupDeps, BackupManifest, BackupV2FileEntry, BackupV2Head, BackupV2Reader, OpenedBackup } from '@dude/hub-backup';
import { latestVersion, setMeta, transaction } from '@dude/sqlite-store';
import type { Db } from '@dude/sqlite-store';
import { defaultHubConfig, parseHubConfig, writeHubConfig } from '../config/hub-config.js';
import type { HubConfig } from '../config/hub-config.js';
import { ensureLayout, hubPaths } from '../config/data-dir.js';
import { createLocalBlobStore } from '../blobs/local-blob-store.js';
import { openHubDb } from '../db/open-hub-db.js';
import { HUB_MIGRATIONS } from '../db/migrations/index.js';
import { setAuthority } from '../hub/authority.js';
import { openSaveSphereDb } from '../savesphere-db/open.js';
import { audit } from '../security/audit.js';
import { newId as defaultNewId } from '../util/ids.js';
import { BACKUP_CONFIG_FILE, BACKUP_DB_FILE } from './create-backup.js';
import { fileByteSource } from './create-export.js';
import { MANIFEST_PREFIX, backupIdOfManifest } from './destinations/destination.js';
import type { BackupDestination } from './destinations/destination.js';
import { createLocalFolderDestination } from './destinations/local-folder.js';
import { BACKUP_V2_SAVESPHERE_FILE } from './run-backup-v2.js';
import { SAVESPHERE_SCRUBBED_META_PREFIXES, SAVESPHERE_SCRUBBED_TABLES, SCRUBBED_META_KEYS, SCRUBBED_META_PREFIXES, SCRUBBED_TABLES } from './snapshot.js';

/**
 * Hub restore (31G, PD-070 to PD-072; backup v2 from 32-SS1 Milestone 847, PD-150). Offline only: the caller (the elevated
 * `dude-hub backup restore` command) must have established that no Hub is running on `dataRoot`; this module follows the purge
 * staged-confirmation pattern (a hashed, single-use, 60-second token bound to a digest of the backup and the target state) and never
 * opens a live database. The passphrase is used only to open the backup and is never logged, audited, stored or put in a message.
 *
 * Sources: a `.dudebackup` file (v1, read whole within its 512 MiB ceiling, or a v2 single-file export, streamed) or a v2 repository
 * folder (a `local-folder` destination) and a backup id (default: the newest manifest). A v2 restore brings back `dude.db`,
 * `savesphere.db` and EVERY blob the manifest lists into `storage/blobs` (each streamed through a SHA-256 check into a staged store),
 * all built under `data/.restore-tmp` and swapped in only after every entry checked out; a manifest that does not verify (structure,
 * counts, end record, authentication) is refused before anything is staged. The 31G rules hold for both versions: new instance id,
 * epoch + 1, desktop devices `needs_re_pair`, transient tables cleared, `hub.json` reduced to port and names, the two typed phrases.
 */

/** Consequence classes of a restore: it writes files, replaces the database and handles secrets (PD-074). */
export const RESTORE_CONSEQUENCE_CLASS = ['filesystem-write', 'database-write', 'secret-management'] as const;
/** The operator must type this to restore over an existing Hub data directory. */
export const RESTORE_PHRASE_REPLACE = 'REPLACE HUB DATA';
/** The operator must type this to restore a backup that was not made with `--for-transfer`. */
export const RESTORE_PHRASE_OLD_HUB_GONE = 'THE OLD HUB IS GONE';
export const RESTORE_TTL_MS = 60_000;
export const restoreConfirmFile = (root: string): string => path.join(root, 'run', 'restore-confirm.json');
/** `hub.json` in a backup is small; anything larger is not a Hub configuration. */
const MAX_CONFIG_BYTES = 1024 * 1024;

export type RestoreErrorCode =
  | 'backup-too-new'
  | 'confirmation-required'
  | 'conflict'
  | 'target-not-empty'
  | 'old-hub-gone-required'
  | 'invalid-backup'
  | 'integrity-failed';

/** A restore refusal. Wrong passphrases and corrupt files surface as `BackupError` from `@dude/hub-backup` instead. */
export class RestoreError extends Error {
  readonly code: RestoreErrorCode;
  constructor(code: RestoreErrorCode, message: string) {
    super(message);
    this.name = 'RestoreError';
    this.code = code;
  }
}

export type RestoreTargetState = 'empty' | 'existing';

export interface RestoreSummary {
  source: { hubInstanceId: string; authorityEpoch: number; schemaVersion: number; hubVersion: string; createdAt: string };
  newEpoch: number;
  forTransfer: boolean;
  counts: Record<string, number>;
  targetState: RestoreTargetState;
  /** True when the operator must type RESTORE_PHRASE_OLD_HUB_GONE (the backup was not made for a transfer). */
  requiresOldHubGonePhrase: boolean;
  /** True when the operator must type RESTORE_PHRASE_REPLACE (the target already holds a Hub database). */
  requiresReplacePhrase: boolean;
  consequenceClass: typeof RESTORE_CONSEQUENCE_CLASS;
  /** 1 or 2. */
  formatVersion?: number;
  /** v2: the backup id and how many blobs (and their bytes) it restores. */
  backupId?: string;
  blobs?: number;
  blobBytes?: number;
}

/**
 * Where the backup is read from: one of `file`, `folder` (a v2 repository) or `destination` (any opened backup destination, for
 * example an S3 bucket; library use, Milestone 848), with an optional `backupId` (default: the newest) for the last two.
 */
export interface RestoreSourceOptions {
  file?: string;
  folder?: string;
  destination?: BackupDestination;
  backupId?: string;
}

export interface PreviewRestoreOptions extends RestoreSourceOptions {
  /** Never logged, returned or persisted. */
  passphrase: string;
  dataRoot: string;
  deps: BackupDeps;
  now: () => number;
  /** Token generator (default: 32 random bytes, base64url). */
  newToken?: () => string;
}

export interface RestorePreview {
  /** Shown once; only its hash is staged. */
  confirmToken: string;
  /** ISO timestamp, 60 seconds after the preview. */
  expiresAt: string;
  summary: RestoreSummary;
}

export interface ApplyRestoreOptions extends RestoreSourceOptions {
  /** Never logged, returned or persisted. */
  passphrase: string;
  dataRoot: string;
  confirmToken: string;
  /** The caller has verified the operator typed RESTORE_PHRASE_REPLACE. */
  replaceExisting?: boolean;
  /** The caller has verified the operator typed RESTORE_PHRASE_OLD_HUB_GONE. */
  oldHubGoneConfirmed?: boolean;
  deps: BackupDeps;
  now: () => number;
  newId?: () => string;
  /** Test seam for the final file moves (default `fs.renameSync`). */
  rename?: (from: string, to: string) => void;
}

export interface RestoreResult {
  hubInstanceId: string;
  authorityEpoch: number;
  /** Devices marked `needs_re_pair`. */
  devices: number;
  /** Absolute folder the replaced database, configuration and TLS directory were moved to, or null for an empty target. */
  replacedDir: string | null;
  /** v2 only: blobs restored into `storage/blobs`. */
  blobs?: number;
}

const SQLITE_MAGIC = 'SQLite format 3\u0000';
/** Per-run meta keys also removed on restore (a scheduled backup's own status belongs to the old machine). */
const EXTRA_META_KEYS = ['backup_last'] as const;
const sha256Text = (text: string): Buffer => createHash('sha256').update(text).digest();
const sha256Hex = (bytes: Uint8Array | string): string => createHash('sha256').update(bytes).digest('hex');
const safeEqual = (a: string, b: string): boolean => timingSafeEqual(sha256Text(a), sha256Text(b));

const supportedSchemaVersion = (): number => latestVersion(HUB_MIGRATIONS);
const tmpDirOf = (dataDir: string): string => path.join(dataDir, '.restore-tmp');
const stamp = (ms: number): string => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');

/** What the summary and the confirmation digest need, whatever the version. */
interface BackupFacts {
  createdAt: string;
  hubVersion: string;
  source: BackupManifest['source'];
  forTransfer: boolean;
  counts: Record<string, number>;
  files: Array<{ name: string; size: number }>;
}

type Validated =
  | { version: 1; facts: BackupFacts; digestBase: string; dbBytes: Uint8Array; config: HubConfig; opened: OpenedBackup; close(): void }
  | {
      version: 2; facts: BackupFacts; digestBase: string; config: HubConfig; reader: BackupV2Reader; head: BackupV2Head;
      dbEntry: BackupV2FileEntry; saveSphereEntry: BackupV2FileEntry | null; blobs: number; blobBytes: number; close(): void;
    };

async function streamHash(source: AsyncIterable<Uint8Array>): Promise<string> {
  const hash = createHash('sha256');
  for await (const piece of source) hash.update(piece);
  return hash.digest('hex');
}

async function readSmall(reader: BackupV2Reader, entry: BackupV2FileEntry): Promise<Uint8Array> {
  if (entry.size > MAX_CONFIG_BYTES) throw new RestoreError('invalid-backup', `The ${entry.name} in the backup is too large to be a Hub configuration.`);
  const parts: Uint8Array[] = [];
  for await (const piece of reader.readEntry(entry)) parts.push(piece);
  return new Uint8Array(Buffer.concat(parts));
}

function parseConfigBytes(bytes: Uint8Array): HubConfig {
  try {
    return parseHubConfig(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
  } catch {
    throw new RestoreError('invalid-backup', 'The configuration in the backup is not a valid Hub configuration.');
  }
}

function checkSource(options: RestoreSourceOptions): void {
  const hasFile = typeof options.file === 'string' && options.file.length > 0;
  const hasFolder = typeof options.folder === 'string' && options.folder.length > 0;
  const hasDestination = options.destination !== undefined;
  if (Number(hasFile) + Number(hasFolder) + Number(hasDestination) !== 1) throw new RestoreError('invalid-backup', 'Give exactly one backup source: a file or a repository folder.');
  if (options.backupId !== undefined && hasFile) throw new RestoreError('invalid-backup', 'A backup id selects a backup in a repository folder only.');
}

/** Opens and validates the backup. Throws BackupError (wrong passphrase, corrupt backup) or RestoreError. */
async function readAndValidate(options: RestoreSourceOptions & { passphrase: string; deps: BackupDeps }): Promise<Validated> {
  checkSource(options);
  let reader: BackupV2Reader;
  let sourceTag: string;
  if (options.file !== undefined) {
    let size: number;
    try {
      const info = statSync(options.file);
      if (!info.isFile()) throw new Error('not a file');
      size = info.size;
    } catch {
      throw new RestoreError('invalid-backup', 'The backup file could not be read.');
    }
    const opened = await openBackupFile(fileByteSource(options.file, size), { passphrase: options.passphrase }, options.deps);
    if (opened.formatVersion === 1) return validateV1(options.file, opened.backup);
    reader = opened.reader;
    sourceTag = `file:${size}`;
  } else {
    let destination: BackupDestination;
    if (options.destination !== undefined) {
      destination = options.destination;
      if ((await destination.stat(REPO_OBJECT_NAME)) === null) throw new RestoreError('invalid-backup', 'The destination holds no backup repository.');
    } else {
      const folder = path.resolve(options.folder as string);
      if (!existsSync(path.join(folder, REPO_OBJECT_NAME))) throw new RestoreError('invalid-backup', 'The folder holds no backup repository.');
      destination = createLocalFolderDestination({ id: 'restore', label: 'restore', folder });
    }
    let backupId = options.backupId;
    if (backupId === undefined) {
      const newest = (await destination.list(MANIFEST_PREFIX)).map((m) => backupIdOfManifest(m.name)).filter((id): id is string => id !== null).pop();
      if (newest === undefined) throw new RestoreError('invalid-backup', 'The repository holds no backup.');
      backupId = newest;
    }
    if ((await destination.stat(`${MANIFEST_PREFIX}${backupId}`)) === null) throw new RestoreError('invalid-backup', 'The repository has no backup with that id.');
    reader = await openBackupV2(destination.source(), backupId, { passphrase: options.passphrase }, options.deps);
    sourceTag = options.destination !== undefined ? 'destination' : 'folder';
  }
  try {
    return await validateV2(reader, sourceTag);
  } catch (error) {
    reader.close();
    throw error;
  }
}

function validateV1(file: string, opened: OpenedBackup): Validated {
  const dbBytes = opened.files.get(BACKUP_DB_FILE);
  const configBytes = opened.files.get(BACKUP_CONFIG_FILE);
  if (dbBytes === undefined || configBytes === undefined) throw new RestoreError('invalid-backup', `The backup does not contain ${BACKUP_DB_FILE} and ${BACKUP_CONFIG_FILE}.`);
  if (opened.manifest.source.dbMinReaderVersion > supportedSchemaVersion()) {
    throw new RestoreError('backup-too-new', 'This backup was made by a newer DUDE Hub; update this Hub before restoring it.');
  }
  if (Buffer.from(dbBytes.subarray(0, SQLITE_MAGIC.length)).toString('latin1') !== SQLITE_MAGIC) {
    throw new RestoreError('invalid-backup', 'The database in the backup is not a SQLite database.');
  }
  const config = parseConfigBytes(configBytes);
  const manifest = opened.manifest;
  const facts: BackupFacts = { createdAt: manifest.createdAt, hubVersion: manifest.hubVersion, source: manifest.source, forTransfer: manifest.forTransfer, counts: manifest.counts, files: manifest.files.map((f) => ({ name: f.name, size: f.size })) };
  // The 31G digest: the file hash and the manifest (unchanged, so a v1 preview token keeps its meaning).
  const digestBase = JSON.stringify({ fileSha256: sha256Hex(readFileSync(file)), createdAt: manifest.createdAt, hubVersion: manifest.hubVersion, source: manifest.source, forTransfer: manifest.forTransfer, files: manifest.files, counts: manifest.counts });
  return { version: 1, facts, digestBase, dbBytes, config, opened, close: () => undefined };
}

async function validateV2(reader: BackupV2Reader, sourceTag: string): Promise<Validated> {
  const head = reader.head;
  if (head.source.dbMinReaderVersion > supportedSchemaVersion()) throw new RestoreError('backup-too-new', 'This backup was made by a newer DUDE Hub; update this Hub before restoring it.');
  // Walks the whole manifest: authenticated records, order, counts and the end record. A manifest that does not verify is refused here.
  let dbEntry: BackupV2FileEntry | null = null;
  let configEntry: BackupV2FileEntry | null = null;
  let saveSphereEntry: BackupV2FileEntry | null = null;
  const files: Array<{ name: string; size: number }> = [];
  let blobs = 0;
  let blobBytes = 0;
  for await (const entry of reader.listEntries()) {
    if (entry.kind === 'blob') { blobs += 1; blobBytes += entry.size; continue; }
    files.push({ name: entry.name, size: entry.size });
    if (entry.name === BACKUP_DB_FILE) dbEntry = entry;
    else if (entry.name === BACKUP_CONFIG_FILE) configEntry = entry;
    else if (entry.name === BACKUP_V2_SAVESPHERE_FILE) saveSphereEntry = entry;
  }
  if (dbEntry === null || configEntry === null) throw new RestoreError('invalid-backup', `The backup does not contain ${BACKUP_DB_FILE} and ${BACKUP_CONFIG_FILE}.`);
  const config = parseConfigBytes(await readSmall(reader, configEntry));
  const objects = `${await streamHash(reader.source.read(REPO_OBJECT_NAME))}:${await streamHash(reader.source.read(reader.manifestName))}`;
  const facts: BackupFacts = { createdAt: head.createdAt, hubVersion: head.hubVersion, source: head.source, forTransfer: head.forTransfer, counts: head.counts, files };
  const digestBase = JSON.stringify({ v: 2, sourceTag, objects, backupId: head.backupId, repoId: head.repoId, ...facts, blobs, blobBytes });
  return { version: 2, facts, digestBase, config, reader, head, dbEntry, saveSphereEntry, blobs, blobBytes, close: () => reader.close() };
}

function targetStateOf(dbFile: string): RestoreTargetState {
  return existsSync(dbFile) ? 'existing' : 'empty';
}

const digestOf = (validated: Validated, targetState: RestoreTargetState): string =>
  validated.version === 1
    ? sha256Hex(JSON.stringify({ ...(JSON.parse(validated.digestBase) as object), targetState }))
    : sha256Hex(`${validated.digestBase}\n${targetState}`);

function summaryOf(validated: Validated, targetState: RestoreTargetState): RestoreSummary {
  const facts = validated.facts;
  return {
    source: { hubInstanceId: facts.source.hubInstanceId, authorityEpoch: facts.source.authorityEpoch, schemaVersion: facts.source.schemaVersion, hubVersion: facts.hubVersion, createdAt: facts.createdAt },
    newEpoch: facts.source.authorityEpoch + 1,
    forTransfer: facts.forTransfer,
    counts: { ...facts.counts },
    targetState,
    requiresOldHubGonePhrase: !facts.forTransfer,
    requiresReplacePhrase: targetState === 'existing',
    consequenceClass: RESTORE_CONSEQUENCE_CLASS,
    formatVersion: validated.version,
    ...(validated.version === 2 ? { backupId: validated.head.backupId, blobs: validated.blobs, blobBytes: validated.blobBytes } : {}),
  };
}

/**
 * Opens and validates the backup and stages a hashed, single-use, 60-second confirmation token. Writes nothing in the target
 * data directory except the staged confirmation file (`<dataRoot>/run/restore-confirm.json`).
 */
export async function previewRestore(options: PreviewRestoreOptions): Promise<RestorePreview> {
  const root = path.resolve(options.dataRoot);
  const paths = hubPaths(root);
  const validated = await readAndValidate(options);
  try {
    const targetState = targetStateOf(paths.dbFile);
    const token = options.newToken ? options.newToken() : randomBytes(32).toString('base64url');
    const at = options.now();
    const expiresAt = at + RESTORE_TTL_MS;
    const confirmFile = restoreConfirmFile(root);
    mkdirSync(path.dirname(confirmFile), { recursive: true });
    const temp = `${confirmFile}.tmp`;
    writeFileSync(
      temp,
      `${JSON.stringify({ v: 1, tokenHash: sha256Text(token).toString('hex'), digest: digestOf(validated, targetState), expiresAt, previewedAt: at })}\n`,
      { mode: 0o600 },
    );
    renameSync(temp, confirmFile);
    return { confirmToken: token, expiresAt: new Date(expiresAt).toISOString(), summary: summaryOf(validated, targetState) };
  } finally {
    validated.close();
  }
}

interface StoredConfirm { tokenHash?: unknown; digest?: unknown; expiresAt?: unknown; previewedAt?: unknown }

function readStored(file: string): StoredConfirm | null {
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as unknown;
    return typeof parsed === 'object' && parsed !== null ? (parsed as StoredConfirm) : null;
  } catch {
    return null;
  }
}

/** The configuration a restored Hub starts with: port and names kept, loopback-only, private, no proxy, ACME, backup schedule or destination. */
export function sanitizeRestoredConfig(config: HubConfig): HubConfig {
  const defaults = defaultHubConfig();
  return parseHubConfig({ port: config.port, bind: defaults.bind, exposure: { mode: 'private', names: [...config.exposure.names] } });
}

interface RestoredDatabase { hubInstanceId: string; devices: number }
interface RestoreMeta { sourceEpoch: number; forTransfer: boolean; previewedAt: number; replaced: boolean; blobs?: number }

/** Migrates the staged database (already at `dbFile`) up, clears transient state, marks devices for re-pairing and assigns the new identity. */
function buildRestoredDatabase(dbFile: string, tmpDir: string, meta: RestoreMeta, ctx: { now: () => number; newId: () => string }): RestoredDatabase {
  const opened = openHubDb({ dbFile, preMigrationDir: path.join(tmpDir, 'pre-migration'), now: () => new Date(ctx.now()) });
  if (opened.status === 'incompatible') throw new RestoreError('backup-too-new', 'This backup was made by a newer DUDE Hub; update this Hub before restoring it.');
  if (opened.status === 'corrupt') throw new RestoreError('invalid-backup', 'The database in the backup could not be opened.');
  const { db } = opened.hub;
  try {
    const at = new Date(ctx.now()).toISOString();
    const newEpoch = meta.sourceEpoch + 1;
    const hubInstanceId = ctx.newId();
    const devices = transaction(db, () => clearAndMark(db, at, { ...meta, newEpoch, hubInstanceId, now: ctx.now() }));
    const integrity = db.prepare('PRAGMA integrity_check').all() as Array<Record<string, unknown>>;
    if (integrity.length !== 1 || Object.values(integrity[0]!)[0] !== 'ok') throw new RestoreError('integrity-failed', 'The restored database failed its integrity check.');
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    db.exec('PRAGMA journal_mode = DELETE');
    return { hubInstanceId, devices };
  } finally {
    opened.hub.close();
  }
}

function clearAndMark(db: Db, at: string, info: RestoreMeta & { newEpoch: number; hubInstanceId: string; now: number }): number {
  // // The transient set the backup scrub already removes (so the lists cannot drift), then per-device sync cursors and the TLS trust root.
  for (const table of [...SCRUBBED_TABLES, 'device_sync_state', 'tls_pin_acks', 'tls_pins', 'tls_proxy_pin_acks', 'tls_proxy_pins']) {
    db.exec(`DELETE FROM ${table}`);
  }
  const del = db.prepare('DELETE FROM meta WHERE key = ?');
  for (const key of [...SCRUBBED_META_KEYS, ...EXTRA_META_KEYS]) del.run(key);
  const keys = (db.prepare('SELECT key FROM meta').all() as Array<{ key: string }>).map((row) => row.key);
  for (const key of keys) if (SCRUBBED_META_PREFIXES.some((prefix) => key.startsWith(prefix))) del.run(key);

  // Desktop devices only: browser rows are key-less attribution and simply sign in again (their sessions are gone).
  const marked = db.prepare("UPDATE devices SET needs_re_pair = 1 WHERE kind = 'desktop' AND revoked_at IS NULL AND unenrolled_at IS NULL").run();
  db.prepare('UPDATE device_keys SET revoked_at = ? WHERE revoked_at IS NULL AND device_id IN (SELECT device_id FROM devices WHERE needs_re_pair = 1)').run(at);
  const devices = Number(marked.changes);

  setMeta(db, 'hub_instance_id', info.hubInstanceId);
  setAuthority(db, { epoch: info.newEpoch, state: 'active' });

  // Only counts and booleans: no ids, paths or secrets. The preview ran before the restored database existed, so its row is written here.
  const detail = { sourceEpoch: info.sourceEpoch, newEpoch: info.newEpoch, devices, forTransfer: info.forTransfer, replaced: info.replaced, ...(info.blobs !== undefined ? { blobs: info.blobs } : {}) };
  audit(db, { event: 'backup.restore-previewed', outcome: 'success', actorKind: 'cli', detail, now: info.previewedAt });
  audit(db, { event: 'backup.restored', outcome: 'success', actorKind: 'cli', detail, now: info.now });
  return devices;
}

/** Streams an entry to a new file (fsynced); the entry's size and SHA-256 are checked by the reader at the end of the stream. */
async function stageEntry(reader: BackupV2Reader, entry: BackupV2FileEntry, file: string): Promise<void> {
  const handle = await open(file, 'wx', 0o600);
  try {
    for await (const piece of reader.readEntry(entry)) {
      let at = 0;
      while (at < piece.length) at += (await handle.write(piece, at, piece.length - at)).bytesWritten;
    }
    await handle.sync();
  } finally {
    await handle.close();
  }
}

/**
 * Prepares a staged `savesphere.db` and the staged blob store: migrates the database up, clears the transient tables and leases
 * (defence in depth: the backup already scrubbed them), streams every blob of the manifest into the staged store through its
 * SHA-256, and marks a catalogued blob whose bytes the backup does not carry (it was missing or corrupt when the backup ran) as
 * `missing`, so the verify job and the collector see the truth.
 */
async function stageSaveSphere(reader: BackupV2Reader, entry: BackupV2FileEntry | null, tmpDir: string, now: () => number): Promise<{ file: string | null; blobsDir: string; blobs: number }> {
  const blobsDir = path.join(tmpDir, 'blobs');
  const store = createLocalBlobStore({ blobsDir, stagingDir: path.join(tmpDir, 'blob-staging') });
  let blobs = 0;
  for await (const item of reader.listEntries()) {
    if (item.kind !== 'blob') continue;
    await store.put(reader.readEntry(item), { expectedSha256: item.sha256 });
    blobs += 1;
  }
  rmSync(path.join(tmpDir, 'blob-staging'), { recursive: true, force: true });
  if (entry === null) return { file: null, blobsDir, blobs };

  const file = path.join(tmpDir, BACKUP_V2_SAVESPHERE_FILE);
  await stageEntry(reader, entry, file);
  const opened = openSaveSphereDb({ saveSphereDbPath: file, saveSpherePreMigrationDir: path.join(tmpDir, 'pre-migration-savesphere') }, { now: () => new Date(now()) });
  if (opened.status === 'incompatible') throw new RestoreError('backup-too-new', 'This backup was made by a newer DUDE Hub; update this Hub before restoring it.');
  if (opened.status === 'corrupt') throw new RestoreError('invalid-backup', 'The SaveSphere database in the backup could not be opened.');
  const db = opened.store.db;
  try {
    const tableExists = (name: string): boolean => db.prepare("SELECT 1 AS x FROM sqlite_master WHERE type = 'table' AND name = ?").get(name) !== undefined;
    transaction(db, () => {
      for (const table of SAVESPHERE_SCRUBBED_TABLES) if (tableExists(table)) db.exec(`DELETE FROM ${table}`);
      for (const prefix of SAVESPHERE_SCRUBBED_META_PREFIXES) db.prepare("DELETE FROM meta WHERE substr(key, 1, ?) = ?").run(prefix.length, prefix);
    });
    if (tableExists('blobs')) {
      const missing: string[] = [];
      const check = new DatabaseSync(file, { readOnly: true });
      try {
        for (const raw of check.prepare("SELECT sha256 FROM blobs WHERE state != 'missing' ORDER BY sha256").iterate()) {
          const sha256 = (raw as { sha256: string }).sha256;
          if (!(await store.has(sha256))) missing.push(sha256);
          if (missing.length >= 10_000) break;
        }
      } finally {
        check.close();
      }
      if (missing.length > 0) {
        const at = new Date(now()).toISOString();
        transaction(db, () => { for (const sha256 of missing) db.prepare("UPDATE blobs SET state = 'missing', verified_at = ? WHERE sha256 = ?").run(at, sha256); });
      }
    }
    const integrity = db.prepare('PRAGMA integrity_check').all() as Array<Record<string, unknown>>;
    if (integrity.length !== 1 || Object.values(integrity[0]!)[0] !== 'ok') throw new RestoreError('integrity-failed', 'The restored SaveSphere database failed its integrity check.');
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    db.exec('PRAGMA journal_mode = DELETE');
  } finally {
    opened.store.close();
  }
  return { file, blobsDir, blobs };
}

/**
 * Restores the backup into `dataRoot`. Everything is built in `<dataRoot>/data/.restore-tmp` first; the target is touched only by
 * the final renames, which are rolled back if any of them fails. An existing database, `savesphere.db`, `hub.json`, the TLS and
 * secrets directories and the blob store are moved to `<dataRoot>/backups/replaced-<UTC stamp>/`, never deleted.
 */
export async function applyRestore(options: ApplyRestoreOptions): Promise<RestoreResult> {
  const root = path.resolve(options.dataRoot);
  const paths = hubPaths(root);
  const now = options.now;
  const newId = options.newId ?? defaultNewId;
  const rename = options.rename ?? renameSync;
  const confirmFile = restoreConfirmFile(root);

  const stored = readStored(confirmFile);
  const consume = (): void => rmSync(confirmFile, { force: true });
  if (stored === null) throw new RestoreError('confirmation-required', 'There is no pending restore preview. Run the preview first; nothing was changed.');
  if (typeof stored.expiresAt !== 'number' || stored.expiresAt < now()) {
    consume();
    throw new RestoreError('confirmation-required', 'The confirmation token expired. Run the preview again; nothing was changed.');
  }
  if (typeof stored.tokenHash !== 'string' || typeof options.confirmToken !== 'string' || !safeEqual(stored.tokenHash, sha256Text(options.confirmToken).toString('hex'))) {
    consume();
    throw new RestoreError('confirmation-required', 'The confirmation token is not valid. Run the preview again; nothing was changed.');
  }

  const validated = await readAndValidate(options);
  try {
    const facts = validated.facts;
    const targetState = targetStateOf(paths.dbFile);
    if (typeof stored.digest !== 'string' || stored.digest !== digestOf(validated, targetState)) {
      consume();
      throw new RestoreError('conflict', 'The backup or the target changed since the preview. Run the preview again; nothing was changed.');
    }
    if (targetState === 'existing' && options.replaceExisting !== true) {
      throw new RestoreError('target-not-empty', `The target already holds a Hub database; confirm with the phrase "${RESTORE_PHRASE_REPLACE}". Nothing was changed.`);
    }
    if (!facts.forTransfer && options.oldHubGoneConfirmed !== true) {
      throw new RestoreError('old-hub-gone-required', `This backup was not made for a transfer; confirm with the phrase "${RESTORE_PHRASE_OLD_HUB_GONE}". Nothing was changed.`);
    }
    consume(); // single use: every path below either restores or fails without a retry on this token

    const tmpDir = tmpDirOf(paths.dataDir);
    const previewedAt = typeof stored.previewedAt === 'number' ? stored.previewedAt : now();
    try {
      rmSync(tmpDir, { recursive: true, force: true });
      mkdirSync(tmpDir, { recursive: true, mode: 0o700 });
      const aside = [
        [paths.dbFile, BACKUP_DB_FILE],
        [`${paths.dbFile}-wal`, `${BACKUP_DB_FILE}-wal`],
        [`${paths.dbFile}-shm`, `${BACKUP_DB_FILE}-shm`],
        [paths.saveSphereDbPath, BACKUP_V2_SAVESPHERE_FILE],
        [`${paths.saveSphereDbPath}-wal`, `${BACKUP_V2_SAVESPHERE_FILE}-wal`],
        [`${paths.saveSphereDbPath}-shm`, `${BACKUP_V2_SAVESPHERE_FILE}-shm`],
        [paths.configFile, BACKUP_CONFIG_FILE],
        [paths.tlsDir, 'tls'],
        // The machine-bound secrets belong to the old instance (a tunnel token, the backup master key): the restored Hub re-enters them.
        [paths.secretsDir, 'secrets'],
        [paths.blobsDir, 'blobs'],
      ].filter(([from]) => existsSync(from!)) as Array<[string, string]>;
      let replacedDir: string | null = null;
      if (aside.length > 0) {
        const base = path.join(paths.backupsDir, `replaced-${stamp(now())}`);
        replacedDir = base;
        for (let n = 2; existsSync(replacedDir); n += 1) replacedDir = `${base}-${n}`;
      }

      const stagedDb = path.join(tmpDir, BACKUP_DB_FILE);
      let staged: { file: string | null; blobsDir: string; blobs: number } | null = null;
      if (validated.version === 1) {
        writeFileSync(stagedDb, validated.dbBytes, { mode: 0o600 });
      } else {
        await stageEntry(validated.reader, validated.dbEntry, stagedDb);
        staged = await stageSaveSphere(validated.reader, validated.saveSphereEntry, tmpDir, now);
      }
      const built = buildRestoredDatabase(stagedDb, tmpDir, {
        sourceEpoch: facts.source.authorityEpoch, forTransfer: facts.forTransfer, previewedAt, replaced: replacedDir !== null,
        ...(staged !== null ? { blobs: staged.blobs } : {}),
      }, { now, newId });
      const stagedConfig = path.join(tmpDir, BACKUP_CONFIG_FILE);
      writeHubConfig(stagedConfig, sanitizeRestoredConfig(validated.config));

      const done: Array<{ from: string; to: string }> = [];
      const move = (from: string, to: string): void => {
        rename(from, to);
        done.push({ from, to });
      };
      try {
        if (replacedDir !== null) {
          mkdirSync(replacedDir, { recursive: true });
          for (const [from, name] of aside) move(from, path.join(replacedDir, name));
        }
        mkdirSync(paths.dataDir, { recursive: true });
        move(stagedDb, paths.dbFile);
        if (staged?.file) move(staged.file, paths.saveSphereDbPath);
        if (staged !== null && existsSync(staged.blobsDir)) {
          mkdirSync(paths.storageDir, { recursive: true });
          move(staged.blobsDir, paths.blobsDir);
        }
        mkdirSync(paths.configDir, { recursive: true });
        move(stagedConfig, paths.configFile);
      } catch (error) {
        for (const { from, to } of done.reverse()) {
          try { renameSync(to, from); } catch { /* best effort: the replaced copy stays under backups/replaced-* */ }
        }
        if (replacedDir !== null) { try { rmdirSync(replacedDir); } catch { /* not empty or absent */ } }
        throw error;
      }
      ensureLayout(root);
      return {
        hubInstanceId: built.hubInstanceId, authorityEpoch: facts.source.authorityEpoch + 1, devices: built.devices, replacedDir,
        ...(staged !== null ? { blobs: staged.blobs } : {}),
      };
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  } finally {
    validated.close();
  }
}

