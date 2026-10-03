import { createHash, X509Certificate } from 'node:crypto';
import https from 'node:https';
import { isIP } from 'node:net';
import { connect as tlsConnect } from 'node:tls';
import type { Duplex } from 'node:stream';
import type { TLSSocket } from 'node:tls';
import type { HubRequest, HubResponse, HubTransport } from '@dude/api-client';

export const HUB_REQUEST_TIMEOUT_MS = 15_000;
export const HUB_MAX_RESPONSE_BYTES = 1024 * 1024;
/** Error `code` set when the presented certificate's SPKI is not one of the pins. */
export const PIN_MISMATCH_CODE = 'DUDE_PIN_MISMATCH';

/** base64url SHA-256 of the DER SubjectPublicKeyInfo of a certificate (DER bytes or PEM text). */
export function spkiSha256Of(cert: Uint8Array | string): string {
  const x509 = new X509Certificate(typeof cert === 'string' ? cert : Buffer.from(cert));
  const der = x509.publicKey.export({ type: 'spki', format: 'der' });
  return createHash('sha256').update(der).digest('base64url');
}

export interface PinnedTarget {
  host: string;
  port: number;
  /** Unused for verification (the SPKI pin is the only identity check); callers may still pass it. */
  ca?: readonly string[];
  /** Accepted SPKI pins (base64url SHA-256). */
  pins: readonly string[];
  /** Called with the SPKI of every certificate that passed the pin check (before any byte is written). */
  onPeerSpki?: (spki: string) => void;
}

export const unbracketHost = (host: string): string => (host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host);

export class HubTransportError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'HubTransportError';
  }
}

/**
 * Opens a TLS socket whose ONLY identity check is the SPKI pin. Chain and hostname verification are off (the Hub's
 * certificate is self-signed and some TLS stacks, e.g. BoringSSL in Electron-as-Node, refuse it as a trust anchor); the
 * leaf's SPKI is compared against `target.pins` on `secureConnect`, and the socket is only handed to the caller after
 * that passes, so no application byte can reach an unverified peer.
 */
export function connectPinned(target: PinnedTarget, timeoutMs = HUB_REQUEST_TIMEOUT_MS): Promise<TLSSocket> {
  return new Promise<TLSSocket>((resolve, reject) => {
    const host = unbracketHost(target.host);
    let settled = false;
    const finish = (socket: TLSSocket | null, error?: Error): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) { socket?.destroy(); reject(error); } else if (socket) { socket.setTimeout(0); resolve(socket); }
    };
    const socket = tlsConnect({
      host, port: target.port,
      // SNI must be a DNS name; never an IP literal.
      servername: isIP(host) === 0 ? host : '',
      rejectUnauthorized: false,
      ALPNProtocols: ['http/1.1'],
    });
    const timer = setTimeout(() => finish(socket, new HubTransportError('timeout', 'The Hub did not answer in time.')), timeoutMs);
    socket.once('error', (error) => finish(socket, error));
    socket.once('secureConnect', () => {
      let spki: string;
      try {
        spki = spkiSha256Of(socket.getPeerCertificate().raw);
      } catch {
        finish(socket, Object.assign(new Error('The Hub certificate could not be read.'), { code: PIN_MISMATCH_CODE }));
        return;
      }
      if (!target.pins.includes(spki)) {
        finish(socket, Object.assign(new Error('The Hub certificate does not match the pinned key.'), { code: PIN_MISMATCH_CODE }));
        return;
      }
      try {
        target.onPeerSpki?.(spki);
      } catch (error) {
        finish(socket, error instanceof Error ? error : new Error(String(error)));
        return;
      }
      finish(socket);
    });
  });
}

/**
 * Connection options shared by the HTTPS transport and the WebSocket client (`ws` forwards them to `https.request`).
 * `createConnection` hands the request an already pin-verified socket (async callback form). Do NOT combine with
 * `agent: false`: Node then ignores `createConnection`.
 */
export function pinnedConnectOptions(target: PinnedTarget, timeoutMs = HUB_REQUEST_TIMEOUT_MS): {
  createConnection: (options: unknown, cb: (error: Error | null, socket: Duplex) => void) => undefined;
} {
  return {
    createConnection: (_options, cb) => {
      connectPinned(target, timeoutMs).then((socket) => cb(null, socket), (error: Error) => cb(error, undefined as never));
      return undefined;
    },
  };
}

/** A `HubTransport` over node:https with certificate pinning, a 15 s timeout, a 1 MiB cap and JSON-only bodies. */
export function createPinnedTransport(target: PinnedTarget, timeoutMs = HUB_REQUEST_TIMEOUT_MS): HubTransport {
  const conn = pinnedConnectOptions(target, timeoutMs);
  const host = unbracketHost(target.host);
  return {
    request: (req: HubRequest): Promise<HubResponse> =>
      new Promise<HubResponse>((resolve, reject) => {
        const payload = req.body === undefined ? undefined : Buffer.from(JSON.stringify(req.body), 'utf8');
        const headers: Record<string, string> = { accept: 'application/json', ...req.headers };
        if (payload) { headers['content-type'] = 'application/json'; headers['content-length'] = String(payload.length); }
        const request = https.request(
          { host, port: target.port, method: req.method, path: req.path, headers, ...conn },
          (res) => {
            const chunks: Buffer[] = [];
            let size = 0;
            res.on('data', (chunk: Buffer) => {
              size += chunk.length;
              if (size > HUB_MAX_RESPONSE_BYTES) { request.destroy(new HubTransportError('too-large', 'The Hub response is too large.')); return; }
              chunks.push(chunk);
            });
            res.on('error', reject);
            res.on('end', () => {
              const text = Buffer.concat(chunks).toString('utf8');
              const type = String(res.headers['content-type'] ?? '');
              let body: unknown = null;
              if (text.length > 0) {
                if (!/^application\/json\b/i.test(type)) { reject(new HubTransportError('not-json', 'The Hub returned a non-JSON response.')); return; }
                try { body = JSON.parse(text); } catch { reject(new HubTransportError('not-json', 'The Hub returned invalid JSON.')); return; }
              }
              const out: Record<string, string> = {};
              for (const [k, v] of Object.entries(res.headers)) {
                if (typeof v === 'string') out[k] = v;
                else if (Array.isArray(v)) out[k] = v.join('\n'); // set-cookie: one cookie per line
              }
              resolve({ status: res.statusCode ?? 0, headers: out, body });
            });
          },
        );
        request.setTimeout(timeoutMs, () => request.destroy(new HubTransportError('timeout', 'The Hub did not answer in time.')));
        request.on('error', reject);
        request.end(payload);
      }),
  };
}
