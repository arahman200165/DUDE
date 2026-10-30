import { getMeta } from '@dude/sqlite-store';
import type { Db } from '@dude/sqlite-store';
import { STANDBY_LIST_LIMIT_DEFAULT, STANDBY_LIST_LIMIT_MAX } from '@dude/contracts/hub';
import type { StandbyObjectInfo, StandbyObjectPrefix } from '@dude/contracts/hub';
import type { HubPaths } from '../config/data-dir.js';
import type { HubBackupConfig, HubBackupLocalFolderDestination } from '../config/hub-config.js';
import { BACKUP_OBJECT_NAME_PATTERN, MANIFEST_PREFIX, PACK_PREFIX } from '../backup/destinations/destination.js';
import type { BackupDestination } from '../backup/destinations/destination.js';
import { assertSafeLocalFolder, createLocalFolderDestination } from '../backup/destinations/local-folder.js';

/**
 * Read-only access to the Hub's backup v2 repositories for the warm-standby pull (32-SS1, Milestone 849, PD-151). Only `local-folder`
 * destinations are served (an S3 bucket is already off this machine). Everything here READS the stored objects as they are: ciphertext
 * written by `backup/run-backup-v2.ts`. It never opens a repository, never touches the master key or a passphrase, never writes, and never
 * imports the backup engine; the destination location rule (`assertSafeLocalFolder`) is applied again on every open.
 *
 * Objects a backup run committed but has not recorded yet (its journal, `dude.db` meta `backup_dest_journal:<id>`, Milestone 847) are hidden:
 * an unverified manifest never counts and a failed run deletes its packs again, so a standby must not mirror them.
 */
export const STANDBY_JOURNAL_PREFIX = 'backup_dest_journal:';

export type StandbyRepositoryPaths = Pick<HubPaths, 'dataDir' | 'configDir' | 'tlsDir' | 'secretsDir' | 'storageDir'>;
export type OpenStandbyDestination = (definition: HubBackupLocalFolderDestination) => BackupDestination;

/** The servable destinations of the current `hub.json` backup block (local folders only), in configuration order. */
export function standbyDefinitions(backup: HubBackupConfig | undefined): HubBackupLocalFolderDestination[] {
  return (backup?.destinations ?? []).filter((d): d is HubBackupLocalFolderDestination => d.kind === 'local-folder');
}

export function defaultOpenStandbyDestination(paths: StandbyRepositoryPaths, platform: NodeJS.Platform = process.platform): OpenStandbyDestination {
  return (definition) => createLocalFolderDestination({ id: definition.id, label: definition.label, folder: assertSafeLocalFolder(definition.folder, paths, platform) });
}

/** Object names of the destination's unrecorded run (empty when none). Read per request. */
export function hiddenStandbyObjects(db: Db, destinationId: string): ReadonlySet<string> {
  const raw = getMeta(db, `${STANDBY_JOURNAL_PREFIX}${destinationId}`);
  if (raw === undefined) return new Set();
  try {
    const parsed = JSON.parse(raw) as { objects?: unknown };
    return new Set(Array.isArray(parsed.objects) ? parsed.objects.filter((o): o is string => typeof o === 'string') : []);
  } catch {
    // An unreadable journal: hide nothing rather than everything; the next run sweeps it.
    return new Set();
  }
}

/** Every committed, visible object of the destination, ascending by name. */
export async function allStandbyObjects(db: Db, destination: BackupDestination): Promise<StandbyObjectInfo[]> {
  const hidden = hiddenStandbyObjects(db, destination.id);
  const repo = await destination.stat('repo');
  const all = [...(await destination.list(MANIFEST_PREFIX)), ...(await destination.list(PACK_PREFIX)), ...(repo === null ? [] : [repo])];
  return all
    .filter((o) => BACKUP_OBJECT_NAME_PATTERN.test(o.name) && !hidden.has(o.name))
    .map((o) => ({ name: o.name, size: o.size }))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

/** One page of the listing: `prefix` filters, `after` is exclusive, `limit` defaults to 1000 (at most 5000). */
export async function listStandbyObjects(
  db: Db, destination: BackupDestination, query: { prefix?: StandbyObjectPrefix; after?: string; limit?: number },
): Promise<{ objects: StandbyObjectInfo[]; next: string | null }> {
  const limit = Math.min(STANDBY_LIST_LIMIT_MAX, Math.max(1, query.limit ?? STANDBY_LIST_LIMIT_DEFAULT));
  const matching = (await allStandbyObjects(db, destination))
    .filter((o) => query.prefix === undefined || (query.prefix === 'repo' ? o.name === 'repo' : o.name.startsWith(query.prefix)))
    .filter((o) => query.after === undefined || o.name > query.after);
  const objects = matching.slice(0, limit);
  return { objects, next: matching.length > limit ? objects[objects.length - 1]!.name : null };
}

/** The size of one visible committed object, or null (unknown name, hidden by the journal, or missing). */
export async function statStandbyObject(db: Db, destination: BackupDestination, name: string): Promise<number | null> {
  if (!BACKUP_OBJECT_NAME_PATTERN.test(name) || hiddenStandbyObjects(db, destination.id).has(name)) return null;
  const info = await destination.stat(name);
  return info === null ? null : info.size;
}

/** Streams exactly `length` bytes of `name` from `start` (the destination's own chunked reader; never a whole object in memory). */
export async function* readStandbyRange(destination: BackupDestination, name: string, start: number, length: number): AsyncGenerator<Uint8Array> {
  let left = length;
  if (left <= 0) return;
  for await (const chunk of destination.source().read(name, start)) {
    if (chunk.length >= left) {
      yield chunk.subarray(0, left);
      return;
    }
    left -= chunk.length;
    yield chunk;
  }
  throw new Error('The backup object ended early.');
}
