import { randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { link, mkdir, open, readdir, rename, stat, statfs, unlink } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import path from 'node:path';
import { BackupError, REPO_OBJECT_NAME } from '@dude/hub-backup';
import type { ObjectSink, ObjectSource, ObjectWriteStream } from '@dude/hub-backup';
import type { HubPaths } from '../../config/data-dir.js';
import { BACKUP_OBJECT_NAME_PATTERN, DestinationError, assertObjectName } from './destination.js';
import type { BackupDestination, BackupObjectPrefix, DestinationObjectInfo, DestinationProbe } from './destination.js';

const PART_SUFFIX = '.part';
const READ_PIECE = 1024 * 1024;

const isCode = (error: unknown, ...codes: string[]): boolean => codes.includes((error as NodeJS.ErrnoException | undefined)?.code ?? '');
const comparable = (value: string, platform: NodeJS.Platform): string => (platform === 'win32' ? path.resolve(value).toLowerCase() : path.resolve(value));

/** True when `child` is `parent` or inside it (case-insensitive on Windows). */
export function isInsideFolder(child: string, parent: string, platform: NodeJS.Platform = process.platform): boolean {
  const rel = path.relative(comparable(parent, platform), comparable(child, platform));
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel));
}

/**
 * The 31G target rule, extended for v2: a backup folder must be absolute and must not be inside the live data, configuration,
 * certificate, secret or storage directories (a backup inside what it protects is lost with it, and a folder under `storage/`
 * would be swept by the Hub's own cleanup). Returns the resolved folder.
 */
export function assertSafeLocalFolder(folder: unknown, paths: Pick<HubPaths, 'dataDir' | 'configDir' | 'tlsDir' | 'secretsDir' | 'storageDir'>, platform: NodeJS.Platform = process.platform): string {
  if (typeof folder !== 'string' || folder.length === 0 || !path.isAbsolute(folder)) throw new DestinationError('unsafe-location', 'The backup folder must be an absolute path.');
  const resolved = path.resolve(folder);
  for (const forbidden of [paths.dataDir, paths.configDir, paths.tlsDir, paths.secretsDir, paths.storageDir]) {
    if (isInsideFolder(resolved, forbidden, platform)) throw new DestinationError('unsafe-location', 'The backup folder cannot be inside the Hub\'s data, configuration, certificate or storage directories.');
  }
  return resolved;
}

/** Best effort: make a link durable. Opening a directory is not possible on Windows, where this is skipped. */
async function syncDirectory(dir: string): Promise<void> {
  try {
    const handle = await open(dir, 'r');
    try { await handle.sync(); } finally { await handle.close(); }
  } catch { /* unsupported on this platform or filesystem */ }
}

async function exists(file: string): Promise<boolean> {
  try {
    await stat(file);
    return true;
  } catch (error) {
    if (isCode(error, 'ENOENT', 'ENOTDIR')) return false;
    throw error;
  }
}

async function writeAll(handle: FileHandle, bytes: Uint8Array): Promise<void> {
  let written = 0;
  while (written < bytes.length) written += (await handle.write(bytes, written, bytes.length - written)).bytesWritten;
}

export interface LocalFolderDestinationOptions {
  id: string;
  label: string;
  /** The repository root: `repo`, `packs/` and `manifests/` live directly in it. */
  folder: string;
  /** Test seams (crash injection, verify-on-write failure injection). */
  hooks?: { afterCommit?(name: string, file: string): void | Promise<void> };
  /** Free-space probe (default `fs.statfs`); null when the volume cannot tell. */
  freeBytes?: (folder: string) => Promise<number | null>;
}

/**
 * The `local-folder` destination: a folder on a local, removable or network volume. Objects are files under the folder (`repo`,
 * `packs/<id>`, `manifests/<id>`). A write goes to `<name>.part` (opened exclusively), is fsynced and is then hard-linked to its
 * final name (`EEXIST` refuses, so nothing is ever overwritten) or, on a filesystem without hard links, renamed after an
 * existence check; only then does the object exist. Readers stream with `createReadStream`, never a whole file.
 */
export function createLocalFolderDestination(options: LocalFolderDestinationOptions): BackupDestination {
  const root = path.resolve(options.folder);
  const inFlight = new Set<string>();
  const fileOf = (name: string): string => {
    assertObjectName(name);
    return path.join(root, ...name.split('/'));
  };
  const freeBytes = options.freeBytes ?? (async (folder: string): Promise<number | null> => {
    try {
      const info = await statfs(folder);
      return Number(info.bavail) * Number(info.bsize);
    } catch {
      return null;
    }
  });

  const sink: ObjectSink = {
    async create(name: string): Promise<ObjectWriteStream> {
      const final = fileOf(name);
      const part = `${final}${PART_SUFFIX}`;
      if (inFlight.has(name) || (await exists(final))) throw new DestinationError('exists', 'A backup object with that name already exists.');
      await mkdir(path.dirname(final), { recursive: true });
      let handle: FileHandle;
      try {
        handle = await open(part, 'wx', 0o600);
      } catch (error) {
        if (isCode(error, 'EEXIST')) throw new DestinationError('exists', 'A backup object with that name is already being written.');
        throw error;
      }
      inFlight.add(name);
      let state: 'open' | 'done' = 'open';
      const finish = (): void => {
        state = 'done';
        inFlight.delete(name);
      };
      return {
        async write(bytes: Uint8Array): Promise<void> {
          if (state !== 'open') throw new BackupError('bad-input', 'The backup object is closed.');
          await writeAll(handle, bytes);
        },
        async commit(): Promise<void> {
          if (state !== 'open') throw new BackupError('bad-input', 'The backup object is closed.');
          try {
            await handle.sync();
            await handle.close();
            try {
              await link(part, final);
            } catch (error) {
              if (isCode(error, 'EEXIST')) throw new DestinationError('exists', 'A backup object with that name already exists.');
              if (!isCode(error, 'EPERM', 'ENOTSUP', 'EXDEV', 'EMLINK', 'ENOSYS', 'EACCES')) throw error;
              // A filesystem without hard links (some network and FAT volumes): check, then rename (this process is the only writer).
              if (await exists(final)) throw new DestinationError('exists', 'A backup object with that name already exists.');
              await rename(part, final);
            }
            await unlink(part).catch((error: unknown) => { if (!isCode(error, 'ENOENT')) throw error; });
            await syncDirectory(path.dirname(final));
          } catch (error) {
            await handle.close().catch(() => undefined);
            await unlink(part).catch(() => undefined);
            finish();
            throw error;
          }
          finish();
          await options.hooks?.afterCommit?.(name, final);
        },
        async abort(): Promise<void> {
          if (state !== 'open') return;
          finish();
          await handle.close().catch(() => undefined);
          await unlink(part).catch(() => undefined);
        },
      };
    },
  };

  const source: ObjectSource = {
    read(name: string, start = 0): AsyncIterable<Uint8Array> {
      const file = fileOf(name);
      return (async function* () {
        if (!(await exists(file))) throw new BackupError('integrity', 'A backup object is missing.');
        const stream = createReadStream(file, { start, highWaterMark: READ_PIECE });
        try {
          for await (const chunk of stream) yield chunk as Uint8Array;
        } catch (error) {
          if (isCode(error, 'ENOENT')) throw new BackupError('integrity', 'A backup object is missing.');
          throw error;
        } finally {
          stream.destroy();
        }
      })();
    },
  };

  async function list(prefix: BackupObjectPrefix): Promise<DestinationObjectInfo[]> {
    const dir = path.join(root, prefix.slice(0, -1));
    let names: string[];
    try {
      names = await readdir(dir);
    } catch (error) {
      if (isCode(error, 'ENOENT', 'ENOTDIR')) return [];
      throw error;
    }
    const out: DestinationObjectInfo[] = [];
    for (const entry of names.sort()) {
      const name = `${prefix}${entry}`;
      if (!BACKUP_OBJECT_NAME_PATTERN.test(name)) continue;
      try {
        const info = await stat(path.join(dir, entry));
        if (info.isFile()) out.push({ name, size: info.size });
      } catch (error) {
        if (!isCode(error, 'ENOENT')) throw error;
      }
    }
    return out;
  }

  return {
    id: options.id,
    kind: 'local-folder',
    label: options.label,
    sink: () => sink,
    source: () => source,
    list,
    async stat(name) {
      try {
        const info = await stat(fileOf(name));
        return info.isFile() ? { name, size: info.size } : null;
      } catch (error) {
        if (isCode(error, 'ENOENT', 'ENOTDIR')) return null;
        throw error;
      }
    },
    async deleteObject(name) {
      try { await unlink(fileOf(name)); } catch (error) { if (!isCode(error, 'ENOENT')) throw error; }
    },
    async replaceRepo(bytes) {
      const final = fileOf(REPO_OBJECT_NAME);
      const temp = `${final}.${randomBytes(8).toString('hex')}.tmp`;
      const handle = await open(temp, 'wx', 0o600);
      try {
        await writeAll(handle, bytes);
        await handle.sync();
      } catch (error) {
        await handle.close().catch(() => undefined);
        await unlink(temp).catch(() => undefined);
        throw error;
      }
      await handle.close();
      try {
        await rename(temp, final); // atomic replace (MoveFileEx REPLACE_EXISTING on Windows)
      } catch (error) {
        await unlink(temp).catch(() => undefined);
        throw error;
      }
      await syncDirectory(root);
    },
    async probe(): Promise<DestinationProbe> {
      try {
        await mkdir(root, { recursive: true });
        const probe = path.join(root, `.probe-${randomBytes(8).toString('hex')}`);
        const handle = await open(probe, 'wx', 0o600);
        try { await writeAll(handle, new Uint8Array([1])); } finally { await handle.close(); }
        await unlink(probe);
        return { ok: true, freeBytes: await freeBytes(root) };
      } catch (error) {
        const code = (error as NodeJS.ErrnoException | undefined)?.code;
        return { ok: false, reason: typeof code === 'string' && /^[A-Z][A-Z0-9_]{1,30}$/.test(code) ? code : 'unavailable' };
      }
    },
    async sweepIncomplete(maxAgeMs, now) {
      let removed = 0;
      for (const sub of ['packs', 'manifests']) {
        const dir = path.join(root, sub);
        let names: string[];
        try { names = await readdir(dir); } catch { continue; }
        for (const entry of names) {
          if (!entry.endsWith(PART_SUFFIX)) continue;
          const name = `${sub}/${entry.slice(0, -PART_SUFFIX.length)}`;
          if (!BACKUP_OBJECT_NAME_PATTERN.test(name) || inFlight.has(name)) continue;
          try {
            const info = await stat(path.join(dir, entry));
            if (now - info.mtimeMs < maxAgeMs) continue;
            await unlink(path.join(dir, entry));
            removed += 1;
          } catch { /* gone or locked: the next sweep retries */ }
        }
      }
      return removed;
    },
  };
}
