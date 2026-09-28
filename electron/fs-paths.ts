import { posix, win32 } from 'node:path';

/**
 * Electron-free path helpers shared by the main process (`fs-grants.ts`) and the fs utility process
 * (Phase 29). Kept separate so the worker bundle never imports main-process-only Electron APIs.
 */

function pathStyle(root: string): typeof posix {
  return /^[A-Za-z]:[\\/]/.test(root) || root.startsWith('\\') ? win32 : posix;
}

/** Canonical key for a root: normalized, no trailing separator except on a drive root (`C:\`). */
export function normalizeRoot(path: string): string {
  const { normalize, sep } = pathStyle(path);
  let value = normalize(path);
  while (value.length > 1 && value.endsWith(sep) && !/^[A-Za-z]:\\$/.test(value) && value !== sep) value = value.slice(0, -1);
  return value;
}

/** Resolves a root-relative path, refusing anything that escapes the root (`..`, absolute input). */
export function resolveInRoot(root: string, relativePath: string): string | null {
  const { join, normalize, sep } = pathStyle(root);
  const base = normalizeRoot(root);
  if (typeof relativePath !== 'string' || posix.isAbsolute(relativePath) || win32.isAbsolute(relativePath) || /^[A-Za-z]:/.test(relativePath)) return null;
  const resolved = normalize(join(base, relativePath));
  const prefix = base.endsWith(sep) ? base : base + sep;
  if (resolved !== base && !resolved.toLowerCase().startsWith(prefix.toLowerCase())) return null;
  return resolved;
}

export function toPosixRelative(root: string, absolute: string): string {
  const { sep } = pathStyle(root);
  const base = normalizeRoot(root);
  const prefix = base.endsWith(sep) ? base : base + sep;
  return absolute.length > prefix.length ? absolute.slice(prefix.length).split(sep).join('/') : '';
}
