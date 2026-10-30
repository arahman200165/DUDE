import { createHash, randomBytes } from 'node:crypto';
import { BackupError, REPO_OBJECT_NAME } from '@dude/hub-backup';
import type { ObjectSink, ObjectSource, ObjectWriteStream } from '@dude/hub-backup';
import type { HubBackupDriveDestination } from '../../../config/hub-config.js';
import { BACKUP_OBJECT_NAME_PATTERN, DestinationError, assertObjectName } from '../destination.js';
import type { BackupDestination, BackupObjectPrefix, DestinationObjectInfo, DestinationProbe } from '../destination.js';
import { DRIVE_CHUNK_ALIGN, DriveClient } from './drive-client.js';
import type { DriveClientOptions, DriveFileInfo } from './drive-client.js';
import type { DriveCredentials } from './drive-credentials.js';

/** The resumable upload chunk (a multiple of 256 KiB; Google recommends at least 8 MiB for throughput). */
export const DRIVE_CHUNK_BYTES = 8 * 1024 * 1024;
const MAX_RESUMES = 8;
const PROBE_PREFIX = '.dude-probe-';

/**
 * The Google Drive backup destination (32-SS1, Milestone 856, PD-154), behind the same `BackupDestination` interface as the local
 * folder and S3. Objects are files named `repo`, `packs/<id>` and `manifests/<id>` (the name carries the slash) in ONE folder the Hub
 * created under the `drive.file` scope; the app lists and touches nothing else in the owner's Drive. Files are written through
 * resumable upload sessions in 256 KiB-multiple chunks with retry and resume.
 *
 * Write-once (a security property: it keeps every (key, nonce) pair unique): Drive has no conditional create and permits duplicate
 * names, so `create` refuses a name that exists (a name lookup) or is being written by this process, and `commit` looks again right
 * before the last chunk. A file exists only after its last chunk lands (atomic commit: a manifest, written last by the engine, is
 * never half there). After the last chunk the result is verified (size and the MD5 Drive computes against the MD5 of the bytes that
 * were sent) and the name is looked up once more: more than one file under the name means a concurrent writer, and the file this
 * write created is removed (`exists`). The Hub is the only writer of its repository (the destination lock) and object names carry
 * 128 random bits, so this is check-then-write, as for an S3 provider that ignores `If-None-Match`. The end-to-end guarantee does
 * not rest on Drive: every backup chunk is authenticated by the backup format and verify-on-write reads it back.
 *
 * Memory: a sink holds at most ONE chunk (8 MiB) and uploads it before accepting more bytes (backpressure to the engine); a read
 * streams the response, resuming from the byte already delivered when the connection drops. A delete is permanent (not the trash).
 * Free space is the account's storage quota; a full Drive is `quota`; a revoked or expired consent is `reauth`.
 */
export interface DriveProbeReport {
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
  /** The account's storage: bytes used and the limit (null on an unlimited plan or when Drive does not say). */
  storage: { usage: number | null; limit: number | null } | null;
  latencyMs: number;
}

export interface DriveBackupDestination extends BackupDestination {
  readonly kind: 'drive';
  probeDetailed(): Promise<DriveProbeReport>;
}

export interface DriveDestinationOptions {
  definition: HubBackupDriveDestination;
  credentials: DriveCredentials;
  /** Overrides the chunk size (default 8 MiB; a multiple of 256 KiB). */
  chunkBytes?: number;
  /** Test seams for the client (endpoints, fetch, clock, backoff). */
  client?: Partial<Omit<DriveClientOptions, 'clientId' | 'clientSecret' | 'refreshToken' | 'folderId'>>;
}

const md5Hex = (hash: ReturnType<typeof createHash>): string => hash.digest('hex');

export function createDriveDestination(options: DriveDestinationOptions): DriveBackupDestination {
  const { definition } = options;
  const chunkBytes = options.chunkBytes ?? DRIVE_CHUNK_BYTES;
  if (!Number.isInteger(chunkBytes) || chunkBytes < DRIVE_CHUNK_ALIGN || chunkBytes % DRIVE_CHUNK_ALIGN !== 0) throw new DestinationError('bad-endpoint', 'The Google Drive chunk size must be a multiple of 256 KiB.');
  const client = new DriveClient({
    clientId: definition.clientId, clientSecret: options.credentials.clientSecret, refreshToken: options.credentials.refreshToken, folderId: definition.folderId, ...options.client,
  });
  const inFlight = new Set<string>();
  const existsError = (): DestinationError => new DestinationError('exists', 'A backup object with that name already exists.');

  const sink: ObjectSink = {
    async create(name: string): Promise<ObjectWriteStream> {
      assertObjectName(name);
      if (inFlight.has(name) || (await client.findByName(name)).length > 0) throw existsError();
      inFlight.add(name);
      let session: string | undefined;
      let buffer = new Uint8Array(0);
      let length = 0;
      let sent = 0;
      const md5 = createHash('md5');
      let state: 'open' | 'done' = 'open';
      const finish = (): void => { state = 'done'; inFlight.delete(name); buffer = new Uint8Array(0); };
      const abortUpload = async (): Promise<void> => {
        const id = session;
        session = undefined;
        if (id !== undefined) await client.cancelUpload(id);
      };
      const flush = async (): Promise<void> => {
        session ??= await client.startUpload(name);
        const piece = buffer.subarray(0, length);
        const result = await client.uploadChunk(session, piece, sent, undefined);
        if (result.done) throw new DestinationError('mismatch', 'Google Drive finished an upload before its last chunk.');
        sent += length;
        length = 0;
      };

      return {
        async write(bytes: Uint8Array): Promise<void> {
          if (state !== 'open') throw new BackupError('bad-input', 'The backup object is closed.');
          try {
            let offset = 0;
            while (offset < bytes.length) {
              if (length === chunkBytes) await flush();
              const take = Math.min(bytes.length - offset, chunkBytes - length);
              if (buffer.length < length + take) {
                const grown = new Uint8Array(Math.min(chunkBytes, Math.max(length + take, buffer.length * 2, 64 * 1024)));
                grown.set(buffer.subarray(0, length));
                buffer = grown;
              }
              const slice = bytes.subarray(offset, offset + take);
              buffer.set(slice, length);
              md5.update(slice);
              length += take;
              offset += take;
            }
          } catch (error) {
            await abortUpload();
            finish();
            throw error;
          }
        },
        async commit(): Promise<void> {
          if (state !== 'open') throw new BackupError('bad-input', 'The backup object is closed.');
          const total = sent + length;
          let created: DriveFileInfo | undefined;
          try {
            if ((await client.findByName(name)).length > 0) throw existsError();
            session ??= await client.startUpload(name);
            const result = await client.uploadChunk(session, buffer.subarray(0, length), sent, total);
            if (!result.done) throw new DestinationError('server', 'Google Drive did not finish the upload.');
            session = undefined;
            created = result.file;
            const expected = md5Hex(md5);
            if (created.size !== total || (created.md5 !== undefined && created.md5 !== expected)) throw new DestinationError('mismatch', 'The stored Google Drive file does not match the bytes that were written.');
            const same = await client.findByName(name);
            if (same.length !== 1 || same[0]!.id !== created.id) {
              if (same.some((file) => file.id === created!.id)) { await client.delete(created.id).catch(() => undefined); created = undefined; }
              throw same.length === 0 ? new DestinationError('mismatch', 'The Google Drive file was not found after it was written.') : existsError();
            }
          } catch (error) {
            if (created !== undefined && error instanceof DestinationError && error.code === 'mismatch') await client.delete(created.id).catch(() => undefined);
            await abortUpload();
            finish();
            throw error;
          }
          finish();
        },
        async abort(): Promise<void> {
          if (state !== 'open') return;
          await abortUpload();
          finish();
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
          if (result.total !== undefined && result.total !== size) { result.destroy(); throw new DestinationError('mismatch', 'The Google Drive file changed size while it was being read.'); }
          try {
            for await (const chunk of result.body) {
              offset += chunk.length;
              if (offset > size) throw new DestinationError('mismatch', 'The Google Drive response was longer than the object.');
              yield chunk;
            }
          } catch (error) {
            result.destroy();
            if (error instanceof DestinationError) throw error;
            resumes += 1;
            if (resumes > MAX_RESUMES) throw new DestinationError('network', 'The Google Drive download kept failing.');
            continue; // resume from the byte already delivered
          } finally {
            result.destroy();
          }
          if (offset >= size) return;
          resumes += 1; // the body ended short (a truncated response)
          if (resumes > MAX_RESUMES) throw new DestinationError('mismatch', 'The Google Drive download was truncated.');
        }
      })();
    },
  };

  async function list(prefix: BackupObjectPrefix): Promise<DestinationObjectInfo[]> {
    const out: DestinationObjectInfo[] = [];
    for (const file of await client.list(prefix)) if (BACKUP_OBJECT_NAME_PATTERN.test(file.name)) out.push({ name: file.name, size: file.size });
    return out.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  }

  async function probeDetailed(): Promise<DriveProbeReport> {
    const started = Date.now();
    const report: DriveProbeReport = { ok: false, authorized: false, folder: false, write: false, read: false, delete: false, storage: null, latencyMs: 0 };
    const name = `${PROBE_PREFIX}${randomBytes(8).toString('hex')}`;
    const body = new TextEncoder().encode(`dude backup probe ${name}`);
    let step: DriveProbeReport['failedStep'] = 'authorize';
    let created: DriveFileInfo | undefined;
    try {
      await client.checkAuthorization();
      report.authorized = true;
      step = 'folder';
      if (!(await client.folderUsable())) throw new DestinationError('unavailable', 'The Google Drive folder is gone or in the trash.');
      report.folder = true;
      const quota = await client.about().catch(() => null);
      if (quota !== null) report.storage = { usage: quota.usage, limit: quota.limit };

      step = 'write';
      const session = await client.startUpload(name);
      const result = await client.uploadChunk(session, body, 0, body.length);
      if (!result.done) throw new DestinationError('server', 'Google Drive did not finish the probe upload.');
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
    kind: 'drive',
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
      if (updated.size !== bytes.length || (updated.md5 !== undefined && updated.md5 !== md5Hex(createHash('md5').update(bytes)))) {
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
    probeDetailed,
  };
}
