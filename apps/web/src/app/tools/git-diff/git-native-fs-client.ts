import type { PromiseFsClient } from 'isomorphic-git';
import { NativeFsService } from '../../core/platform/native-fs.service';
import { ReadOnlyFsError } from "@dude/tool-engine/tools/git-diff/git-fs-errors";

/**
 * Lazy, IPC-backed, read-only `fs` client for `isomorphic-git`, used by the
 * desktop build. Unlike `git-fs-shim.ts`'s eager in-memory web shim, this
 * client buffers nothing up front — every `readFile`/`readdir`/`stat`/`lstat`
 * call round-trips to the main process against the live directory on disk,
 * so browsing/diffing always reflects the repository's current state
 * (chosen deliberately over eager buffering for scalability on large
 * repos/deep histories; if per-call IPC latency proves too slow in practice
 * on very large repos, a renderer-side LRU cache keyed by
 * `(rootPath, path)` would be a fast-follow, not solved preemptively here).
 *
 * Same read-only contract as `git-fs-shim.ts`: only
 * `readFile`/`readdir`/`stat`/`lstat` do real work, every mutating method
 * throws (this tool never writes to a repo).
 */

interface FileStat {
  isFile(): boolean;
  isDirectory(): boolean;
  isSymbolicLink(): boolean;
  size: number;
  mode: number;
  mtimeMs: number;
  ctimeMs: number;
  uid: number;
  gid: number;
  dev: number;
  ino: number;
}

function toFileStat(stat: { readonly isFile: boolean; readonly isDirectory: boolean; readonly isSymbolicLink: boolean; readonly size: number; readonly mtimeMs: number }): FileStat {
  return {
    isFile: () => stat.isFile,
    isDirectory: () => stat.isDirectory,
    isSymbolicLink: () => stat.isSymbolicLink,
    size: stat.size,
    mode: stat.isDirectory ? 0o40000 : 0o100644,
    mtimeMs: stat.mtimeMs,
    ctimeMs: stat.mtimeMs,
    uid: 0,
    gid: 0,
    dev: 0,
    ino: 0,
  };
}

function toReadOnlyFsError(error: unknown, fallbackMessage: string): ReadOnlyFsError {
  const code = error instanceof Error && 'code' in error ? String((error as Error & { code?: unknown }).code) : 'UNKNOWN';
  const message = error instanceof Error ? error.message : fallbackMessage;
  return new ReadOnlyFsError(code, message);
}

function toRelativePath(path: string): string {
  return path.startsWith('/') ? path.slice(1) : path;
}

function notSupported(name: string): () => Promise<never> {
  return async () => {
    throw new Error(`${name}() is not supported — this is a read-only view of the repository.`);
  };
}

export function buildNativeFsClient(nativeFs: NativeFsService, rootPath: string): PromiseFsClient {
  async function readFile(path: string, options?: string | { encoding?: string }): Promise<Uint8Array | string> {
    let data: ArrayBuffer;
    try {
      data = await nativeFs.readFile(rootPath, toRelativePath(path));
    } catch (error) {
      throw toReadOnlyFsError(error, `no such file, open '${path}'`);
    }
    const bytes = new Uint8Array(data);

    const encoding = typeof options === 'string' ? options : options?.encoding;
    return encoding === 'utf8' || encoding === 'utf-8' ? new TextDecoder().decode(bytes) : bytes;
  }

  async function readdir(path: string): Promise<string[]> {
    try {
      return [...(await nativeFs.readdir(rootPath, toRelativePath(path)))];
    } catch (error) {
      throw toReadOnlyFsError(error, `no such directory, scandir '${path}'`);
    }
  }

  async function stat(path: string): Promise<FileStat> {
    try {
      return toFileStat(await nativeFs.stat(rootPath, toRelativePath(path), true));
    } catch (error) {
      throw toReadOnlyFsError(error, `no such file or directory, stat '${path}'`);
    }
  }

  async function lstat(path: string): Promise<FileStat> {
    try {
      return toFileStat(await nativeFs.stat(rootPath, toRelativePath(path), false));
    } catch (error) {
      throw toReadOnlyFsError(error, `no such file or directory, lstat '${path}'`);
    }
  }

  return {
    promises: {
      readFile,
      readdir,
      stat,
      lstat,
      writeFile: notSupported('writeFile'),
      unlink: notSupported('unlink'),
      mkdir: notSupported('mkdir'),
      rmdir: notSupported('rmdir'),
      readlink: notSupported('readlink'),
      symlink: notSupported('symlink'),
    },
  };
}
