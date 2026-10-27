import { createHash, randomBytes } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { open, stat } from 'node:fs/promises';
import path from 'node:path';
import { REPO_OBJECT_NAME, backupFileName, createRepository, openBackupFile, openBackupV2, writeBackupExport } from '@dude/hub-backup';
import type { BackupDeps, BackupV2Head, ByteSource, ObjectWriteStream } from '@dude/hub-backup';
import type { Db } from '@dude/sqlite-store';
import type { HubPaths } from '../config/data-dir.js';
import type { BlobStore } from '../blobs/blob-store.js';
import { createLocalBlobStore } from '../blobs/local-blob-store.js';
import { createLocalFolderDestination } from './destinations/local-folder.js';
import { writeSnapshotBackup } from './run-backup-v2.js';

/** A `.dudebackup` file on disk as the library's random-access `ByteSource` (streams; never reads it whole). */
export function fileByteSource(file: string, size: number): ByteSource {
  return {
    size,
    read(start: number, end: number): AsyncIterable<Uint8Array> {
      return (async function* () {
        if (end <= start) return;
        const stream = createReadStream(file, { start, end: end - 1, highWaterMark: 1024 * 1024 });
        try {
          for await (const chunk of stream) yield chunk as Uint8Array;
        } finally {
          stream.destroy();
        }
      })();
    },
  };
}

/** Streams the SHA-256 of a file. */
export async function sha256OfFile(file: string): Promise<string> {
  const hash = createHash('sha256');
  const stream = createReadStream(file, { highWaterMark: 1024 * 1024 });
  for await (const chunk of stream) hash.update(chunk as Uint8Array);
  return hash.digest('hex');
}

export interface CreateExportOptions {
  db: Db;
  paths: HubPaths;
  hubVersion: string;
  hubInstanceId: string;
  forTransfer: boolean;
  targetDir: string;
  /** Never logged, returned or persisted. */
  passphrase: string;
  deps: BackupDeps;
  now: () => number;
  /** Scratch folder for the snapshots and the staging repository (removed after use). */
  workDir: string;
  beforeSnapshot?: () => void;
  saveSphereDb?: Db;
  blobStore?: Pick<BlobStore, 'open'>;
  chunkSize?: number;
  packBytes?: number;
}

export interface CreatedExport {
  file: string;
  size: number;
  sha256: string;
  head: BackupV2Head;
  files: Array<{ name: string; size: number }>;
  blobs: number;
}

/**
 * The single-file backup v2 (`.dudebackup`, Milestone 847): what `backup create` (and `--for-transfer`) writes. It is a complete,
 * self-contained backup (both databases and every referenced blob) in its own repository with a fresh master key under the given
 * passphrase. The engine writes into a staging repository under `workDir`, the export streams it into `<name>.part` in
 * `targetDir`, the part is opened again WITH THE PASSPHRASE and fully verified (every pack and entry, and exactly the packs the
 * manifest references), and only then renamed into place; the staging repository is always removed. Refuses to overwrite.
 */
export async function createBackupExportFile(options: CreateExportOptions): Promise<CreatedExport> {
  const targetDir = path.resolve(options.targetDir);
  mkdirSync(targetDir, { recursive: true });
  const name = backupFileName(new Date(options.now()));
  const finalPath = path.join(targetDir, name);
  const partPath = `${finalPath}.part`;
  if (existsSync(finalPath) || existsSync(partPath)) throw new Error(`The backup file ${name} already exists in ${targetDir}; nothing was overwritten.`);

  const staging = path.join(options.workDir, `export-${randomBytes(8).toString('hex')}`);
  mkdirSync(staging, { recursive: true, mode: 0o700 });
  const repoDir = createLocalFolderDestination({ id: 'export', label: 'export', folder: staging });
  let wrotePart = false;
  try {
    const { repository, object } = await createRepository(options.passphrase, options.deps);
    try {
      const out = await repoDir.sink().create(REPO_OBJECT_NAME);
      await out.write(object);
      await out.commit();
      const written = await writeSnapshotBackup({
        db: options.db, paths: options.paths, hubVersion: options.hubVersion, hubInstanceId: options.hubInstanceId, forTransfer: options.forTransfer,
        repository, sink: repoDir.sink(), deps: options.deps, now: options.now, blobStore: options.blobStore ?? createLocalBlobStore(options.paths), workDir: options.workDir,
        ...(options.saveSphereDb !== undefined ? { saveSphereDb: options.saveSphereDb } : {}),
        ...(options.beforeSnapshot !== undefined ? { beforeSnapshot: options.beforeSnapshot } : {}),
        ...(options.chunkSize !== undefined ? { chunkSize: options.chunkSize } : {}),
        ...(options.packBytes !== undefined ? { packBytes: options.packBytes } : {}),
      });

      const reader = await openBackupV2(repoDir.source(), written.write.backupId, { repository }, options.deps);
      try {
        const handle = await open(partPath, 'wx', 0o600);
        wrotePart = true;
        const stream: ObjectWriteStream = {
          write: async (bytes) => { let at = 0; while (at < bytes.length) at += (await handle.write(bytes, at, bytes.length - at)).bytesWritten; },
          commit: async () => undefined,
          abort: async () => undefined,
        };
        try {
          await writeBackupExport(reader, stream);
          await handle.sync();
        } finally {
          await handle.close();
        }
      } finally {
        reader.close();
      }
    } finally {
      repository.close();
    }

    // Verify the file itself, as a restore will read it: with the passphrase, every pack and entry.
    const size = (await stat(partPath)).size;
    const opened = await openBackupFile(fileByteSource(partPath, size), { passphrase: options.passphrase }, options.deps);
    if (opened.formatVersion !== 2) throw new Error('The backup failed verification: unexpected format.');
    const files: Array<{ name: string; size: number }> = [];
    let blobs = 0;
    try {
      await opened.reader.verify({ scope: 'full' });
      for await (const entry of opened.reader.listEntries()) {
        if (entry.kind === 'file') files.push({ name: entry.name, size: entry.size });
        else blobs += 1;
      }
    } catch (error) {
      throw new Error(`The backup failed verification: ${(error as { code?: string }).code ?? 'unreadable'}.`);
    } finally {
      opened.reader.close();
    }
    const head = opened.reader.head;
    if (existsSync(finalPath)) throw new Error(`The backup file ${name} appeared in ${targetDir} while it was being written; nothing was overwritten.`);
    renameSync(partPath, finalPath);
    wrotePart = false;
    return { file: finalPath, size, sha256: await sha256OfFile(finalPath), head, files, blobs };
  } finally {
    if (wrotePart) rmSync(partPath, { force: true });
    rmSync(staging, { recursive: true, force: true });
  }
}
