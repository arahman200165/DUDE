import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, rmdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { openBackup } from '@dude/hub-backup';
import type { BackupDeps, BackupManifest, OpenedBackup } from '@dude/hub-backup';
import { latestVersion, setMeta, transaction } from '@dude/sqlite-store';
import type { Db } from '@dude/sqlite-store';
import { defaultHubConfig, parseHubConfig, writeHubConfig } from '../config/hub-config.js';
import type { HubConfig } from '../config/hub-config.js';
import { ensureLayout, hubPaths } from '../config/data-dir.js';
import { openHubDb } from '../db/open-hub-db.js';
import { HUB_MIGRATIONS } from '../db/migrations/index.js';
import { setAuthority } from '../hub/authority.js';
import { audit } from '../security/audit.js';
import { newId as defaultNewId } from '../util/ids.js';
import { BACKUP_CONFIG_FILE, BACKUP_DB_FILE } from './create-backup.js';
import { SCRUBBED_META_KEYS, SCRUBBED_META_PREFIXES, SCRUBBED_TABLES } from './snapshot.js';

/**
 * Hub restore (31G, PD-070 to PD-072). Offline only: the caller (the elevated `dude-hub backup restore` command) must have
 * established that no Hub is running on `dataRoot`; this module follows the purge staged-confirmation pattern (a hashed,
 * single-use, 60-second token bound to a digest of the file, its manifest and the target state) and never opens a live database.
 * The passphrase is used only to open the file and is never logged, audited, stored or put in an error message.
 */

/** Consequence classes of a restore: it writes files, replaces the database and handles secrets (PD-074). */
export const RESTORE_CONSEQUENCE_CLASS = ['filesystem-write', 'database-write', 'secret-management'] as const;
/** The operator must type this to restore over an existing Hub data directory. */
export const RESTORE_PHRASE_REPLACE = 'REPLACE HUB DATA';
/** The operator must type this to restore a backup that was not made with `--for-transfer`. */
export const RESTORE_PHRASE_OLD_HUB_GONE = 'THE OLD HUB IS GONE';
export const RESTORE_TTL_MS = 60_000;
export const restoreConfirmFile = (root: string): string => path.join(root, 'run', 'restore-confirm.json');

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
}

export interface PreviewRestoreOptions {
  file: string;
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

export interface ApplyRestoreOptions {
  file: string;
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

interface ValidatedBackup {
  opened: OpenedBackup;
  fileSha256: string;
  dbBytes: Uint8Array;
  config: HubConfig;
}

/** Opens and validates the file. Throws BackupError (wrong passphrase, corrupt file) or RestoreError. */
async function readAndValidate(file: string, passphrase: string, deps: BackupDeps): Promise<ValidatedBackup> {
  let bytes: Buffer;
  try {
    bytes = readFileSync(file);
  } catch {
    throw new RestoreError('invalid-backup', 'The backup file could not be read.');
  }
  const fileSha256 = sha256Hex(bytes);
  const opened = await openBackup(new Uint8Array(bytes), { passphrase }, deps);
  const dbBytes = opened.files.get(BACKUP_DB_FILE);
  const configBytes = opened.files.get(BACKUP_CONFIG_FILE);
  if (dbBytes === undefined || configBytes === undefined) throw new RestoreError('invalid-backup', `The backup does not contain ${BACKUP_DB_FILE} and ${BACKUP_CONFIG_FILE}.`);
  if (opened.manifest.source.dbMinReaderVersion > supportedSchemaVersion()) {
    throw new RestoreError('backup-too-new', 'This backup was made by a newer DUDE Hub; update this Hub before restoring it.');
  }
  if (Buffer.from(dbBytes.subarray(0, SQLITE_MAGIC.length)).toString('latin1') !== SQLITE_MAGIC) {
    throw new RestoreError('invalid-backup', 'The database in the backup is not a SQLite database.');
  }
  let config: HubConfig;
  try {
    config = parseHubConfig(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(configBytes)));
  } catch {
    throw new RestoreError('invalid-backup', 'The configuration in the backup is not a valid Hub configuration.');
  }
  return { opened, fileSha256, dbBytes, config };
}

function targetStateOf(dbFile: string): RestoreTargetState {
  return existsSync(dbFile) ? 'existing' : 'empty';
}

function digestOf(fileSha256: string, manifest: BackupManifest, targetState: RestoreTargetState): string {
  return sha256Hex(
    JSON.stringify({
      fileSha256,
      createdAt: manifest.createdAt,
      hubVersion: manifest.hubVersion,
      source: manifest.source,
      forTransfer: manifest.forTransfer,
      files: manifest.files,
      counts: manifest.counts,
      targetState,
    }),
  );
}

function summaryOf(manifest: BackupManifest, targetState: RestoreTargetState): RestoreSummary {
  return {
    source: {
      hubInstanceId: manifest.source.hubInstanceId,
      authorityEpoch: manifest.source.authorityEpoch,
      schemaVersion: manifest.source.schemaVersion,
      hubVersion: manifest.hubVersion,
      createdAt: manifest.createdAt,
    },
    newEpoch: manifest.source.authorityEpoch + 1,
    forTransfer: manifest.forTransfer,
    counts: { ...manifest.counts },
    targetState,
    requiresOldHubGonePhrase: !manifest.forTransfer,
    requiresReplacePhrase: targetState === 'existing',
    consequenceClass: RESTORE_CONSEQUENCE_CLASS,
  };
}

/**
 * Decrypts and validates the backup and stages a hashed, single-use, 60-second confirmation token. Writes nothing in the target
 * data directory except the staged confirmation file (`<dataRoot>/run/restore-confirm.json`).
 */
export async function previewRestore(options: PreviewRestoreOptions): Promise<RestorePreview> {
  const root = path.resolve(options.dataRoot);
  const paths = hubPaths(root);
  const validated = await readAndValidate(options.file, options.passphrase, options.deps);
  const manifest = validated.opened.manifest;
  const targetState = targetStateOf(paths.dbFile);
  const token = options.newToken ? options.newToken() : randomBytes(32).toString('base64url');
  const at = options.now();
  const expiresAt = at + RESTORE_TTL_MS;
  const confirmFile = restoreConfirmFile(root);
  mkdirSync(path.dirname(confirmFile), { recursive: true });
  const temp = `${confirmFile}.tmp`;
  writeFileSync(
    temp,
    `${JSON.stringify({ v: 1, tokenHash: sha256Text(token).toString('hex'), digest: digestOf(validated.fileSha256, manifest, targetState), expiresAt, previewedAt: at })}\n`,
    { mode: 0o600 },
  );
  renameSync(temp, confirmFile);
  return { confirmToken: token, expiresAt: new Date(expiresAt).toISOString(), summary: summaryOf(manifest, targetState) };
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

/** The configuration a restored Hub starts with: port and names kept, loopback-only, private, no proxy, ACME or backup schedule. */
export function sanitizeRestoredConfig(config: HubConfig): HubConfig {
  const defaults = defaultHubConfig();
  return parseHubConfig({ port: config.port, bind: defaults.bind, exposure: { mode: 'private', names: [...config.exposure.names] } });
}

interface RestoredDatabase { hubInstanceId: string; devices: number }

/** Migrates the backup's database up, clears transient state, marks devices for re-pairing and assigns the new identity. */
function buildRestoredDatabase(tmpDir: string, dbBytes: Uint8Array, manifest: BackupManifest, previewedAt: number, replaced: boolean, ctx: { now: () => number; newId: () => string }): RestoredDatabase {
  const dbFile = path.join(tmpDir, BACKUP_DB_FILE);
  writeFileSync(dbFile, dbBytes, { mode: 0o600 });
  const opened = openHubDb({ dbFile, preMigrationDir: path.join(tmpDir, 'pre-migration'), now: () => new Date(ctx.now()) });
  if (opened.status === 'incompatible') throw new RestoreError('backup-too-new', 'This backup was made by a newer DUDE Hub; update this Hub before restoring it.');
  if (opened.status === 'corrupt') throw new RestoreError('invalid-backup', 'The database in the backup could not be opened.');
  const { db } = opened.hub;
  try {
    const at = new Date(ctx.now()).toISOString();
    const sourceEpoch = manifest.source.authorityEpoch;
    const newEpoch = sourceEpoch + 1;
    const hubInstanceId = ctx.newId();
    const devices = transaction(db, () => clearAndMark(db, at, { sourceEpoch, newEpoch, hubInstanceId, previewedAt, now: ctx.now(), forTransfer: manifest.forTransfer, replaced }));
    const integrity = db.prepare('PRAGMA integrity_check').all() as Array<Record<string, unknown>>;
    if (integrity.length !== 1 || Object.values(integrity[0]!)[0] !== 'ok') throw new RestoreError('integrity-failed', 'The restored database failed its integrity check.');
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    db.exec('PRAGMA journal_mode = DELETE');
    return { hubInstanceId, devices };
  } finally {
    opened.hub.close();
  }
}

function clearAndMark(
  db: Db,
  at: string,
  info: { sourceEpoch: number; newEpoch: number; hubInstanceId: string; previewedAt: number; now: number; forTransfer: boolean; replaced: boolean },
): number {
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
  const detail = { sourceEpoch: info.sourceEpoch, newEpoch: info.newEpoch, devices, forTransfer: info.forTransfer, replaced: info.replaced };
  audit(db, { event: 'backup.restore-previewed', outcome: 'success', actorKind: 'cli', detail, now: info.previewedAt });
  audit(db, { event: 'backup.restored', outcome: 'success', actorKind: 'cli', detail, now: info.now });
  return devices;
}

/**
 * Restores the backup into `dataRoot`. Everything is built in `<dataRoot>/data/.restore-tmp` first; the target is touched only by
 * the final renames, which are rolled back if any of them fails. An existing database, `hub.json` and TLS directory are moved to
 * `<dataRoot>/backups/replaced-<UTC stamp>/`, never deleted.
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

  const validated = await readAndValidate(options.file, options.passphrase, options.deps);
  const manifest = validated.opened.manifest;
  const targetState = targetStateOf(paths.dbFile);
  if (typeof stored.digest !== 'string' || stored.digest !== digestOf(validated.fileSha256, manifest, targetState)) {
    consume();
    throw new RestoreError('conflict', 'The backup file or the target changed since the preview. Run the preview again; nothing was changed.');
  }
  if (targetState === 'existing' && options.replaceExisting !== true) {
    throw new RestoreError('target-not-empty', `The target already holds a Hub database; confirm with the phrase "${RESTORE_PHRASE_REPLACE}". Nothing was changed.`);
  }
  if (!manifest.forTransfer && options.oldHubGoneConfirmed !== true) {
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
      [paths.configFile, BACKUP_CONFIG_FILE],
      [paths.tlsDir, 'tls'],
    ].filter(([from]) => existsSync(from!)) as Array<[string, string]>;
    let replacedDir: string | null = null;
    if (aside.length > 0) {
      const base = path.join(paths.backupsDir, `replaced-${stamp(now())}`);
      replacedDir = base;
      for (let n = 2; existsSync(replacedDir); n += 1) replacedDir = `${base}-${n}`;
    }
    const built = buildRestoredDatabase(tmpDir, validated.dbBytes, manifest, previewedAt, replacedDir !== null, { now, newId });
    const stagedDb = path.join(tmpDir, BACKUP_DB_FILE);
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
    return { hubInstanceId: built.hubInstanceId, authorityEpoch: manifest.source.authorityEpoch + 1, devices: built.devices, replacedDir };
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}
