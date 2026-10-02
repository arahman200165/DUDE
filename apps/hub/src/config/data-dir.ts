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
  storageDir: string;
  backupsDir: string;
  configDir: string;
  tlsDir: string;
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
    storageDir: path.join(root, 'storage'),
    backupsDir: path.join(root, 'backups'),
    configDir: path.join(root, 'config'),
    tlsDir: path.join(root, 'config', 'tls'),
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
