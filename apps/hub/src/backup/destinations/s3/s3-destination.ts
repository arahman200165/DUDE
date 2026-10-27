import { randomBytes } from 'node:crypto';
import { BackupError, REPO_OBJECT_NAME } from '@dude/hub-backup';
import type { ObjectSink, ObjectSource, ObjectWriteStream } from '@dude/hub-backup';
import type { HubBackupS3Destination } from '../../../config/hub-config.js';
import { BACKUP_OBJECT_NAME_PATTERN, DestinationError, assertObjectName } from '../destination.js';
import type { BackupDestination, BackupObjectPrefix, DestinationObjectInfo, DestinationProbe } from '../destination.js';
import { S3Client } from './s3-client.js';
import type { S3ClientOptions } from './s3-client.js';
import type { SigV4Credentials } from './sigv4.js';

/** The multipart part size (PD-150 brief: 16 MiB; S3 refuses a part under 5 MiB except the last). */
export const S3_PART_BYTES = 16 * 1024 * 1024;
export const S3_MIN_PART_BYTES = 5 * 1024 * 1024;
const MAX_PARTS = 10_000;
const MAX_RESUMES = 8;
const PROBE_PREFIX = '.dude-probe/';

/**
 * The S3-compatible backup destination (32-SS1, Milestone 848): AWS S3, Cloudflare R2, Backblaze B2's S3 API and MinIO, behind the
 * same `BackupDestination` interface as the local folder. Objects are `<prefix>/repo`, `<prefix>/packs/<id>` and
 * `<prefix>/manifests/<id>`.
 *
 * Write-once (a security property: it keeps every (key, nonce) pair unique): `create` refuses a name that exists (HeadObject) or is
 * being written by this process, and `commit` sends `If-None-Match: *` on the PutObject or CompleteMultipartUpload, which AWS S3
 * (2024), Cloudflare R2 and current MinIO enforce with a 412. A provider that rejects the header (501 or a 400, for example
 * Backblaze B2) is remembered as `unsupported` and the write goes ahead without it, with a second HeadObject immediately before the
 * commit; a provider that silently ignores it is covered by the same two HeadObject checks. Without server enforcement the guard is
 * check-then-write: safe because the Hub is the only writer of its repository (the destination lock) and object names carry 128
 * random bits, so two writers cannot pick one name by chance. `dude-hub backup destination probe` reports which of the three the
 * provider does (`enforced`, `ignored`, `unsupported`).
 *
 * Memory: a sink holds at most ONE part (16 MiB) and uploads it before accepting more bytes (backpressure to the engine); a read
 * streams the response, resuming from the byte already delivered (a conditional `Range` with `If-Match` on the first ETag) when
 * the connection drops. Deletes on a versioned bucket leave delete markers and noncurrent versions: set a lifecycle rule.
 */
export interface S3ProbeReport {
  ok: boolean;
  /** The step that failed, when `ok` is false. */
  failedStep?: 'write' | 'read' | 'conditional' | 'multipart' | 'delete';
  /** The short failure code, when `ok` is false. */
  reason?: string;
  write: boolean;
  read: boolean;
  delete: boolean;
  multipart: boolean;
  /** `enforced`: a second `If-None-Match: *` write was refused (412). `ignored`: it overwrote. `unsupported`: the header was rejected. */
  conditionalWrites: 'enforced' | 'ignored' | 'unsupported' | 'unknown';
  /** Provider clock minus the Hub's, in seconds, or null. */
  clockSkewSeconds: number | null;
  addressing: 'path' | 'virtual-hosted';
  latencyMs: number;
}

export interface S3BackupDestination extends BackupDestination {
  readonly kind: 's3';
  probeDetailed(): Promise<S3ProbeReport>;
}

export interface S3DestinationOptions {
  definition: HubBackupS3Destination;
  credentials: SigV4Credentials;
  /** Overrides the part size (default 16 MiB). */
  partBytes?: number;
  /** Test seam: the smallest part the provider is assumed to accept (default 5 MiB). */
  minPartBytes?: number;
  /** Test seams for the client (transport, clock, backoff). */
  client?: Partial<Omit<S3ClientOptions, 'endpoint' | 'region' | 'bucket' | 'prefix' | 'forcePathStyle' | 'allowPrivateNetwork' | 'credentials'>>;
}

export function createS3Destination(options: S3DestinationOptions): S3BackupDestination {
  const { definition } = options;
  const client = new S3Client({
    endpoint: definition.endpoint, region: definition.region, bucket: definition.bucket, prefix: definition.prefix, forcePathStyle: definition.forcePathStyle,
    allowPrivateNetwork: definition.allowPrivateNetwork, credentials: options.credentials, ...options.client,
  });
  const partBytes = options.partBytes ?? S3_PART_BYTES;
  const minPart = options.minPartBytes ?? S3_MIN_PART_BYTES;
  if (!Number.isInteger(partBytes) || partBytes < minPart) throw new DestinationError('bad-endpoint', 'The S3 part size is below the provider minimum.');
  const inFlight = new Map<string, { uploadId: string | undefined }>();
  let conditional: 'unknown' | 'enforced' | 'unsupported' = 'unknown';
  const existsError = (): DestinationError => new DestinationError('exists', 'A backup object with that name already exists.');

  /** HeadObject that tells "ours": a retried write that already landed must not read as a conflict. */
  async function landedWithSize(name: string, size: number): Promise<boolean> {
    const head = await client.head(name);
    return head !== null && head.size === size;
  }

  const sink: ObjectSink = {
    async create(name: string): Promise<ObjectWriteStream> {
      assertObjectName(name);
      if (inFlight.has(name) || (await client.head(name)) !== null) throw existsError();
      const entry: { uploadId: string | undefined } = { uploadId: undefined };
      inFlight.set(name, entry);
      let buffer = new Uint8Array(0);
      let length = 0;
      let total = 0;
      const parts: Array<{ partNumber: number; etag: string }> = [];
      let state: 'open' | 'done' = 'open';
      const finish = (): void => { state = 'done'; inFlight.delete(name); buffer = new Uint8Array(0); };
      const abortUpload = async (): Promise<void> => {
        const id = entry.uploadId;
        entry.uploadId = undefined;
        if (id !== undefined) await client.abortMultipart(name, id).catch(() => undefined);
      };

      async function flushPart(): Promise<void> {
        if (entry.uploadId === undefined) entry.uploadId = await client.createMultipart(name);
        if (parts.length >= MAX_PARTS) throw new DestinationError('rejected', 'The backup object needs more S3 parts than the provider allows.');
        const partNumber = parts.length + 1;
        const etag = await client.uploadPart(name, entry.uploadId, partNumber, buffer.subarray(0, length));
        parts.push({ partNumber, etag });
        length = 0;
      }

      return {
        async write(bytes: Uint8Array): Promise<void> {
          if (state !== 'open') throw new BackupError('bad-input', 'The backup object is closed.');
          try {
            let offset = 0;
            while (offset < bytes.length) {
              if (length === partBytes) await flushPart();
              const take = Math.min(bytes.length - offset, partBytes - length);
              if (buffer.length < length + take) {
                const grown = new Uint8Array(Math.min(partBytes, Math.max(length + take, buffer.length * 2, 64 * 1024)));
                grown.set(buffer.subarray(0, length));
                buffer = grown;
              }
              buffer.set(bytes.subarray(offset, offset + take), length);
              length += take;
              offset += take;
              total += take;
            }
          } catch (error) {
            await abortUpload();
            finish();
            throw error;
          }
        },
        async commit(): Promise<void> {
          if (state !== 'open') throw new BackupError('bad-input', 'The backup object is closed.');
          try {
            if (conditional !== 'enforced' && (await client.head(name)) !== null) throw existsError();
            if (entry.uploadId === undefined) {
              const body = buffer.subarray(0, length);
              let result = await client.put(name, body, { ifNoneMatch: conditional !== 'unsupported' }).catch(async (error: unknown) => {
                if (conditional === 'unsupported' || !(error instanceof DestinationError) || error.code !== 'rejected') throw error;
                conditional = 'unsupported'; // the provider rejects the header: HEAD-before-write only
                return client.put(name, body);
              });
              if (result.status === 501) {
                conditional = 'unsupported';
                if ((await client.head(name)) !== null) throw existsError();
                result = await client.put(name, body);
              }
              if (result.status === 412 || result.status === 409) {
                if (conditional === 'unknown' && result.status === 412) conditional = 'enforced';
                if (result.retried && (await landedWithSize(name, total))) { /* our own earlier attempt landed */ } else throw existsError();
              }
            } else {
              if (length > 0) await flushPart();
              const done = await client.completeMultipart(name, entry.uploadId, parts, { ifNoneMatch: conditional !== 'unsupported' });
              if (done.status === 412 || done.status === 409) {
                if (conditional === 'unknown' && done.status === 412) conditional = 'enforced';
                if (done.retried && (await landedWithSize(name, total))) { entry.uploadId = undefined; } else throw existsError();
              } else if (done.status === 404) {
                // NoSuchUpload: after an ambiguous first attempt the upload was already completed.
                if (done.retried && (await landedWithSize(name, total))) entry.uploadId = undefined;
                else throw new DestinationError('server', 'S3 CompleteMultipartUpload lost the upload.');
              } else if (done.status === 501) {
                conditional = 'unsupported';
                const again = await client.completeMultipart(name, entry.uploadId, parts);
                if (again.status >= 300) throw new DestinationError('rejected', 'S3 CompleteMultipartUpload was refused.');
              }
              entry.uploadId = undefined;
            }
            const head = await client.head(name);
            if (head === null || head.size !== total) {
              await client.delete(name).catch(() => undefined);
              throw new DestinationError('mismatch', 'The stored S3 object does not have the size that was written.');
            }
          } catch (error) {
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
        let offset = start;
        let etag: string | undefined;
        let total: number | undefined;
        let resumes = 0;
        for (;;) {
          const result = await client.get(name, offset, etag).catch((error: unknown) => {
            if (etag !== undefined && error instanceof DestinationError && error.code === 'rejected') throw new DestinationError('mismatch', 'The S3 object changed while it was being read.');
            throw error;
          });
          if (result === null) throw new BackupError('integrity', 'A backup object is missing.');
          if (result.status === 416) {
            if (total !== undefined && offset >= total) return;
            throw new BackupError('integrity', 'A backup read is out of range.');
          }
          etag ??= result.etag;
          total ??= result.total;
          try {
            for await (const chunk of result.body) {
              offset += chunk.length;
              if (total !== undefined && offset > total) throw new DestinationError('mismatch', 'The S3 response was longer than the object.');
              yield chunk;
            }
          } catch (error) {
            result.destroy();
            if (error instanceof DestinationError) throw error;
            resumes += 1;
            if (resumes > MAX_RESUMES) throw new DestinationError('network', 'The S3 download kept failing.');
            continue; // resume from the byte already delivered
          } finally {
            result.destroy();
          }
          if (total === undefined || offset >= total) return;
          resumes += 1; // the body ended short (a truncated response)
          if (resumes > MAX_RESUMES) throw new DestinationError('mismatch', 'The S3 download was truncated.');
        }
      })();
    },
  };

  async function list(prefix: BackupObjectPrefix): Promise<DestinationObjectInfo[]> {
    const out: DestinationObjectInfo[] = [];
    for (const object of await client.list(prefix)) if (BACKUP_OBJECT_NAME_PATTERN.test(object.key)) out.push({ name: object.key, size: object.size });
    return out.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  }

  async function probeDetailed(): Promise<S3ProbeReport> {
    const started = Date.now();
    const report: S3ProbeReport = {
      ok: false, write: false, read: false, delete: false, multipart: false, conditionalWrites: 'unknown', clockSkewSeconds: null, addressing: 'path', latencyMs: 0,
    };
    // `addressing` reflects what the client built; derive it from a probe URL-free flag the client keeps private.
    report.addressing = options.definition.forcePathStyle === false || (options.definition.forcePathStyle === undefined && /(^|\.)amazonaws\.com(\.cn)?$/i.test(new URL(options.definition.endpoint).hostname)) ? 'virtual-hosted' : 'path';
    const id = randomBytes(8).toString('hex');
    const single = `${PROBE_PREFIX}${id}`;
    const multi = `${PROBE_PREFIX}${id}-mp`;
    const body = new TextEncoder().encode(`dude backup probe ${id}`);
    const cleanup: string[] = [];
    let step: S3ProbeReport['failedStep'] = 'write';
    try {
      const first = await client.put(single, body, { ifNoneMatch: true }).catch(async (error: unknown) => {
        if (!(error instanceof DestinationError) || error.code !== 'rejected') throw error;
        report.conditionalWrites = 'unsupported';
        return client.put(single, body);
      });
      if (first.status === 501) { report.conditionalWrites = 'unsupported'; await client.put(single, body); }
      cleanup.push(single);
      report.write = true;

      step = 'read';
      const got = await client.get(single, 0);
      if (got === null) throw new DestinationError('mismatch', 'The probe object was not readable after it was written.');
      const read: Uint8Array[] = [];
      try { for await (const chunk of got.body) read.push(chunk); } finally { got.destroy(); }
      const readBack = Buffer.concat(read);
      if (!readBack.equals(Buffer.from(body))) throw new DestinationError('mismatch', 'The probe object read back differently.');
      report.read = true;

      step = 'conditional';
      if (report.conditionalWrites === 'unknown') {
        const second = await client.put(single, new Uint8Array([1]), { ifNoneMatch: true }).catch((error: unknown) => {
          if (error instanceof DestinationError && error.code === 'rejected') return { status: 501 } as { status: number };
          throw error;
        });
        report.conditionalWrites = second.status === 412 || second.status === 409 ? 'enforced' : second.status === 501 ? 'unsupported' : 'ignored';
      }

      step = 'multipart';
      const uploadId = await client.createMultipart(multi);
      cleanup.push(multi);
      try {
        const etag = await client.uploadPart(multi, uploadId, 1, new Uint8Array([7]));
        const done = await client.completeMultipart(multi, uploadId, [{ partNumber: 1, etag }]);
        if (done.status >= 300) throw new DestinationError('rejected', 'S3 CompleteMultipartUpload was refused.');
      } catch (error) {
        await client.abortMultipart(multi, uploadId).catch(() => undefined);
        throw error;
      }
      const head = await client.head(multi);
      if (head === null || head.size !== 1) throw new DestinationError('mismatch', 'The multipart probe object has the wrong size.');
      report.multipart = true;

      step = 'delete';
      for (const key of cleanup.splice(0)) await client.delete(key);
      if ((await client.head(single)) !== null) throw new DestinationError('mismatch', 'The probe object was still present after it was deleted.');
      report.delete = true;
      const offset = await client.serverClockOffsetMs().catch(() => null);
      report.clockSkewSeconds = offset === null ? null : Math.round(offset / 1000);
      report.ok = true;
    } catch (error) {
      report.failedStep = step;
      report.reason = error instanceof DestinationError ? error.code : 'unavailable';
      for (const key of cleanup) await client.delete(key).catch(() => undefined);
    }
    report.latencyMs = Date.now() - started;
    return report;
  }

  return {
    id: definition.id,
    kind: 's3',
    label: definition.label,
    sink: () => sink,
    source: () => source,
    list,
    async stat(name) {
      assertObjectName(name);
      const head = await client.head(name);
      return head === null ? null : { name, size: head.size };
    },
    async deleteObject(name) {
      assertObjectName(name);
      await client.delete(name);
    },
    async replaceRepo(bytes) {
      // PutObject replaces atomically (a reader sees the old or the new object, never a mix) and is strongly consistent on S3, R2,
      // MinIO and B2. No `If-None-Match`: this is the one deliberate overwrite.
      await client.put(REPO_OBJECT_NAME, bytes);
      const head = await client.head(REPO_OBJECT_NAME);
      if (head === null || head.size !== bytes.length) throw new DestinationError('mismatch', 'The stored repository object does not have the size that was written.');
    },
    async probe(): Promise<DestinationProbe> {
      const report = await probeDetailed();
      return report.ok ? { ok: true, freeBytes: null } : { ok: false, reason: report.reason ?? 'unavailable' };
    },
    probeDetailed,
    async sweepIncomplete(maxAgeMs, now) {
      let removed = 0;
      for (const prefix of ['packs/', 'manifests/', PROBE_PREFIX]) {
        for (const upload of await client.listUploads(prefix)) {
          const isOurs = prefix === PROBE_PREFIX || BACKUP_OBJECT_NAME_PATTERN.test(upload.key);
          const mine = inFlight.get(upload.key)?.uploadId === upload.uploadId;
          if (!isOurs || mine || now - upload.initiated < maxAgeMs) continue;
          try { await client.abortMultipart(upload.key, upload.uploadId); removed += 1; } catch { /* the next sweep retries */ }
        }
      }
      return removed;
    },
  };
}
