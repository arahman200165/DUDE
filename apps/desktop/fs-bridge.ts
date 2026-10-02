import { ipcMain } from 'electron';
import { promises as fs } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { grantPath, isRootGranted as isGranted, normalizeRoot, registerGrantHandlers, resolveInRoot } from './fs-grants';

/**
 * Native file-access IPC for the desktop-only Directory Diff / Git Repo
 * Browser upgrades (Phase 8 Stage 2). A directory only becomes readable
 * after the user explicitly grants it through the native picker — the grant
 * model (session grants plus explicitly remembered folders, Phase 29) lives in
 * `fs-grants.ts`, so a compromised/buggy renderer can't read arbitrary paths
 * without OS-level picker consent.
 */

const MAX_RANGE_BYTES = 1024 * 1024;

/** Explorer's explicit Open with DUDE action grants this folder for this session. */
export function grantExternalDirectory(rootPath: string): void { grantPath(rootPath); }

interface NativeStatPayload {
  readonly isFile: boolean;
  readonly isDirectory: boolean;
  readonly isSymbolicLink: boolean;
  readonly size: number;
  readonly mtimeMs: number;
}

type FsResult<T> = { readonly ok: true } & T;
type FsError = { readonly ok: false; readonly error: { readonly code: string; readonly message: string } };

function toFsError(error: unknown): FsError {
  const code = typeof error === 'object' && error !== null && 'code' in error ? String((error as { code: unknown }).code) : 'UNKNOWN';
  const message = error instanceof Error ? error.message : 'Unknown filesystem error.';
  return { ok: false, error: { code, message } };
}

function resolveGrantedPath(rootPath: string, relativePath: string): string | null {
  if (!isGranted(rootPath)) return null;
  return resolveInRoot(rootPath, relativePath);
}

/** Reused by `file-watch-bridge.ts` (Stage 5) to scope watches to already-granted roots. */
export function isRootGranted(rootPath: string): boolean {
  return isGranted(rootPath);
}

async function walk(rootPath: string): Promise<readonly { readonly path: string; readonly size: number }[]> {
  const entries: { path: string; size: number }[] = [];

  async function walkDir(absoluteDir: string): Promise<void> {
    const children = await fs.readdir(absoluteDir, { withFileTypes: true });
    for (const child of children) {
      const absoluteChild = join(absoluteDir, child.name);
      if (child.isDirectory()) {
        await walkDir(absoluteChild);
      } else if (child.isFile()) {
        const info = await fs.stat(absoluteChild);
        entries.push({ path: relative(rootPath, absoluteChild).split(sep).join('/'), size: info.size });
      }
    }
  }

  await walkDir(rootPath);
  return entries;
}

export function registerFsHandlers(): void {
  registerGrantHandlers();

  ipcMain.handle('dude:fs:walk', async (_event, rootPath: string): Promise<FsResult<{ entries: readonly { path: string; size: number }[] }> | FsError> => {
    if (!isGranted(rootPath)) return { ok: false, error: { code: 'EPERM', message: 'This folder was not granted via the native picker.' } };
    try {
      return { ok: true, entries: await walk(normalizeRoot(rootPath)) };
    } catch (error) {
      return toFsError(error);
    }
  });

  ipcMain.handle(
    'dude:fs:readFile',
    async (_event, rootPath: string, relativePath: string): Promise<FsResult<{ data: ArrayBuffer }> | FsError> => {
      const absolute = resolveGrantedPath(rootPath, relativePath);
      if (!absolute) return { ok: false, error: { code: 'EPERM', message: 'This path is not accessible.' } };
      try {
        const buffer = await fs.readFile(absolute);
        return { ok: true, data: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) };
      } catch (error) {
        return toFsError(error);
      }
    },
  );

  ipcMain.handle(
    'dude:fs:readdir',
    async (_event, rootPath: string, relativePath: string): Promise<FsResult<{ names: readonly string[] }> | FsError> => {
      const absolute = resolveGrantedPath(rootPath, relativePath);
      if (!absolute) return { ok: false, error: { code: 'EPERM', message: 'This path is not accessible.' } };
      try {
        return { ok: true, names: await fs.readdir(absolute) };
      } catch (error) {
        return toFsError(error);
      }
    },
  );

  ipcMain.handle(
    'dude:fs:stat',
    async (
      _event,
      rootPath: string,
      relativePath: string,
      followSymlink: boolean,
    ): Promise<FsResult<{ stat: NativeStatPayload }> | FsError> => {
      const absolute = resolveGrantedPath(rootPath, relativePath);
      if (!absolute) return { ok: false, error: { code: 'EPERM', message: 'This path is not accessible.' } };
      try {
        const info = followSymlink ? await fs.stat(absolute) : await fs.lstat(absolute);
        return {
          ok: true,
          stat: {
            isFile: info.isFile(),
            isDirectory: info.isDirectory(),
            isSymbolicLink: info.isSymbolicLink(),
            size: info.size,
            mtimeMs: info.mtimeMs,
          },
        };
      } catch (error) {
        return toFsError(error);
      }
    },
  );

  /** Ranged read for the Large-File Streaming Inspector (Phase 29): never loads the whole file. */
  ipcMain.handle(
    'dude:fs:readRange',
    async (_event, rootPath: string, relativePath: string, offset: unknown, length: unknown): Promise<FsResult<{ data: ArrayBuffer; size: number }> | FsError> => {
      const absolute = resolveGrantedPath(rootPath, relativePath);
      if (!absolute) return { ok: false, error: { code: 'EPERM', message: 'This path is not accessible.' } };
      if (typeof offset !== 'number' || typeof length !== 'number' || !Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(length) || length < 0) {
        return { ok: false, error: { code: 'EINVAL', message: 'Invalid range.' } };
      }
      const handle = await fs.open(absolute, 'r').catch((error: unknown) => error);
      if (!handle || typeof (handle as { read?: unknown }).read !== 'function') return toFsError(handle);
      const file = handle as import('node:fs/promises').FileHandle;
      try {
        const size = (await file.stat()).size;
        const buffer = Buffer.alloc(Math.max(0, Math.min(length, MAX_RANGE_BYTES, size - offset)));
        const { bytesRead } = buffer.length ? await file.read(buffer, 0, buffer.length, offset) : { bytesRead: 0 };
        return { ok: true, size, data: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + bytesRead) };
      } catch (error) {
        return toFsError(error);
      } finally {
        await file.close();
      }
    },
  );
}
