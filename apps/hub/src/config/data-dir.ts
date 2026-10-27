import { mkdirSync } from 'node:fs';
import path from 'node:path';

export interface DataDirOptions {
  /** Value of `--data-dir`, when given. */
  dataDir?: string;
  env?: Record<string, string | undefined>;
}

export interface HubPaths {
  root: string;
  serviceDir: string;
  dataDir: string;
  dbFile: string;
  preMigrationDir: string;
  /** SaveSphere content store (32-SS1, Milestone 832); created only by `openSaveSphereDb`, never by `ensureLayout`. */
  saveSphereDbPath: string;
  /** Its pre-upgrade copies; a subdirectory so the Hub database's pre-migration pruning never counts them. */
  saveSpherePreMigrationDir: string;
  storageDir: string;
  /** Content-addressed blobs (32-SS1, Milestone 833): `storage/blobs/<aa>/<bb>/<sha256>`; created lazily by the BlobStore, never by `ensureLayout`. */
  blobsDir: string;
  /** Where a blob `put` stages its `.part` file; the same volume as `blobsDir` so the final link is atomic. */
  stagingDir: string;
  /** Per-job scratch directories of the isolated workers (32-SS1, Milestone 834); emptied when the worker pool starts and never backed up. */
  workersDir: string;
  /** Partial resumable uploads (32-SS1, Milestone 845): `storage/uploads/<uploadId>/<index>.part`; created lazily by the upload service, expired by the `uploads.expire` job, never backed up. */
  uploadsDir: string;
  /** Bounded, disposable cache (previews, thumbnails, scratch; 32-SS1, Milestone 835): `storage/cache`, so `purge` already removes it and a backup never holds it; created by provisioning, never by `ensureLayout`. */
  cacheDir: string;
  backupsDir: string;
  configDir: string;
  tlsDir: string;
  /** Machine-bound secrets (`secrets/`); never backed up, never in a diagnostics report. */
  secretsDir: string;
  configFile: string;
  logsDir: string;
  webRoot: string;
}

/** Explicit `--data-dir` wins, then `DUDE_HUB_DATA_DIR`; there is deliberately no default location. */
export function resolveDataDir(options: DataDirOptions = {}): string {
  const env = options.env ?? process.env;
  const chosen = options.dataDir?.trim() || env['DUDE_HUB_DATA_DIR']?.trim();
  if (!chosen) {
    throw new Error('No Hub data directory configured. Pass --data-dir <dir> or set DUDE_HUB_DATA_DIR.');
  }
  return path.resolve(chosen);
}

export function hubPaths(root: string): HubPaths {
  return {
    root,
    serviceDir: path.join(root, 'service'),
    dataDir: path.join(root, 'data'),
    dbFile: path.join(root, 'data', 'dude.db'),
    preMigrationDir: path.join(root, 'data', 'pre-migration'),
    saveSphereDbPath: path.join(root, 'data', 'savesphere.db'),
    saveSpherePreMigrationDir: path.join(root, 'data', 'pre-migration', 'savesphere'),
    storageDir: path.join(root, 'storage'),
    blobsDir: path.join(root, 'storage', 'blobs'),
    stagingDir: path.join(root, 'storage', 'staging'),
    workersDir: path.join(root, 'storage', 'workers'),
    uploadsDir: path.join(root, 'storage', 'uploads'),
    cacheDir: path.join(root, 'storage', 'cache'),
    backupsDir: path.join(root, 'backups'),
    configDir: path.join(root, 'config'),
    tlsDir: path.join(root, 'config', 'tls'),
    secretsDir: path.join(root, 'config', 'secrets'),
    configFile: path.join(root, 'config', 'hub.json'),
    logsDir: path.join(root, 'logs'),
    webRoot: path.join(root, 'service', 'web'),
  };
}

/** Create the data-directory layout (idempotent) and return its typed paths. */
export function ensureLayout(root: string): HubPaths {
  const paths = hubPaths(path.resolve(root));
  for (const dir of [paths.root, paths.serviceDir, paths.dataDir, paths.preMigrationDir, paths.storageDir, paths.backupsDir, paths.configDir, paths.tlsDir, paths.logsDir]) {
    mkdirSync(dir, { recursive: true });
  }
  return paths;
}
