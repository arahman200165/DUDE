import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { isSea } from 'node:sea';
import path from 'node:path';
import { lockExtensionLoading, openSqliteDatabase } from '@dude/sqlite-store';

// The vector slot of the 32-SS1 store (PD-147): a pinned sqlite-vec loadable library, hash-verified before it is ever
// handed to `loadExtension`. Windows x64 only (scripts/fetch-sqlite-vec.mjs fetches it; the Alpine Docker image has no
// build and reports "vector unavailable"). A missing, mismatching or unloadable library is an `unavailable` state with a
// reason, never an error. sqlite-vec.spec.ts keeps these constants equal to the fetch script's pins.

export const SQLITE_VEC_VERSION = '0.1.9';
export const SQLITE_VEC_DLL_SHA256 = 'fcf98662a7ad9dce394b96a88f91032047823831b951c76636787c312a6476e6';

export type SqliteVecState = { available: true; version: string; path: string } | { available: false; reason: string };

/**
 * Where the library is looked for: beside the executable in the single-executable Hub, and in the repository's
 * build/vendor/sqlite-vec directory (two levels above dist/hub) when running as a Node process from a build.
 */
export function sqliteVecCandidatePath(): string {
  if (isSea()) return path.join(path.dirname(process.execPath), 'vec0.dll');
  const scriptDir = path.dirname(process.argv[1] ?? '.');
  return path.resolve(scriptDir, '..', '..', 'build', 'vendor', 'sqlite-vec', 'vec0.dll');
}

/** Verifies `libraryPath` against the pin and loads it into a throwaway in-memory database, then locks loading again. */
export function probeSqliteVec(libraryPath: string = sqliteVecCandidatePath()): SqliteVecState {
  if (process.platform !== 'win32' || process.arch !== 'x64') {
    return { available: false, reason: `no pinned sqlite-vec library for ${process.platform}-${process.arch}` };
  }
  if (!existsSync(libraryPath)) return { available: false, reason: `vec0.dll not found at ${libraryPath}` };
  const actual = createHash('sha256').update(readFileSync(libraryPath)).digest('hex');
  if (actual !== SQLITE_VEC_DLL_SHA256) return { available: false, reason: `vec0.dll hash mismatch (${actual}); it was not loaded` };
  const db = openSqliteDatabase(':memory:', { allowExtension: true });
  try {
    db.loadExtension(libraryPath);
    lockExtensionLoading(db);
    const row = db.prepare('SELECT vec_version() AS v').get() as { v: string } | undefined;
    if (!row?.v) return { available: false, reason: 'vec_version() returned nothing' };
    return { available: true, version: row.v, path: libraryPath };
  } catch (error) {
    return { available: false, reason: `loadExtension failed: ${error instanceof Error ? error.message : String(error)}` };
  } finally {
    db.close();
  }
}
