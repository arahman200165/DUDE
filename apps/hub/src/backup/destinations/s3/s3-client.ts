import { createHash } from 'node:crypto';
import { parseS3Endpoint, parseS3Prefix } from '../../../config/hub-config.js';
import { DestinationError } from '../destination.js';
import type { DestinationErrorCode } from '../destination.js';
import { assertHostAllowed } from './endpoint-guard.js';
import type { ResolveAll } from './endpoint-guard.js';
import { sha256Hex, signRequest, uriEncode, EMPTY_PAYLOAD_SHA256 } from './sigv4.js';
import type { SigV4Credentials } from './sigv4.js';
import { completeMultipartXml, parseErrorBody, parseListMultipartUploads, parseListObjectsV2, xmlText } from './s3-xml.js';
import type { ListedObject, ListedUpload } from './s3-xml.js';
import { TransportError, createNodeTransport, readBody } from './s3-transport.js';
import type { S3Transport, S3TransportResponse } from './s3-transport.js';

/**
 * A minimal, dependency-free S3 client (32-SS1, Milestone 848, PD-150): exactly the operations the backup destination needs
 * (HeadObject, GetObject with Range, PutObject, the four multipart calls, ListObjectsV2, ListMultipartUploads, DeleteObject), SigV4
 * header authentication (`sigv4.ts`) and the endpoint guard. It never logs and never puts a URL, a header or a credential in an error.
 *
 * - Addressing: path-style (`https://host/bucket/key`) or virtual-hosted (`https://bucket.host/key`). `forcePathStyle` defaults to
 *   virtual-hosted for `*.amazonaws.com` and path-style for any other endpoint (MinIO, R2, B2 and most gateways).
 * - Payload integrity: a request body is hashed with SHA-256 and the hash is sent AND signed as `x-amz-content-sha256` (never
 *   `UNSIGNED-PAYLOAD`), so the provider rejects a body altered in flight. The client buffers at most ONE part (the caller's
 *   bound) to hash it. Where the response ETag is a plain MD5 (not SSE-KMS/SSE-C, not a multipart ETag, not a SHA-1-style value) it
 *   is compared with the MD5 of the part and a mismatch is `mismatch` after bounded retries. The end-to-end guarantee does not
 *   rest on the provider at all: every backup chunk is authenticated by the backup format and verify-on-write reads it back.
 * - Retries: exponential backoff with jitter on network errors, timeouts, 408, 429 and 5xx, for the idempotent calls only (every
 *   call here is: a part or object is rewritten byte for byte). `PutObject`/`CompleteMultipartUpload` with `If-None-Match: *`
 *   that fail with an ambiguous first attempt report `retried` so the caller can tell its own success from a conflict.
 * - Clock skew: a `RequestTimeTooSkewed` answer teaches the client the server's clock from the `Date` header and retries once.
 * - Redirects are never followed (a 3xx is `bad-endpoint`); the address check runs per connection (`endpoint-guard.ts`).
 */
export interface S3ClientOptions {
  endpoint: string;
  region: string;
  bucket: string;
  prefix?: string | undefined;
  forcePathStyle?: boolean | undefined;
  allowPrivateNetwork?: boolean | undefined;
  credentials: SigV4Credentials;
  /** Test seams. */
  transport?: S3Transport;
  resolveAll?: ResolveAll;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  retry?: { attempts: number; baseMs: number; maxMs: number };
  idleTimeoutMs?: number;
  /** Hard limit for one buffered request (a part upload, a list). */
  requestDeadlineMs?: number;
}

export interface HeadResult { size: number; etag: string | undefined }

export interface GetResult {
  status: number;
  /** The object's total size when the response says so. */
  total: number | undefined;
  etag: string | undefined;
  body: AsyncIterable<Uint8Array>;
  destroy(): void;
}

export interface PutResult { etag: string | undefined; retried: boolean }

interface RequestSpec {
  op: string;
  method: 'GET' | 'HEAD' | 'PUT' | 'POST' | 'DELETE';
  /** The bucket-relative object key, or undefined for a bucket-level call. */
  key?: string;
  query?: Array<[string, string]>;
  headers?: Record<string, string>;
  body?: Uint8Array;
  /** Statuses returned to the caller rather than thrown (besides every 2xx). */
  passthrough?: number[];
  /** Keep the response body open (a download). */
  stream?: boolean;
}

interface RequestResult {
  status: number;
  headers: Record<string, string>;
  response: S3TransportResponse;
  /** An earlier attempt ended without a definite answer. */
  retried: boolean;
}

const RETRY_STATUSES = new Set([408, 429, 500, 502, 503, 504]);
const RETRY_CODES = new Set(['SlowDown', 'RequestTimeout', 'InternalError', 'ServiceUnavailable', 'RequestTimeoutException', 'Throttling', 'ThrottlingException']);
const AUTH_CODES = new Set(['AccessDenied', 'InvalidAccessKeyId', 'SignatureDoesNotMatch', 'ExpiredToken', 'InvalidToken', 'TokenRefreshRequired', 'AccountProblem', 'InvalidSecurity', 'AuthorizationHeaderMalformed', 'RequestTimeTooSkewed', 'RequestExpired']);
const MAX_ERROR_BODY = 64 * 1024;
const DEFAULT_RETRY = { attempts: 5, baseMs: 250, maxMs: 8000 };
const MD5_HEX = /^[0-9a-f]{32}$/;

export const normalizeEtag = (etag: string | undefined): string | undefined => etag?.replace(/^W\//, '').replace(/^"|"$/g, '');

const isAwsHost = (hostname: string): boolean => /(^|\.)amazonaws\.com(\.cn)?$/i.test(hostname);

export class S3Client {
  readonly bucket: string;
  readonly prefix: string | undefined;
  readonly region: string;
  private readonly origin: URL;
  private readonly virtualHosted: boolean;
  private readonly credentials: SigV4Credentials;
  private readonly transport: S3Transport;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly random: () => number;
  private readonly retry: { attempts: number; baseMs: number; maxMs: number };
  private readonly idleTimeoutMs: number;
  private readonly requestDeadlineMs: number;
  /** Server clock minus local clock, learned from a `RequestTimeTooSkewed` answer. */
  skewMs = 0;

  constructor(options: S3ClientOptions) {
    const allowPrivate = options.allowPrivateNetwork === true;
    const endpoint = parseS3Endpoint(options.endpoint, allowPrivate);
    if ('error' in endpoint) throw new DestinationError('bad-endpoint', `The S3 endpoint ${endpoint.error}.`);
    this.origin = new URL(endpoint.origin);
    assertHostAllowed(this.origin.hostname, { allowPrivateNetwork: allowPrivate });
    const prefix = parseS3Prefix(options.prefix);
    if ('error' in prefix) throw new DestinationError('bad-endpoint', `The S3 prefix ${prefix.error}.`);
    this.prefix = prefix.prefix;
    this.bucket = options.bucket;
    this.region = options.region;
    const literalHost = /^[\d.]+$/.test(this.origin.hostname) || this.origin.hostname.startsWith('[');
    this.virtualHosted = !literalHost && (options.forcePathStyle === undefined ? isAwsHost(this.origin.hostname) : !options.forcePathStyle);
    this.credentials = options.credentials;
    this.transport = options.transport ?? createNodeTransport({ policy: { allowPrivateNetwork: allowPrivate }, ...(options.resolveAll !== undefined ? { resolveAll: options.resolveAll } : {}) });
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.random = options.random ?? Math.random;
    this.retry = options.retry ?? DEFAULT_RETRY;
    this.idleTimeoutMs = options.idleTimeoutMs ?? 30_000;
    this.requestDeadlineMs = options.requestDeadlineMs ?? 10 * 60_000;
  }

  get addressing(): 'path' | 'virtual-hosted' {
    return this.virtualHosted ? 'virtual-hosted' : 'path';
  }

  /** The bucket-relative key of a repository-relative name. */
  keyOf(name: string): string {
    return this.prefix === undefined ? name : `${this.prefix}/${name}`;
  }

  private urlFor(key: string | undefined, query: Array<[string, string]>): URL {
    const host = this.virtualHosted ? `${this.bucket}.${this.origin.host}` : this.origin.host;
    const base = this.virtualHosted ? '' : `/${this.bucket}`;
    const path = key === undefined ? (this.virtualHosted ? '/' : base) : `${base}/${uriEncode(key, true)}`;
    const search = query.length === 0 ? '' : `?${query.map(([k, v]) => (v === '' ? `${uriEncode(k)}=` : `${uriEncode(k)}=${uriEncode(v)}`)).join('&')}`;
    return new URL(`${this.origin.protocol}//${host}${path}${search}`);
  }

  private codeOf(status: number, errorCode: string | undefined, retried: boolean): DestinationErrorCode {
    if (status >= 300 && status < 400) return 'bad-endpoint';
    if (errorCode !== undefined && AUTH_CODES.has(errorCode)) return 'auth';
    if (status === 401 || status === 403) return 'auth';
    if (status === 404) return 'bad-endpoint'; // NoSuchBucket (an object 404 is passed through by the callers that expect one)
    if (status === 429 || errorCode === 'SlowDown') return 'throttled';
    if (status === 408) return 'timeout';
    if (status >= 500) return 'server';
    void retried;
    return 'rejected';
  }

  /** One logical request: signs, sends, retries and maps errors. The caller owns (consumes or destroys) the response body. */
  private async request(spec: RequestSpec): Promise<RequestResult> {
    const payloadSha256 = spec.body === undefined ? EMPTY_PAYLOAD_SHA256 : sha256Hex(spec.body);
    const url = this.urlFor(spec.key, spec.query ?? []);
    let retried = false;
    let skewCorrected = false;
    let lastCode: DestinationErrorCode = 'network';
    let lastStatus = 0;
    let lastS3Code: string | undefined;
    const attempts = this.retry.attempts;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const signed = signRequest({
        method: spec.method, url, headers: spec.headers ?? {}, payloadSha256, region: this.region, credentials: this.credentials, date: new Date(this.now() + this.skewMs),
      });
      let response: S3TransportResponse;
      try {
        response = await this.transport({
          method: spec.method, url, headers: signed.headers, ...(spec.body !== undefined ? { body: spec.body } : {}), idleTimeoutMs: this.idleTimeoutMs,
          ...(spec.stream === true ? {} : { deadlineMs: this.requestDeadlineMs }),
        });
      } catch (error) {
        if (error instanceof DestinationError) throw error;
        lastCode = error instanceof TransportError && error.kind === 'timeout' ? 'timeout' : 'network';
        lastStatus = 0;
        lastS3Code = undefined;
        retried = true;
        await this.backoff(attempt, undefined);
        continue;
      }
      const status = response.status;
      if (status >= 200 && status < 300) return { status, headers: response.headers, response, retried };
      if (spec.passthrough?.includes(status) === true) return { status, headers: response.headers, response, retried };
      let errorCode: string | undefined;
      if (spec.method !== 'HEAD') {
        try { errorCode = parseErrorBody(Buffer.from(await readBody(response, MAX_ERROR_BODY)).toString('utf8')).code; } catch { response.destroy(); }
      } else {
        response.destroy();
      }
      if (errorCode === 'RequestTimeTooSkewed' && !skewCorrected) {
        const serverDate = Date.parse(response.headers['date'] ?? '');
        if (!Number.isNaN(serverDate)) {
          this.skewMs = serverDate - this.now();
          skewCorrected = true;
          continue;
        }
      }
      lastStatus = status;
      lastS3Code = errorCode;
      lastCode = this.codeOf(status, errorCode, retried);
      if (RETRY_STATUSES.has(status) || (errorCode !== undefined && RETRY_CODES.has(errorCode))) {
        retried = true;
        const retryAfter = Number(response.headers['retry-after']);
        await this.backoff(attempt, Number.isFinite(retryAfter) ? retryAfter * 1000 : undefined);
        continue;
      }
      break;
    }
    const detail = lastStatus === 0 ? lastCode : `${lastStatus}${lastS3Code !== undefined ? ` ${lastS3Code}` : ''}`;
    const hint = lastS3Code === 'RequestTimeTooSkewed' ? ' The Hub clock differs from the provider by more than 15 minutes.' : '';
    throw new DestinationError(lastCode, `S3 ${spec.op} failed (${detail}).${hint}`);
  }

  private async backoff(attempt: number, retryAfterMs: number | undefined): Promise<void> {
    if (attempt + 1 >= this.retry.attempts) return;
    const exp = Math.min(this.retry.maxMs, this.retry.baseMs * 2 ** attempt);
    const wait = retryAfterMs !== undefined ? Math.min(this.retry.maxMs, retryAfterMs) : Math.round(exp * (0.5 + this.random() / 2));
    await this.sleep(wait);
  }

  async head(name: string): Promise<HeadResult | null> {
    const res = await this.request({ op: 'HeadObject', method: 'HEAD', key: this.keyOf(name), passthrough: [404] });
    res.response.destroy();
    if (res.status === 404) return null;
    const size = Number(res.headers['content-length']);
    if (!Number.isSafeInteger(size) || size < 0) throw new DestinationError('server', 'S3 HeadObject returned no usable size.');
    return { size, etag: normalizeEtag(res.headers['etag']) };
  }

  /** Streams an object from `start`; null when it does not exist. The caller consumes or destroys the body. */
  async get(name: string, start: number, ifMatch?: string): Promise<GetResult | null> {
    const headers: Record<string, string> = {};
    if (start > 0) headers['range'] = `bytes=${start}-`;
    if (ifMatch !== undefined) headers['if-match'] = `"${ifMatch}"`;
    const res = await this.request({ op: 'GetObject', method: 'GET', key: this.keyOf(name), headers, passthrough: [404, 416], stream: true });
    if (res.status === 404) { res.response.destroy(); return null; }
    if (res.status === 416) { res.response.destroy(); return { status: 416, total: undefined, etag: undefined, body: (async function* () { /* empty */ })(), destroy: () => undefined }; }
    const range = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(res.headers['content-range'] ?? '');
    const length = Number(res.headers['content-length']);
    let total: number | undefined;
    if (range !== null) total = Number(range[3]);
    else if (res.status === 200 && Number.isSafeInteger(length)) total = length;
    if (start > 0 && res.status !== 206) {
      res.response.destroy();
      throw new DestinationError('rejected', 'The S3 endpoint ignored a Range request.');
    }
    if (res.status === 206 && range !== null && Number(range[1]) !== start) {
      res.response.destroy();
      throw new DestinationError('mismatch', 'The S3 endpoint answered a different range than requested.');
    }
    return { status: res.status, total, etag: normalizeEtag(res.headers['etag']), body: res.response.body, destroy: () => res.response.destroy() };
  }

  private checkEtag(op: string, body: Uint8Array, headers: Record<string, string>): string | undefined {
    const etag = normalizeEtag(headers['etag']);
    const sse = headers['x-amz-server-side-encryption'];
    if (etag !== undefined && MD5_HEX.test(etag) && (sse === undefined || sse === 'AES256')) {
      if (createHash('md5').update(body).digest('hex') !== etag) throw new DestinationError('mismatch', `S3 ${op} returned an ETag that does not match the uploaded bytes.`);
    }
    return etag;
  }

  /** Uploads a buffer, retrying the whole upload when the returned ETag disagrees with the bytes (at most three times). */
  private async upload(spec: RequestSpec & { body: Uint8Array }): Promise<{ etag: string | undefined; status: number; retried: boolean }> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const res = await this.request(spec);
      res.response.destroy();
      if (res.status >= 300) return { etag: undefined, status: res.status, retried: res.retried || attempt > 0 };
      try {
        return { etag: this.checkEtag(spec.op, spec.body, res.headers), status: res.status, retried: res.retried || attempt > 0 };
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError;
  }

  /** PutObject. With `ifNoneMatch` a 412 (the object exists) is returned as `status 412`, not thrown. */
  async put(name: string, body: Uint8Array, options: { ifNoneMatch?: boolean } = {}): Promise<PutResult & { status: number }> {
    const headers: Record<string, string> = { 'content-type': 'application/octet-stream' };
    if (options.ifNoneMatch === true) headers['if-none-match'] = '*';
    const out = await this.upload({ op: 'PutObject', method: 'PUT', key: this.keyOf(name), headers, body, passthrough: options.ifNoneMatch === true ? [412, 409, 501] : [] });
    return { etag: out.etag, retried: out.retried, status: out.status };
  }

  async createMultipart(name: string): Promise<string> {
    const res = await this.request({ op: 'CreateMultipartUpload', method: 'POST', key: this.keyOf(name), query: [['uploads', '']], headers: { 'content-type': 'application/octet-stream' } });
    const uploadId = xmlText(Buffer.from(await readBody(res.response, MAX_ERROR_BODY)).toString('utf8'), 'UploadId');
    if (uploadId === undefined || uploadId.length === 0 || uploadId.length > 1024) throw new DestinationError('server', 'S3 CreateMultipartUpload returned no upload id.');
    return uploadId;
  }

  async uploadPart(name: string, uploadId: string, partNumber: number, body: Uint8Array): Promise<string> {
    const out = await this.upload({ op: 'UploadPart', method: 'PUT', key: this.keyOf(name), query: [['partNumber', String(partNumber)], ['uploadId', uploadId]], body });
    if (out.etag === undefined) throw new DestinationError('server', 'S3 UploadPart returned no ETag.');
    return out.etag;
  }

  /** CompleteMultipartUpload. S3 can answer 200 with an `<Error>` body; that is treated as a failure. */
  async completeMultipart(name: string, uploadId: string, parts: Array<{ partNumber: number; etag: string }>, options: { ifNoneMatch?: boolean } = {}): Promise<{ status: number; retried: boolean }> {
    const headers: Record<string, string> = { 'content-type': 'application/xml' };
    if (options.ifNoneMatch === true) headers['if-none-match'] = '*';
    const body = Buffer.from(completeMultipartXml(parts), 'utf8');
    const res = await this.request({
      op: 'CompleteMultipartUpload', method: 'POST', key: this.keyOf(name), query: [['uploadId', uploadId]], headers, body,
      passthrough: options.ifNoneMatch === true ? [412, 409, 404, 501] : [404],
    });
    const text = Buffer.from(await readBody(res.response, MAX_ERROR_BODY)).toString('utf8');
    if (res.status === 200 && /<Error[\s>]/.test(text)) {
      const code = parseErrorBody(text).code;
      throw new DestinationError(code !== undefined && AUTH_CODES.has(code) ? 'auth' : 'server', `S3 CompleteMultipartUpload failed (200 ${code ?? 'Error'}).`);
    }
    return { status: res.status, retried: res.retried };
  }

  async abortMultipart(name: string, uploadId: string): Promise<void> {
    const res = await this.request({ op: 'AbortMultipartUpload', method: 'DELETE', key: this.keyOf(name), query: [['uploadId', uploadId]], passthrough: [404] });
    res.response.destroy();
  }

  async delete(name: string): Promise<void> {
    const res = await this.request({ op: 'DeleteObject', method: 'DELETE', key: this.keyOf(name), passthrough: [404] });
    res.response.destroy();
  }

  /** Every object whose repository-relative name starts with `namePrefix`, following continuation tokens. Names are repository-relative. */
  async list(namePrefix: string): Promise<ListedObject[]> {
    const out: ListedObject[] = [];
    const strip = this.prefix === undefined ? 0 : this.prefix.length + 1;
    let token: string | undefined;
    for (let page = 0; page < 100_000; page += 1) {
      const query: Array<[string, string]> = [['list-type', '2'], ['prefix', this.keyOf(namePrefix)]];
      if (token !== undefined) query.push(['continuation-token', token]);
      const res = await this.request({ op: 'ListObjectsV2', method: 'GET', query });
      const parsed = parseListObjectsV2(Buffer.from(await readBody(res.response, 8 * 1024 * 1024)).toString('utf8'));
      for (const object of parsed.objects) out.push({ key: object.key.slice(strip), size: object.size });
      if (!parsed.truncated) return out;
      if (parsed.nextToken === undefined || parsed.nextToken === token) throw new DestinationError('server', 'S3 ListObjectsV2 pagination did not advance.');
      token = parsed.nextToken;
    }
    throw new DestinationError('server', 'S3 ListObjectsV2 returned too many pages.');
  }

  /** In-progress multipart uploads under `namePrefix` (names repository-relative). */
  async listUploads(namePrefix: string): Promise<ListedUpload[]> {
    const out: ListedUpload[] = [];
    const strip = this.prefix === undefined ? 0 : this.prefix.length + 1;
    let keyMarker: string | undefined;
    let uploadIdMarker: string | undefined;
    for (let page = 0; page < 10_000; page += 1) {
      const query: Array<[string, string]> = [['uploads', ''], ['prefix', this.keyOf(namePrefix)]];
      if (keyMarker !== undefined) query.push(['key-marker', keyMarker]);
      if (uploadIdMarker !== undefined) query.push(['upload-id-marker', uploadIdMarker]);
      const res = await this.request({ op: 'ListMultipartUploads', method: 'GET', query });
      const parsed = parseListMultipartUploads(Buffer.from(await readBody(res.response, 8 * 1024 * 1024)).toString('utf8'));
      for (const upload of parsed.uploads) out.push({ ...upload, key: upload.key.slice(strip) });
      if (!parsed.truncated) return out;
      if (parsed.nextKeyMarker === undefined || (parsed.nextKeyMarker === keyMarker && parsed.nextUploadIdMarker === uploadIdMarker)) throw new DestinationError('server', 'S3 ListMultipartUploads pagination did not advance.');
      keyMarker = parsed.nextKeyMarker;
      uploadIdMarker = parsed.nextUploadIdMarker;
    }
    throw new DestinationError('server', 'S3 ListMultipartUploads returned too many pages.');
  }

  /** The provider's clock minus ours from the `Date` header of a cheap request (the probe reports it); null when unavailable. */
  async serverClockOffsetMs(): Promise<number | null> {
    const res = await this.request({ op: 'HeadBucket', method: 'HEAD', passthrough: [301, 403, 404] });
    res.response.destroy();
    const date = Date.parse(res.headers['date'] ?? '');
    return Number.isNaN(date) ? null : date - this.now();
  }
}
