import { createHash } from 'node:crypto';
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, writeSync } from 'node:fs';
import path from 'node:path';
import { backupFileName, openBackup, sealBackup } from '@dude/hub-backup';
import type { BackupCredential, BackupDeps, BackupManifest } from '@dude/hub-backup';
import type { Db } from '@dude/sqlite-store';
import type { HubPaths } from '../config/data-dir.js';
import { createScrubbedDbSnapshot } from './snapshot.js';

/** Consequence classes of creating a backup (PD-074): it writes a file and handles a secret (the passphrase and the data). */
export const BACKUP_CONSEQUENCE_CLASS = ['filesystem-write', 'secret-management'] as const;

export const BACKUP_DB_FILE = 'dude.db';
export const BACKUP_CONFIG_FILE = 'hub.json';

export interface CreateBackupOptions {
  db: Db;
  paths: HubPaths;
  hubVersion: string;
  hubInstanceId: string;
  authorityEpoch: number;
  forTransfer: boolean;
  targetDir: string;
  /** Never logged, returned or persisted by this function. */
  credential: BackupCredential;
  deps: BackupDeps;
  /** Scratch folder for the snapshot copies (removed after use). */
  workDir: string;
}

export interface CreatedBackup {
  file: string;
  size: number;
  /** SHA-256 (hex) of the written backup file. */
  sha256: string;
  manifest: BackupManifest;
}

const sha256Hex = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

function writeFileDurably(file: string, bytes: Uint8Array): void {
  const fd = openSync(file, 'wx', 0o600);
  try {
    let offset = 0;
    while (offset < bytes.length) offset += writeSync(fd, bytes, offset, bytes.length - offset);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

/**
 * Seals the scrubbed database and `hub.json` into one `.dudebackup` file in `targetDir`, writing `<name>.part` first, then
 * verifying it (decrypt with the same credential and compare file hashes) before renaming it into place. Refuses to overwrite.
 * On any failure nothing is left behind.
 */
export async function createBackupFile(options: CreateBackupOptions): Promise<CreatedBackup> {
  const targetDir = path.resolve(options.targetDir);
  mkdirSync(targetDir, { recursive: true });
  const name = backupFileName(options.deps.now());
  const finalPath = path.join(targetDir, name);
  const partPath = `${finalPath}.part`;
  if (existsSync(finalPath) || existsSync(partPath)) {
    throw new Error(`The backup file ${name} already exists in ${targetDir}; nothing was overwritten.`);
  }

  const snapshot = await createScrubbedDbSnapshot(options.db, options.workDir);
  const configBytes = existsSync(options.paths.configFile) ? new Uint8Array(readFileSync(options.paths.configFile)) : new TextEncoder().encode('{}');
  const expected = new Map<string, string>([
    [BACKUP_DB_FILE, sha256Hex(snapshot.bytes)],
    [BACKUP_CONFIG_FILE, sha256Hex(configBytes)],
  ]);

  const sealed = await sealBackup(
    {
      files: [
        { name: BACKUP_DB_FILE, bytes: snapshot.bytes },
        { name: BACKUP_CONFIG_FILE, bytes: configBytes },
      ],
      hubVersion: options.hubVersion,
      source: {
        hubInstanceId: options.hubInstanceId,
        authorityEpoch: options.authorityEpoch,
        schemaVersion: snapshot.schemaVersion,
        dbMinReaderVersion: snapshot.dbMinReaderVersion,
      },
      forTransfer: options.forTransfer,
      counts: snapshot.counts,
    },
    options.credential,
    options.deps,
  );

  try {
    writeFileDurably(partPath, sealed);
    const reread = new Uint8Array(readFileSync(partPath));
    if (reread.length !== sealed.length) throw new Error('The backup file could not be read back completely.');
    const opened = await openBackup(reread, options.credential, options.deps);
    for (const [fileName, hash] of expected) {
      const content = opened.files.get(fileName);
      if (content === undefined || sha256Hex(content) !== hash) throw new Error(`The backup failed verification: ${fileName} does not match what was sealed.`);
    }
    if (opened.files.size !== expected.size) throw new Error('The backup failed verification: unexpected files.');
    if (existsSync(finalPath)) throw new Error(`The backup file ${name} appeared in ${targetDir} while it was being written; nothing was overwritten.`);
    renameSync(partPath, finalPath);
    return { file: finalPath, size: sealed.length, sha256: sha256Hex(reread), manifest: opened.manifest };
  } catch (error) {
    rmSync(partPath, { force: true });
    throw error;
  }
}
