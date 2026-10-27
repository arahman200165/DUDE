import { createHash, createHmac } from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

/**
 * SPEC-ONLY (never imported by production code): an in-process fake S3 server on loopback http for the S3 destination specs
 * (Milestone 848). It implements path-style HeadObject, GetObject (Range, If-Match), PutObject (`If-None-Match: *`), the four
 * multipart calls, ListObjectsV2 and ListMultipartUploads with pagination, DeleteObject and HeadBucket, and it VERIFIES every
 * incoming SigV4 signature with its own canonicalization, written independently of `sigv4.ts` (it decodes and re-encodes the path
 * itself and rebuilds the signed-header block from the received headers), plus the body's SHA-256 against `x-amz-content-sha256`.
 * A request that does not verify is a 403 `SignatureDoesNotMatch` and is counted in `authFailures`, so a spec that passes proves
 * the client signs what it sends.
 *
 * Failure injection (`fail`): a status/code answer, a dropped connection, a hang, a truncated GET body, a wrong ETag on a write and
 * a cross-host redirect, each matched by a predicate, optionally after N matching requests and for a number of times.
 */
export interface FakeS3Options {
  accessKeyId?: string;
  secretAccessKey?: string;
  sessionToken?: string;
  bucket?: string;
  region?: string;
  /** What `If-None-Match: *` does: enforce (412), ignore (overwrite), or unsupported (501). */
  conditional?: 'enforce' | 'ignore' | 'unsupported';
  /** ListObjectsV2 / ListMultipartUploads page size. */
  pageSize?: number;
  /** The smallest non-last part CompleteMultipartUpload accepts (default 5 MiB). */
  minPartBytes?: number;
  /** The server clock (default `Date.now`). */
  now?: () => number;
}

export interface FakeRequest {
  method: string;
  path: string;
  query: Record<string, string>;
  headers: http.IncomingHttpHeaders;
  bodyLength: number;
}

export type FaultAction =
  | { kind: 'status'; status: number; code?: string; headers?: Record<string, string> }
  | { kind: 'drop' }
  | { kind: 'hang' }
  | { kind: 'truncate' }
  | { kind: 'wrong-etag' }
  | { kind: 'redirect'; location: string };

interface Fault {
  match: (request: FakeRequest) => boolean;
  action: FaultAction;
  after: number;
  times: number;
  seen: number;
}

interface StoredObject { bytes: Buffer; etag: string; modified: number }
interface Upload { key: string; initiated: number; parts: Map<number, { bytes: Buffer; etag: string }> }

const md5 = (bytes: Uint8Array): string => createHash('md5').update(bytes).digest('hex');
const sha256 = (bytes: Uint8Array | string): string => createHash('sha256').update(bytes).digest('hex');
const hmac = (key: Buffer | string, data: string): Buffer => createHmac('sha256', key).update(data).digest();
const xmlEscape = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const encodeSegment = (segment: string): string => encodeURIComponent(segment).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

export class FakeS3Server {
  readonly options: Required<Omit<FakeS3Options, 'sessionToken'>> & { sessionToken: string | undefined };
  readonly objects = new Map<string, StoredObject>();
  readonly uploads = new Map<string, Upload>();
  readonly requests: FakeRequest[] = [];
  authFailures = 0;
  private readonly faults: Fault[] = [];
  private readonly server: http.Server;
  private uploadCounter = 0;
  endpoint = '';

  constructor(options: FakeS3Options = {}) {
    this.options = {
      accessKeyId: options.accessKeyId ?? 'AKIAFAKEFAKEFAKE1234', secretAccessKey: options.secretAccessKey ?? 'fake/secret+key/for/the/spec/0123456789',
      sessionToken: options.sessionToken, bucket: options.bucket ?? 'backups', region: options.region ?? 'us-east-1',
      conditional: options.conditional ?? 'enforce', pageSize: options.pageSize ?? 1000, minPartBytes: options.minPartBytes ?? 5 * 1024 * 1024, now: options.now ?? Date.now,
    };
    this.server = http.createServer((req, res) => { void this.handle(req, res); });
  }

  async start(): Promise<string> {
    await new Promise<void>((resolve) => this.server.listen(0, '127.0.0.1', resolve));
    this.endpoint = `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`;
    return this.endpoint;
  }

  async close(): Promise<void> {
    this.server.closeAllConnections();
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }

  get credentials(): { accessKeyId: string; secretAccessKey: string; sessionToken?: string } {
    return { accessKeyId: this.options.accessKeyId, secretAccessKey: this.options.secretAccessKey, ...(this.options.sessionToken !== undefined ? { sessionToken: this.options.sessionToken } : {}) };
  }

  /** Injects a fault: the `after + 1`th matching request onward, `times` times. */
  fail(match: (request: FakeRequest) => boolean, action: FaultAction, times = 1, after = 0): void {
    this.faults.push({ match, action, after, times, seen: 0 });
  }

  clearFaults(): void { this.faults.length = 0; }

  /** Object keys (bucket-relative), sorted. */
  keys(): string[] { return [...this.objects.keys()].sort(); }

  count(predicate: (request: FakeRequest) => boolean): number { return this.requests.filter(predicate).length; }

  /** Independent SigV4 verification: returns an error text or null. */
  private verify(req: http.IncomingMessage, rawUrl: string, body: Buffer): string | null {
    const header = req.headers['authorization'];
    if (typeof header !== 'string') return 'missing authorization';
    const m = /^AWS4-HMAC-SHA256 Credential=([^/]+)\/(\d{8})\/([^/]+)\/s3\/aws4_request, SignedHeaders=([a-z0-9;-]+), Signature=([0-9a-f]{64})$/.exec(header);
    if (m === null) return 'malformed authorization';
    const [, accessKey, day, region, signedList, signature] = m as unknown as [string, string, string, string, string, string];
    if (accessKey !== this.options.accessKeyId) return 'unknown access key';
    if (region !== this.options.region) return 'wrong region';
    const stamp = req.headers['x-amz-date'];
    if (typeof stamp !== 'string' || !/^\d{8}T\d{6}Z$/.test(stamp) || stamp.slice(0, 8) !== day) return 'bad x-amz-date';
    const at = Date.UTC(+stamp.slice(0, 4), +stamp.slice(4, 6) - 1, +stamp.slice(6, 8), +stamp.slice(9, 11), +stamp.slice(11, 13), +stamp.slice(13, 15));
    if (Math.abs(at - this.options.now()) > 15 * 60_000) return 'RequestTimeTooSkewed';
    const signed = signedList.split(';');
    for (const required of ['host', 'x-amz-date', 'x-amz-content-sha256']) if (!signed.includes(required)) return `${required} not signed`;
    if (this.options.sessionToken !== undefined && (!signed.includes('x-amz-security-token') || req.headers['x-amz-security-token'] !== this.options.sessionToken)) return 'session token';
    for (const name of Object.keys(req.headers)) {
      // Everything the client sends that carries meaning must be signed (transport headers are exempt).
      if (!['authorization', 'content-length', 'connection', 'accept-encoding', 'user-agent', 'accept'].includes(name) && !signed.includes(name)) return `header ${name} not signed`;
    }
    const payload = req.headers['x-amz-content-sha256'];
    if (typeof payload !== 'string') return 'missing payload hash';
    if (payload !== 'UNSIGNED-PAYLOAD' && payload !== sha256(body)) return 'XAmzContentSHA256Mismatch';
    const [rawPath = '/', rawQuery = ''] = rawUrl.split('?', 2) as [string, string?];
    const canonicalPath = rawPath.split('/').map((segment) => encodeSegment(decodeURIComponent(segment))).join('/') || '/';
    const canonicalQuery = rawQuery === '' ? '' : rawQuery.split('&').map((pair) => {
      const eq = pair.indexOf('=');
      const name = decodeURIComponent(eq < 0 ? pair : pair.slice(0, eq));
      const value = decodeURIComponent(eq < 0 ? '' : pair.slice(eq + 1));
      return [encodeSegment(name), encodeSegment(value)] as const;
    }).sort((a, b) => (a[0] === b[0] ? (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0) : a[0] < b[0] ? -1 : 1)).map(([k, v]) => `${k}=${v}`).join('&');
    const headerBlock = signed.map((name) => `${name}:${String(req.headers[name] ?? '').trim().replace(/\s+/g, ' ')}\n`).join('');
    const canonical = `${req.method ?? ''}\n${canonicalPath}\n${canonicalQuery}\n${headerBlock}\n${signedList}\n${payload}`;
    const scope = `${day}/${region}/s3/aws4_request`;
    const toSign = `AWS4-HMAC-SHA256\n${stamp}\n${scope}\n${sha256(canonical)}`;
    const key = hmac(hmac(hmac(hmac(`AWS4${this.options.secretAccessKey}`, day), region), 's3'), 'aws4_request');
    return hmac(key, toSign).toString('hex') === signature ? null : 'SignatureDoesNotMatch';
  }

  private send(res: http.ServerResponse, status: number, body: string | Buffer = '', headers: Record<string, string> = {}): void {
    const payload = typeof body === 'string' ? Buffer.from(body) : body;
    res.writeHead(status, { date: new Date(this.options.now()).toUTCString(), 'content-length': String(payload.length), ...headers });
    res.end(res.req.method === 'HEAD' ? undefined : payload);
  }

  private error(res: http.ServerResponse, status: number, code: string, headers: Record<string, string> = {}): void {
    this.send(res, status, `<?xml version="1.0" encoding="UTF-8"?><Error><Code>${code}</Code><Message>fake ${code}</Message><RequestId>REQ</RequestId></Error>`, { 'content-type': 'application/xml', ...headers });
  }

  private async handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const body = Buffer.concat(chunks);
    const rawUrl = req.url ?? '/';
    const url = new URL(rawUrl, 'http://fake');
    const query: Record<string, string> = {};
    for (const [k, v] of url.searchParams) query[k] = v;
    const request: FakeRequest = { method: req.method ?? '', path: decodeURIComponent(url.pathname), query, headers: { ...req.headers, authorization: undefined }, bodyLength: body.length };
    this.requests.push(request);
    const problem = this.verify(req, rawUrl, body);
    if (problem !== null) {
      this.authFailures += 1;
      if (problem === 'RequestTimeTooSkewed') this.error(res, 403, 'RequestTimeTooSkewed');
      else if (problem === 'XAmzContentSHA256Mismatch') this.error(res, 400, 'XAmzContentSHA256Mismatch');
      else this.error(res, 403, 'SignatureDoesNotMatch');
      return;
    }
    let wrongEtag = false;
    for (const fault of this.faults) {
      if (fault.times <= 0 || !fault.match(request)) continue;
      fault.seen += 1;
      if (fault.seen <= fault.after) continue;
      fault.times -= 1;
      const { action } = fault;
      if (action.kind === 'status') { this.error(res, action.status, action.code ?? 'InternalError', action.headers); return; }
      if (action.kind === 'drop') { req.socket.destroy(); return; }
      if (action.kind === 'hang') return;
      if (action.kind === 'redirect') { this.send(res, 307, '', { location: action.location }); return; }
      if (action.kind === 'wrong-etag') wrongEtag = true;
      if (action.kind === 'truncate') { this.route(request, body, res, { truncate: true, wrongEtag: false }); return; }
      break;
    }
    this.route(request, body, res, { truncate: false, wrongEtag });
  }

  private route(request: FakeRequest, body: Buffer, res: http.ServerResponse, flags: { truncate: boolean; wrongEtag: boolean }): void {
    const segments = request.path.split('/').filter((s) => s.length > 0);
    const bucket = segments[0];
    if (bucket !== this.options.bucket) { this.error(res, 404, 'NoSuchBucket'); return; }
    const key = segments.slice(1).join('/');
    const q = request.query;
    const etagHeader = (etag: string): Record<string, string> => ({ etag: `"${flags.wrongEtag ? '0'.repeat(32) : etag}"` });

    if (key === '') {
      if (request.method === 'HEAD') { this.send(res, 200); return; }
      if (request.method === 'GET' && q['list-type'] === '2') { this.listObjects(q, res); return; }
      if (request.method === 'GET' && 'uploads' in q) { this.listUploads(q, res); return; }
      this.error(res, 400, 'InvalidRequest');
      return;
    }

    if (request.method === 'POST' && 'uploads' in q) {
      this.uploadCounter += 1;
      const id = `upload-${this.uploadCounter}-${sha256(key).slice(0, 8)}`;
      this.uploads.set(id, { key, initiated: this.options.now(), parts: new Map() });
      this.send(res, 200, `<InitiateMultipartUploadResult><Bucket>${bucket}</Bucket><Key>${xmlEscape(key)}</Key><UploadId>${id}</UploadId></InitiateMultipartUploadResult>`, { 'content-type': 'application/xml' });
      return;
    }
    if (request.method === 'PUT' && q['partNumber'] !== undefined && q['uploadId'] !== undefined) {
      const upload = this.uploads.get(q['uploadId']);
      if (upload === undefined || upload.key !== key) { this.error(res, 404, 'NoSuchUpload'); return; }
      const etag = md5(body);
      upload.parts.set(Number(q['partNumber']), { bytes: body, etag });
      this.send(res, 200, '', etagHeader(etag));
      return;
    }
    if (request.method === 'POST' && q['uploadId'] !== undefined) { this.complete(request, key, body, res); return; }
    if (request.method === 'DELETE' && q['uploadId'] !== undefined) {
      if (!this.uploads.delete(q['uploadId'])) { this.error(res, 404, 'NoSuchUpload'); return; }
      this.send(res, 204);
      return;
    }

    if (request.method === 'PUT') {
      const ifNoneMatch = request.headers['if-none-match'];
      if (ifNoneMatch !== undefined) {
        if (this.options.conditional === 'unsupported') { this.error(res, 501, 'NotImplemented'); return; }
        if (this.options.conditional === 'enforce' && ifNoneMatch === '*' && this.objects.has(key)) { this.error(res, 412, 'PreconditionFailed'); return; }
      }
      const etag = md5(body);
      this.objects.set(key, { bytes: body, etag, modified: this.options.now() });
      this.send(res, 200, '', etagHeader(etag));
      return;
    }
    if (request.method === 'DELETE') { this.objects.delete(key); this.send(res, 204); return; }

    const object = this.objects.get(key);
    if (request.method === 'HEAD') {
      if (object === undefined) { this.send(res, 404); return; }
      res.writeHead(200, { date: new Date(this.options.now()).toUTCString(), 'content-length': String(object.bytes.length), etag: `"${object.etag}"` });
      res.end();
      return;
    }
    if (request.method === 'GET') {
      if (object === undefined) { this.error(res, 404, 'NoSuchKey'); return; }
      const ifMatch = request.headers['if-match'];
      if (typeof ifMatch === 'string' && ifMatch.replace(/"/g, '') !== object.etag) { this.error(res, 412, 'PreconditionFailed'); return; }
      const range = /^bytes=(\d+)-$/.exec(String(request.headers['range'] ?? ''));
      let start = 0;
      let status = 200;
      const headers: Record<string, string> = { etag: `"${object.etag}"`, 'accept-ranges': 'bytes' };
      if (range !== null) {
        start = Number(range[1]);
        if (start >= object.bytes.length) { this.error(res, 416, 'InvalidRange'); return; }
        status = 206;
        headers['content-range'] = `bytes ${start}-${object.bytes.length - 1}/${object.bytes.length}`;
      }
      const slice = object.bytes.subarray(start);
      res.writeHead(status, { date: new Date(this.options.now()).toUTCString(), 'content-length': String(slice.length), ...headers });
      if (flags.truncate) {
        res.write(slice.subarray(0, Math.max(1, Math.floor(slice.length / 2))));
        setTimeout(() => res.socket?.destroy(), 5);
        return;
      }
      res.end(slice);
      return;
    }
    this.error(res, 400, 'InvalidRequest');
  }

  private complete(request: FakeRequest, key: string, body: Buffer, res: http.ServerResponse): void {
    const id = request.query['uploadId'] as string;
    const upload = this.uploads.get(id);
    if (upload === undefined || upload.key !== key) { this.error(res, 404, 'NoSuchUpload'); return; }
    const ifNoneMatch = request.headers['if-none-match'];
    if (ifNoneMatch !== undefined) {
      if (this.options.conditional === 'unsupported') { this.error(res, 501, 'NotImplemented'); return; }
      if (this.options.conditional === 'enforce' && ifNoneMatch === '*' && this.objects.has(key)) { this.error(res, 412, 'PreconditionFailed'); return; }
    }
    const requested = [...body.toString('utf8').matchAll(/<Part><PartNumber>(\d+)<\/PartNumber><ETag>([^<]*)<\/ETag><\/Part>/g)].map((m) => ({ n: Number(m[1]), etag: (m[2] as string).replace(/&quot;|"/g, '') }));
    if (requested.length === 0 || requested.some((p, i) => i > 0 && p.n <= (requested[i - 1] as { n: number }).n)) { this.error(res, 400, 'InvalidPartOrder'); return; }
    const pieces: Buffer[] = [];
    for (const [i, part] of requested.entries()) {
      const stored = upload.parts.get(part.n);
      if (stored === undefined || stored.etag !== part.etag) { this.error(res, 400, 'InvalidPart'); return; }
      if (i < requested.length - 1 && stored.bytes.length < this.options.minPartBytes) { this.error(res, 400, 'EntityTooSmall'); return; }
      pieces.push(stored.bytes);
    }
    const bytes = Buffer.concat(pieces);
    const etag = `${md5(Buffer.concat(requested.map((p) => Buffer.from((upload.parts.get(p.n) as { etag: string }).etag, 'hex'))))}-${requested.length}`;
    this.objects.set(key, { bytes, etag, modified: this.options.now() });
    this.uploads.delete(id);
    this.send(res, 200, `<CompleteMultipartUploadResult><Bucket>${this.options.bucket}</Bucket><Key>${xmlEscape(key)}</Key><ETag>&quot;${etag}&quot;</ETag></CompleteMultipartUploadResult>`, { 'content-type': 'application/xml' });
  }

  private listObjects(q: Record<string, string>, res: http.ServerResponse): void {
    const prefix = q['prefix'] ?? '';
    const keys = [...this.objects.keys()].filter((k) => k.startsWith(prefix)).sort();
    const from = q['continuation-token'] === undefined ? 0 : Number(Buffer.from(q['continuation-token'], 'base64url').toString('utf8'));
    const page = keys.slice(from, from + this.options.pageSize);
    const truncated = from + page.length < keys.length;
    const contents = page.map((k) => `<Contents><Key>${xmlEscape(k)}</Key><Size>${(this.objects.get(k) as StoredObject).bytes.length}</Size></Contents>`).join('');
    const next = truncated ? `<NextContinuationToken>${Buffer.from(String(from + page.length)).toString('base64url')}</NextContinuationToken>` : '';
    this.send(res, 200, `<ListBucketResult><Name>${this.options.bucket}</Name><KeyCount>${page.length}</KeyCount><IsTruncated>${truncated}</IsTruncated>${contents}${next}</ListBucketResult>`, { 'content-type': 'application/xml' });
  }

  private listUploads(q: Record<string, string>, res: http.ServerResponse): void {
    const prefix = q['prefix'] ?? '';
    const all = [...this.uploads.entries()].filter(([, u]) => u.key.startsWith(prefix)).sort(([a], [b]) => (a < b ? -1 : 1));
    const from = q['upload-id-marker'] === undefined ? 0 : all.findIndex(([id]) => id === q['upload-id-marker']) + 1;
    const page = all.slice(from, from + this.options.pageSize);
    const truncated = from + page.length < all.length;
    const items = page.map(([id, u]) => `<Upload><Key>${xmlEscape(u.key)}</Key><UploadId>${id}</UploadId><Initiated>${new Date(u.initiated).toISOString()}</Initiated></Upload>`).join('');
    const last = page[page.length - 1];
    const next = truncated && last !== undefined ? `<NextKeyMarker>${xmlEscape(last[1].key)}</NextKeyMarker><NextUploadIdMarker>${last[0]}</NextUploadIdMarker>` : '';
    this.send(res, 200, `<ListMultipartUploadsResult><IsTruncated>${truncated}</IsTruncated>${next}${items}</ListMultipartUploadsResult>`, { 'content-type': 'application/xml' });
  }
}
