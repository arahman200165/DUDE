import { createHash, randomBytes } from 'node:crypto';
import { mkdir, open, readdir, rm, stat } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import path from 'node:path';
import { BackupError, REPO_OBJECT_NAME } from '@dude/hub-backup';
import type { ObjectSink, ObjectSource, ObjectWriteStream } from '@dude/hub-backup';
import type { HubBackupOneDriveDestination } from '../../../config/hub-config.js';
import { BACKUP_OBJECT_NAME_PATTERN, DestinationError, assertObjectName } from '../destination.js';
import type { BackupDestination, BackupObjectPrefix, DestinationObjectInfo, DestinationProbe } from '../destination.js';
import { ONEDRIVE_CHUNK_ALIGN, OneDriveClient } from './onedrive-client.js';
import type { OneDriveClientOptions, OneDriveFileInfo } from './onedrive-client.js';
import type { OneDriveCredentials } from './onedrive-credentials.js';

/** The upload fragment (a multiple of 320 KiB; Microsoft recommends 5 to 10 MiB and allows at most 60 MiB). */
export const ONEDRIVE_CHUNK_BYTES = 32 * ONEDRIVE_CHUNK_ALIGN; // 10 MiB
const MAX_RESUMES = 8;
const PROBE_PREFIX = '.dude-probe-';
const STAGE_SUFFIX = '.stage';

/**
 * The OneDrive backup destination (32-SS1, Milestone 857, PD-150), behind the same `BackupDestination` interface as the local folder,
 * S3 and Google Drive. Objects are files named `repo`, `packs/<id>` and `manifests/<id>` (the name is a path) in ONE folder the Hub
 * created inside its own app folder under the `Files.ReadWrite.AppFolder` scope; the app lists and touches nothing else in the owner's
 * OneDrive. Files are written through upload sessions in 320 KiB-multiple fragments with retry and resume.
 *
 * Write-once (a security property: it keeps every (key, nonce) pair unique): the session is created with `conflictBehavior: fail`, so
 * Microsoft itself refuses a name that exists when the last fragment lands (`exists`), and `create` and `commit` also look the name up
 * first. The Hub is the only writer of its repository (the destination lock) and object names carry 128 random bits. A file exists only
 * after its last fragment lands (atomic commit: a manifest, written last by the engine, is never half there), and is then checked for
 * size and the SHA-256 (or SHA-1) Microsoft reports against the bytes that were sent. The end-to-end guarantee does not rest on
 * OneDrive: every backup chunk is authenticated by the backup format and verify-on-write reads it back.
 *
 * Staging (the one difference from Drive): Graph needs the TOTAL size in every fragment's `Content-Range`, and a sink does not know it
 * until `commit`. So bytes are written to a temp file in the scratch directory (hashed as they go) and the upload happens at `commit`,
 * one fragment at a time read back from that file. Memory stays bounded by ONE fragment (10 MiB) however large the object; disk holds
 * the object being written (packs are at most 64 MiB); the temp file is removed on commit, abort or failure, and a crashed process's
 * leftovers are swept by `sweepIncomplete`. Nothing reaches OneDrive before `commit`, so an abort leaves nothing remote.
 *
 * A read streams a Range request against the item's pre-authenticated download URL, resuming from the byte already delivered when the
 * connection drops. A delete goes to the OneDrive recycle bin (it still counts against the quota until emptied there). Free space is the
 * account quota; a full OneDrive is `quota`; a revoked or expired consent is `reauth`.
 */
export interface OneDriveProbeReport {
  ok: boolean;
  /** The step that failed, when `ok` is false. */
  failedStep?: 'authorize' | 'folder' | 'write' | 'read' | 'delete';
  /** The short failure code, when `ok` is false. */
  reason?: string;
  authorized: boolean;
  folder: boolean;
  write: boolean;
  read: boolean;
  delete: boolean;
  /** The account's storage: bytes used and the total (null when OneDrive does not say). */
  storage: { usage: number | null; limit: number | null } | null;
  latencyMs: number;
}

export interface OneDriveBackupDestination extends BackupDestination {
  readonly kind: 'onedrive';
  probeDetailed(): Promise<OneDriveProbeReport>;
}

export interface OneDriveDestinationOptions {
  definition: HubBackupOneDriveDestination;
  credentials: OneDriveCredentials;
  /** Where an object being written is staged until its total size is known (created on demand; the Hub gives it `<backups>/.tmp/onedrive`). */
  scratchDir: string;
  /** Overrides the fragment size (default 10 MiB; a multiple of 320 KiB). */
  chunkBytes?: number;
  /** Persists a ROTATED refresh token (the credential store's `rotate`). */
  onRefreshToken?: OneDriveClientOptions['onRefreshToken'];
  /** The newest stored refresh token, for a refusal caused by a sibling client's rotation. */
  latestRefreshToken?: OneDriveClientOptions['latestRefreshToken'];
  /** Test seams for the client (endpoints, fetch, clock, backoff). */
  client?: Partial<Omit<OneDriveClientOptions, 'clientId' | 'clientSecret' | 'refreshToken' | 'folderId' | 'onRefreshToken' | 'latestRefreshToken'>>;
}

const sha256Hex = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

/** Compares what Microsoft reports against the bytes that were sent; a hash Microsoft has not computed (yet) cannot disagree. */
const hashesMatch = (file: OneDriveFileInfo, sha1: string, sha256: string): boolean =>
  (file.sha256 === undefined || file.sha256 === sha256) && (file.sha1 === undefined || file.sha1 === sha1);

export function createOneDriveDestination(options: OneDriveDestinationOptions): OneDriveBackupDestination {
  const { definition } = options;
  const chunkBytes = options.chunkBytes ?? ONEDRIVE_CHUNK_BYTES;
  if (!Number.isInteger(chunkBytes) || chunkBytes < ONEDRIVE_CHUNK_ALIGN || chunkBytes % ONEDRIVE_CHUNK_ALIGN !== 0 || chunkBytes > 60 * 1024 * 1024) throw new DestinationError('bad-endpoint', 'The OneDrive fragment size must be a multiple of 320 KiB and at most 60 MiB.');
  const client = new OneDriveClient({
    clientId: definition.clientId, clientSecret: options.credentials.clientSecret, refreshToken: options.credentials.refreshToken, folderId: definition.folderId,
    ...(options.onRefreshToken !== undefined ? { onRefreshToken: options.onRefreshToken } : {}),
    ...(options.latestRefreshToken !== undefined ? { latestRefreshToken: options.latestRefreshToken } : {}),
    ...options.client,
  });
  const inFlight = new Set<string>();
  const existsError = (): DestinationError => new DestinationError('exists', 'A backup object with that name already exists.');
  const stagingError = (): DestinationError => new DestinationError('unavailable', 'The OneDrive staging file could not be written (is the disk full?).');

  const sink: ObjectSink = {
    async create(name: string): Promise<ObjectWriteStream> {
      assertObjectName(name);
      if (inFlight.has(name) || (await client.findByName(name)).length > 0) throw existsError();
      inFlight.add(name);
      let handle: FileHandle | undefined;
      let stagePath: string | undefined;
      try {
        await mkdir(options.scratchDir, { recursive: true, mode: 0o700 });
        stagePath = path.join(options.scratchDir, `${randomBytes(12).toString('hex')}${STAGE_SUFFIX}`);
        handle = await open(stagePath, 'wx+', 0o600);
      } catch {
        inFlight.delete(name);
        if (stagePath !== undefined) await rm(stagePath, { force: true }).catch(() => undefined);
        throw stagingError();
      }
      const file = handle;
      const staged = stagePath;
      let length = 0;
      const sha1 = createHash('sha1');
      const sha256 = createHash('sha256');
      let state: 'open' | 'done' = 'open';
      const finish = async (): Promise<void> => {
        state = 'done';
        inFlight.delete(name);
        await file.close().catch(() => undefined);
        await rm(staged, { force: true }).catch(() => undefined);
      };

      return {
        async write(bytes: Uint8Array): Promise<void> {
          if (state !== 'open') throw new BackupError('bad-input', 'The backup object is closed.');
          try {
            let offset = 0;
            while (offset < bytes.length) {
              const { bytesWritten } = await file.write(bytes, offset, bytes.length - offset, length + offset);
              if (bytesWritten <= 0) throw stagingError();
              offset += bytesWritten;
            }
            sha1.update(bytes);
            sha256.update(bytes);
            length += bytes.length;
          } catch (error) {
            await finish();
            throw error instanceof DestinationError ? error : stagingError();
          }
        },
        async commit(): Promise<void> {
          if (state !== 'open') throw new BackupError('bad-input', 'The backup object is closed.');
          const total = length;
          let session: Awaited<ReturnType<typeof client.startUpload>> | undefined;
          let created: OneDriveFileInfo | undefined;
          try {
            if ((await client.findByName(name)).length > 0) throw existsError();
            if (total === 0) {
              created = await client.putSmall(name, new Uint8Array(0));
            } else {
              session = await client.startUpload(name);
              const buffer = Buffer.allocUnsafe(Math.min(chunkBytes, total));
              for (let offset = 0; offset < total;) {
                const take = Math.min(chunkBytes, total - offset);
                const { bytesRead } = await file.read(buffer, 0, take, offset);
                if (bytesRead !== take) throw stagingError();
                const result = await client.uploadChunk(session, buffer.subarray(0, take), offset, total);
                offset += take;
                if (offset >= total) {
                  if (!result.done) throw new DestinationError('server', 'OneDrive did not finish the upload.');
                  created = result.file;
                } else if (result.done) {
                  throw new DestinationError('mismatch', 'OneDrive finished an upload before its last fragment.');
                }
              }
              session = undefined;
            }
            if (created === undefined) throw new DestinationError('server', 'OneDrive did not finish the upload.');
            if (created.size !== total || !hashesMatch(created, sha1.digest('hex'), sha256.digest('hex'))) throw new DestinationError('mismatch', 'The stored OneDrive file does not match the bytes that were written.');
          } catch (error) {
            if (created !== undefined && error instanceof DestinationError && error.code === 'mismatch') await client.delete(created.id).catch(() => undefined);
            if (session !== undefined) await client.cancelUpload(session);
            await finish();
            throw error;
          }
          await finish();
        },
        async abort(): Promise<void> {
          if (state !== 'open') return;
          await finish();
        },
      };
    },
  };

  const source: ObjectSource = {
    read(name: string, start = 0): AsyncIterable<Uint8Array> {
      assertObjectName(name);
      return (async function* () {
        const found = await client.findByName(name);
        const file = found[0];
        if (file === undefined) throw new BackupError('integrity', 'A backup object is missing.');
        const size = file.size;
        let offset = start;
        let resumes = 0;
        while (offset < size) {
          const result = await client.download(file.id, offset);
          if (result === null) throw new BackupError('integrity', 'A backup object is missing.');
          if (result.status === 416) {
            if (offset >= size) return;
            throw new BackupError('integrity', 'A backup read is out of range.');
          }
          if (result.total !== undefined && result.total !== size) { result.destroy(); throw new DestinationError('mismatch', 'The OneDrive file changed size while it was being read.'); }
          try {
            for await (const chunk of result.body) {
              offset += chunk.length;
              if (offset > size) throw new DestinationError('mismatch', 'The OneDrive response was longer than the object.');
              yield chunk;
            }
          } catch (error) {
            result.destroy();
            if (error instanceof DestinationError) throw error;
            resumes += 1;
            if (resumes > MAX_RESUMES) throw new DestinationError('network', 'The OneDrive download kept failing.');
            continue; // resume from the byte already delivered
          } finally {
            result.destroy();
          }
          if (offset >= size) return;
          resumes += 1; // the body ended short (a truncated response)
          if (resumes > MAX_RESUMES) throw new DestinationError('mismatch', 'The OneDrive download was truncated.');
        }
      })();
    },
  };

  async function list(prefix: BackupObjectPrefix): Promise<DestinationObjectInfo[]> {
    const out: DestinationObjectInfo[] = [];
    for (const file of await client.list(prefix.replace(/\/$/, ''), prefix)) if (BACKUP_OBJECT_NAME_PATTERN.test(file.name)) out.push({ name: file.name, size: file.size });
    return out.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  }

  async function probeDetailed(): Promise<OneDriveProbeReport> {
    const started = Date.now();
    const report: OneDriveProbeReport = { ok: false, authorized: false, folder: false, write: false, read: false, delete: false, storage: null, latencyMs: 0 };
    const name = `${PROBE_PREFIX}${randomBytes(8).toString('hex')}`;
    const body = new TextEncoder().encode(`dude backup probe ${name}`);
    let step: OneDriveProbeReport['failedStep'] = 'authorize';
    let created: OneDriveFileInfo | undefined;
    try {
      await client.checkAuthorization();
      report.authorized = true;
      step = 'folder';
      if (!(await client.folderUsable())) throw new DestinationError('unavailable', 'The OneDrive folder is gone or in the recycle bin.');
      report.folder = true;
      const quota = await client.about().catch(() => null);
      if (quota !== null) report.storage = { usage: quota.usage, limit: quota.limit };

      step = 'write';
      const session = await client.startUpload(name);
      const result = await client.uploadChunk(session, body, 0, body.length);
      if (!result.done) throw new DestinationError('server', 'OneDrive did not finish the probe upload.');
      created = result.file;
      if (created.size !== body.length) throw new DestinationError('mismatch', 'The probe file has the wrong size.');
      report.write = true;

      step = 'read';
      const download = await client.download(created.id, 0);
      if (download === null) throw new DestinationError('mismatch', 'The probe file was not readable after it was written.');
      const read: Uint8Array[] = [];
      try { for await (const chunk of download.body) read.push(chunk); } finally { download.destroy(); }
      if (!Buffer.concat(read).equals(Buffer.from(body))) throw new DestinationError('mismatch', 'The probe file read back differently.');
      report.read = true;

      step = 'delete';
      await client.delete(created.id);
      created = undefined;
      if ((await client.findByName(name)).length > 0) throw new DestinationError('mismatch', 'The probe file was still present after it was deleted.');
      report.delete = true;
      report.ok = true;
    } catch (error) {
      report.failedStep = step;
      report.reason = error instanceof DestinationError ? error.code : 'unavailable';
      if (created !== undefined) await client.delete(created.id).catch(() => undefined);
    }
    report.latencyMs = Date.now() - started;
    return report;
  }

  return {
    id: definition.id,
    kind: 'onedrive',
    label: definition.label,
    sink: () => sink,
    source: () => source,
    list,
    async stat(name) {
      assertObjectName(name);
      const file = (await client.findByName(name))[0];
      return file === undefined ? null : { name, size: file.size };
    },
    async deleteObject(name) {
      assertObjectName(name);
      for (const file of await client.findByName(name)) await client.delete(file.id);
    },
    async replaceRepo(bytes) {
      // An update of the file's content is atomic (a reader sees the old or the new content, never a mix). No `create` here: this is the one deliberate overwrite.
      const existing = (await client.findByName(REPO_OBJECT_NAME))[0];
      if (existing === undefined) {
        const out = await sink.create(REPO_OBJECT_NAME);
        try { await out.write(bytes); await out.commit(); } catch (error) { await out.abort(); throw error; }
        return;
      }
      const updated = await client.updateContent(existing.id, bytes);
      const sha1 = createHash('sha1').update(bytes).digest('hex');
      if (updated.size !== bytes.length || !hashesMatch(updated, sha1, sha256Hex(bytes))) {
        throw new DestinationError('mismatch', 'The stored repository object does not match the bytes that were written.');
      }
    },
    async probe(): Promise<DestinationProbe> {
      const report = await probeDetailed();
      if (!report.ok) return { ok: false, reason: report.reason ?? 'unavailable' };
      const storage = report.storage;
      const free = storage !== null && storage.limit !== null && storage.usage !== null ? Math.max(0, storage.limit - storage.usage) : null;
      return { ok: true, freeBytes: free };
    },
    /** Removes staging files a crashed process left behind (an object being written is staged only for the length of one commit). */
    async sweepIncomplete(maxAgeMs, now) {
      let removed = 0;
      let entries: string[];
      try { entries = await readdir(options.scratchDir); } catch { return 0; }
      for (const entry of entries) {
        if (!entry.endsWith(STAGE_SUFFIX)) continue;
        const file = path.join(options.scratchDir, entry);
        try {
          const info = await stat(file);
          if (now - info.mtimeMs > maxAgeMs) { await rm(file, { force: true }); removed += 1; }
        } catch { /* gone already */ }
      }
      return removed;
    },
    probeDetailed,
  };
}
