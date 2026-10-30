import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { STANDBY_MANIFEST_NAME_PATTERN, STANDBY_PACK_NAME_PATTERN, STANDBY_REPO_OBJECT } from '@dude/contracts/hub';

/**
 * The on-disk side of the warm standby (Milestone 849, PD-151). The standby folder the user chose holds one backup v2 repository per Hub
 * destination, laid out exactly like the Hub's `local-folder` destination so it can be restored with `dude-hub backup restore --folder`:
 *
 *   <folder>\<destinationId>\repo
 *   <folder>\<destinationId>\packs\<32 hex>
 *   <folder>\<destinationId>\manifests\<YYYYMMDDTHHMMSSZ>-<32 hex>
 *   <folder>\.standby-partial\<destinationId>\<packs|manifests|repo>-<rest>.part   (downloads in progress; outside the repository)
 *
 * Every name and id that came from the Hub is checked against the closed grammar BEFORE it becomes a path, and every path is re-checked to be
 * strictly inside its directory, so a hostile listing can never make the puller write or delete anything else.
 */

/** The Hub's destination id grammar (`StandbyDestinationParams`). */
export const STANDBY_DESTINATION_ID = /^[a-z0-9][a-z0-9-]{0,31}$/;
const PACK_NAME = new RegExp(STANDBY_PACK_NAME_PATTERN);
const MANIFEST_NAME = new RegExp(STANDBY_MANIFEST_NAME_PATTERN);
export const STANDBY_PARTIAL_DIR = '.standby-partial';
const PART_SUFFIX = '.part';

export type StandbyObjectKind = 'repo' | 'pack' | 'manifest';

/** A failure of the puller with a short, path-free code and message (mapped to the RPC error or the status `lastError`). */
export class StandbyError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'StandbyError';
  }
}

export const hostile = (what: string): StandbyError => new StandbyError('hostile-listing', `The Hub listed ${what} that is not a backup repository name; nothing was written or deleted for it.`);

export function objectKind(name: unknown): StandbyObjectKind | null {
  if (name === STANDBY_REPO_OBJECT) return 'repo';
  if (typeof name !== 'string') return null;
  if (PACK_NAME.test(name)) return 'pack';
  if (MANIFEST_NAME.test(name)) return 'manifest';
  return null;
}

/** `<parent>/<parts...>` when it resolves strictly inside `parent`; throws `hostile-listing` otherwise. */
export function inside(parent: string, ...parts: string[]): string {
  const base = path.resolve(parent);
  const target = path.resolve(base, ...parts);
  const rel = path.relative(base, target);
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) throw hostile('a path');
  return target;
}

export interface MirrorPaths { readonly root: string; readonly repoDir: string; readonly partialDir: string }

export function mirrorPaths(root: string, destinationId: string): MirrorPaths {
  if (!STANDBY_DESTINATION_ID.test(destinationId)) throw hostile('a repository id');
  return { root, repoDir: inside(root, destinationId), partialDir: inside(root, STANDBY_PARTIAL_DIR, destinationId) };
}

/** The final location of a repository object. */
export function objectPath(paths: MirrorPaths, name: string): string {
  if (objectKind(name) === null) throw hostile('an object');
  return inside(paths.repoDir, ...name.split('/'));
}

/** The download-in-progress file of a repository object (one flat directory per repository, outside the repository itself). */
export function partialPath(paths: MirrorPaths, name: string): string {
  if (objectKind(name) === null) throw hostile('an object');
  return inside(paths.partialDir, `${name.replace('/', '-')}${PART_SUFFIX}`);
}

/** The size of a regular file, or null when there is none (a directory or a missing file count as none). */
export async function fileSize(file: string): Promise<number | null> {
  try {
    const info = await stat(file);
    return info.isFile() ? info.size : null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT' || (error as NodeJS.ErrnoException).code === 'ENOTDIR') return null;
    throw error;
  }
}

/** The local packs or manifests of one mirror (only regular files whose names match the grammar), name to size. */
export async function listLocal(paths: MirrorPaths, sub: 'packs' | 'manifests'): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  let entries;
  try {
    entries = await readdir(inside(paths.repoDir, sub), { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT' || (error as NodeJS.ErrnoException).code === 'ENOTDIR') return out;
    throw error;
  }
  for (const entry of entries) {
    const name = `${sub}/${entry.name}`;
    if (!entry.isFile() || objectKind(name) === null) continue;
    const size = await fileSize(inside(paths.repoDir, sub, entry.name));
    if (size !== null) out.set(name, size);
  }
  return out;
}

/** The object names that have a partial download in this mirror's partial directory. Other files are ignored. */
export async function listPartials(paths: MirrorPaths): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(paths.partialDir, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT' || (error as NodeJS.ErrnoException).code === 'ENOTDIR') return [];
    throw error;
  }
  const names: string[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(PART_SUFFIX)) continue;
    const stem = entry.name.slice(0, -PART_SUFFIX.length);
    const name = stem === STANDBY_REPO_OBJECT ? stem : stem.replace(/^(packs|manifests)-/, '$1/');
    if (objectKind(name) !== null) names.push(name);
  }
  return names;
}
