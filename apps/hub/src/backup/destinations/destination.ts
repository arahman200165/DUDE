import type { ObjectSink, ObjectSource } from '@dude/hub-backup';

/**
 * A backup v2 destination (32-SS1, Milestone 847, PD-150): where a repository of write-once objects lives (`repo`,
 * `packs/<32 hex>`, `manifests/<YYYYMMDDTHHMMSSZ>-<32 hex>`). The engine writes through `sink()` and reads through `source()`
 * (the `@dude/hub-backup` contracts), so the format code never sees a path, a bucket or a credential. Built in this order behind
 * this one interface: `local-folder` (Milestone 847), then S3-compatible (Milestone 848); the standby device PULLS (849), Google Drive (856) and
 * OneDrive (857) implement the same methods.
 *
 * Rules every implementation keeps:
 * - `sink().create(name)` is write-once: it refuses a name that is committed OR being written, and an object becomes visible under
 *   its name only at `commit()` (local: `.part` file, fsync, hard link or checked rename). Write-once names are what keep every
 *   (key, nonce) pair unique, so this is a security property, not a convenience.
 * - `source().read(name, start)` streams a committed object; a missing one throws `BackupError('integrity')`.
 * - `list` returns committed objects only, sorted by name (manifest names sort by time).
 * - `deleteObject` is used ONLY by the two-step retention prune and by a run cleaning up its own uncommitted backup (the journal).
 * - `replaceRepo` is the ONLY overwrite, used only by the passphrase re-wrap; it is atomic (the old or the new `repo`, never half).
 * - Nothing here logs or returns a credential; error messages never carry one.
 */
export const BACKUP_DESTINATION_KINDS = ['local-folder', 's3', 'drive'] as const;
export type BackupDestinationKind = (typeof BACKUP_DESTINATION_KINDS)[number];

export const BACKUP_OBJECT_NAME_PATTERN = /^(?:repo|packs\/[0-9a-f]{32}|manifests\/\d{8}T\d{6}Z-[0-9a-f]{32})$/;
export const MANIFEST_PREFIX = 'manifests/';
export const PACK_PREFIX = 'packs/';
export type BackupObjectPrefix = typeof MANIFEST_PREFIX | typeof PACK_PREFIX;

export interface DestinationObjectInfo {
  name: string;
  size: number;
}

export type DestinationProbe = { ok: true; freeBytes: number | null } | { ok: false; reason: string };

export interface BackupDestination {
  readonly id: string;
  readonly kind: BackupDestinationKind;
  readonly label: string;
  sink(): ObjectSink;
  source(): ObjectSource;
  /** Committed objects under `prefix`, ascending by name. */
  list(prefix: BackupObjectPrefix): Promise<DestinationObjectInfo[]>;
  /** One committed object, or null. */
  stat(name: string): Promise<DestinationObjectInfo | null>;
  /** Removes one committed object; idempotent. Retention prune and a run's own cleanup only. */
  deleteObject(name: string): Promise<void>;
  /** Atomically replaces `repo` (passphrase re-wrap only). */
  replaceRepo(bytes: Uint8Array): Promise<void>;
  /** Connectivity (write and remove a probe) and, when the destination can tell, free space. Never throws. */
  probe(): Promise<DestinationProbe>;
  /** Removes partial uploads (`.part`) older than `maxAgeMs` left by a crashed process; returns how many. Optional. */
  sweepIncomplete?(maxAgeMs: number, now: number): Promise<number>;
}

/**
 * Closed, short codes (they become audit and state error codes through `backupRunFailureCode`). The S3 destination (Milestone 848)
 * adds `auth` (credentials or permission refused, clock skew), `bad-endpoint` (a refused or misconfigured endpoint, a redirect, a
 * missing bucket), `throttled`, `timeout`, `network`, `server` (5xx after retries), `rejected` (any other 4xx) and `mismatch` (a
 * transfer checksum or size that did not match). Google Drive (Milestone 856) adds `quota` (the Drive is full, or its API quota is
 * spent) and `reauth` (the owner revoked the consent or the refresh token expired: reconnect Drive).
 */
export type DestinationErrorCode = 'exists' | 'bad-name' | 'unsafe-location' | 'unavailable' | 'auth' | 'bad-endpoint' | 'throttled' | 'timeout' | 'network' | 'server' | 'rejected' | 'mismatch' | 'quota' | 'reauth';

/** A destination refusal. The message never names a credential; a local path may appear only in admin-pipe answers. */
export class DestinationError extends Error {
  constructor(readonly code: DestinationErrorCode, message: string) {
    super(message);
    this.name = 'DestinationError';
  }
}

export function assertObjectName(name: unknown): asserts name is string {
  if (typeof name !== 'string' || !BACKUP_OBJECT_NAME_PATTERN.test(name)) throw new DestinationError('bad-name', 'A backup object name is not allowed.');
}

/** The backup id of a manifest object name, or null. */
export function backupIdOfManifest(name: string): string | null {
  return name.startsWith(MANIFEST_PREFIX) && BACKUP_OBJECT_NAME_PATTERN.test(name) ? name.slice(MANIFEST_PREFIX.length) : null;
}

/** The pack id of a pack object name, or null. */
export function packIdOfObject(name: string): string | null {
  return name.startsWith(PACK_PREFIX) && BACKUP_OBJECT_NAME_PATTERN.test(name) ? name.slice(PACK_PREFIX.length) : null;
}
