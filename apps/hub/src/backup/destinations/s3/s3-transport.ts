import http from 'node:http';
import https from 'node:https';
import { DestinationError } from '../destination.js';
import { guardedLookup } from './endpoint-guard.js';
import type { EndpointPolicy, ResolveAll } from './endpoint-guard.js';

/**
 * The one place the S3 destination touches the network (Milestone 848). `S3Transport` is the seam the client and every spec use;
 * the production implementation is `node:http`/`node:https` rather than global `fetch`, because the endpoint guard has to see the
 * address a socket really connects to (`lookup` is pinned per connection, so DNS rebinding cannot swap it) and because streaming
 * upload and download backpressure and per-socket idle timeouts are first-class there.
 *
 * Rules: no redirect is ever followed (a 3xx is returned as-is and the client refuses it); no cookies; no proxy environment
 * variables are consulted; the body is a single buffer (at most one part), the response a stream the caller must consume or destroy.
 */
export interface S3TransportRequest {
  method: 'GET' | 'HEAD' | 'PUT' | 'POST' | 'DELETE';
  url: URL;
  headers: Record<string, string>;
  body?: Uint8Array;
  /** Socket inactivity limit (connect, request and response phases alike). */
  idleTimeoutMs: number;
  /** Hard limit from the start of the request to the end of the response body; absent for a streaming download. */
  deadlineMs?: number;
}

export interface S3TransportResponse {
  status: number;
  /** Lower-cased names. */
  headers: Record<string, string>;
  body: AsyncIterable<Uint8Array>;
  /** Releases the socket; safe to call after the body was consumed. */
  destroy(): void;
}

export type S3Transport = (request: S3TransportRequest) => Promise<S3TransportResponse>;

/** A transport failure the client may retry; `timeout` is distinct so the final error says so. */
export class TransportError extends Error {
  constructor(readonly kind: 'timeout' | 'network', cause?: unknown) {
    super(kind === 'timeout' ? 'The S3 request timed out.' : 'The S3 request failed on the network.');
    this.name = 'TransportError';
    if (cause !== undefined) this.cause = cause;
  }
}

export interface NodeTransportOptions {
  policy: EndpointPolicy;
  resolveAll?: ResolveAll;
}

export function createNodeTransport(options: NodeTransportOptions): S3Transport {
  const lookup = guardedLookup(options.policy, options.resolveAll);
  const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 4, maxFreeSockets: 2 });
  const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 4, maxFreeSockets: 2 });
  return (request) => new Promise<S3TransportResponse>((resolve, reject) => {
    const secure = request.url.protocol === 'https:';
    let settled = false;
    let deadline: NodeJS.Timeout | undefined;
    let deadlineHit = false;
    const fail = (error: unknown): void => {
      if (deadline !== undefined) clearTimeout(deadline);
      if (settled) return;
      settled = true;
      reject(error);
    };
    const headers: Record<string, string> = { ...request.headers, 'accept-encoding': 'identity' };
    if (request.body !== undefined) headers['content-length'] = String(request.body.length);
    const send = (secure ? https : http).request(request.url, {
      method: request.method, headers, agent: secure ? httpsAgent : httpAgent, lookup, timeout: request.idleTimeoutMs,
    }, (res) => {
      if (settled) { res.destroy(); return; }
      settled = true;
      const out: Record<string, string> = {};
      for (const [name, value] of Object.entries(res.headers)) if (value !== undefined) out[name] = Array.isArray(value) ? value.join(', ') : value;
      const dispose = (): void => { if (deadline !== undefined) clearTimeout(deadline); };
      res.once('close', dispose);
      resolve({
        status: res.statusCode ?? 0,
        headers: out,
        body: (async function* () {
          try {
            for await (const chunk of res) yield chunk as Uint8Array;
          } catch (error) {
            throw error instanceof DestinationError || error instanceof TransportError ? error : new TransportError(send.destroyed && deadlineHit ? 'timeout' : 'network', error);
          }
        })(),
        destroy: () => { dispose(); res.destroy(); },
      });
    });
    send.on('timeout', () => { deadlineHit = true; send.destroy(new TransportError('timeout')); });
    send.on('error', (error: unknown) => {
      if (error instanceof DestinationError) { fail(error); return; }
      fail(error instanceof TransportError ? error : new TransportError(deadlineHit ? 'timeout' : 'network', error));
    });
    if (request.deadlineMs !== undefined) deadline = setTimeout(() => { deadlineHit = true; send.destroy(new TransportError('timeout')); }, request.deadlineMs);
    send.end(request.body === undefined ? undefined : Buffer.from(request.body.buffer, request.body.byteOffset, request.body.byteLength));
  });
}

/** Reads a whole (small) response body, at most `maxBytes`, and releases the socket. */
export async function readBody(response: S3TransportResponse, maxBytes: number): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for await (const chunk of response.body) {
      total += chunk.length;
      if (total > maxBytes) throw new DestinationError('server', 'The S3 response was larger than expected.');
      chunks.push(chunk);
    }
  } finally {
    response.destroy();
  }
  return Buffer.concat(chunks);
}
