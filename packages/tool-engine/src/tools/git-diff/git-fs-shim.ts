import type { PromiseFsClient } from 'isomorphic-git';
import { ReadOnlyFsError } from "./git-fs-errors.js";

/**
 * Minimal, read-only in-memory `fs` shim for `isomorphic-git`, used by the
 * web build. There is no mainstream, well-maintained `fs` adapter that backs
 * `isomorphic-git` directly onto a live `FileSystemDirectoryHandle` — this
 * sidesteps that by reading every file's bytes up front (via `webkitdirectory`
 * folder upload) into a plain `Map`, which also naturally gets Firefox/Safari
 * support "for free" instead of requiring the Chromium-only File System
 * Access API. The desktop build instead uses `git-native-fs-client.ts`, a
 * lazy IPC-backed client with no upfront buffering.
 *
 * Only `readFile`/`readdir`/`stat`/`lstat` do real work — `isomorphic-git`
 * requires the mutating methods to exist on the `FsClient` type, but a
 * read-only diff/log tool never calls them; each throws instead of
 * silently no-op'ing.
 */

export interface InMemoryFile {
  /** Normalized path starting with `/`, with the uploaded folder's own name stripped (e.g. `/.git/HEAD`, `/src/foo.ts`). */
  readonly path: string;
  readonly data: Uint8Array;
}

function normalize(path: string): string {
  if (path === '') return '/';
  const collapsed = path.replace(/\/+/g, '/');
  return collapsed.length > 1 && collapsed.endsWith('/') ? collapsed.slice(0, -1) : collapsed;
}

function parentOf(path: string): string {
  const lastSlash = path.lastIndexOf('/');
  if (lastSlash <= 0) return '/';
  return path.slice(0, lastSlash);
}

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

function makeStat(isDir: boolean, size: number): FileStat {
  return {
    isFile: () => !isDir,
    isDirectory: () => isDir,
    isSymbolicLink: () => false,
    size,
    mode: isDir ? 0o40000 : 0o100644,
    mtimeMs: 0,
    ctimeMs: 0,
    uid: 0,
    gid: 0,
    dev: 0,
    ino: 0,
  };
}

function notSupported(name: string): () => Promise<never> {
  return async () => {
    throw new Error(`${name}() is not supported — this is a read-only in-memory filesystem.`);
  };
}

export function buildInMemoryFs(files: readonly InMemoryFile[]): PromiseFsClient {
  const filesByPath = new Map<string, Uint8Array>();
  const dirs = new Set<string>(['/']);

  for (const file of files) {
    const path = normalize(file.path);
    filesByPath.set(path, file.data);

    let dir = parentOf(path);
    while (!dirs.has(dir)) {
      dirs.add(dir);
      if (dir === '/') break;
      dir = parentOf(dir);
    }
  }

  function childrenOf(dirPath: string): string[] {
    const prefix = dirPath === '/' ? '/' : `${dirPath}/`;
    const names = new Set<string>();

    for (const path of filesByPath.keys()) {
      if (path === dirPath || !path.startsWith(prefix)) continue;
      names.add(path.slice(prefix.length).split('/')[0]);
    }
    for (const path of dirs) {
      if (path === dirPath || !path.startsWith(prefix)) continue;
      names.add(path.slice(prefix.length).split('/')[0]);
    }

    return [...names];
  }

  async function readFile(path: string, options?: string | { encoding?: string }): Promise<Uint8Array | string> {
    const data = filesByPath.get(normalize(path));
    if (!data) throw new ReadOnlyFsError('ENOENT', `ENOENT: no such file, open '${path}'`);

    const encoding = typeof options === 'string' ? options : options?.encoding;
    return encoding === 'utf8' || encoding === 'utf-8' ? new TextDecoder().decode(data) : data;
  }

  async function readdir(path: string): Promise<string[]> {
    const normalized = normalize(path);
    if (!dirs.has(normalized)) throw new ReadOnlyFsError('ENOENT', `ENOENT: no such directory, scandir '${path}'`);
    return childrenOf(normalized);
  }

  async function stat(path: string): Promise<FileStat> {
    const normalized = normalize(path);
    const fileData = filesByPath.get(normalized);
    if (fileData) return makeStat(false, fileData.length);
    if (dirs.has(normalized)) return makeStat(true, 0);
    throw new ReadOnlyFsError('ENOENT', `ENOENT: no such file or directory, stat '${path}'`);
  }

  return {
    promises: {
      readFile,
      readdir,
      stat,
      lstat: stat,
      writeFile: notSupported('writeFile'),
      unlink: notSupported('unlink'),
      mkdir: notSupported('mkdir'),
      rmdir: notSupported('rmdir'),
      readlink: notSupported('readlink'),
      symlink: notSupported('symlink'),
    },
  };
}
