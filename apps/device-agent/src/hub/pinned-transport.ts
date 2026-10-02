import { createHash, X509Certificate } from 'node:crypto';
import https from 'node:https';
import { isIP } from 'node:net';
import type { PeerCertificate } from 'node:tls';
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
  /** Trust anchors: the active certificate and, during rotation, the next one. */
  ca: readonly string[];
  /** Accepted SPKI pins (base64url SHA-256). */
  pins: readonly string[];
  /** Called with the SPKI of every certificate that passed the pin check (before the request is sent). */
  onPeerSpki?: (spki: string) => void;
}

export const unbracketHost = (host: string): string => (host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host);

/**
 * TLS options shared by the HTTPS transport and the WebSocket: the chain must verify against `ca` and the presented
 * leaf's SPKI must be pinned. Hostname matching is deliberately ignored (the pin is the identity), so a Hub reached by IP
 * or a LAN name works. `rejectUnauthorized` stays true.
 */
export function pinnedTlsOptions(target: PinnedTarget): {
  ca: string[]; servername: string; rejectUnauthorized: true; checkServerIdentity: (host: string, cert: PeerCertificate) => Error | undefined;
} {
  const host = unbracketHost(target.host);
  return {
    ca: [...target.ca],
    // SNI must be a DNS name; never an IP literal.
    servername: isIP(host) === 0 ? host : '',
    rejectUnauthorized: true,
    checkServerIdentity: (_host, cert) => {
      let spki: string;
      try {
        spki = spkiSha256Of(cert.raw);
      } catch {
        return Object.assign(new Error('The Hub certificate could not be read.'), { code: PIN_MISMATCH_CODE });
      }
      if (!target.pins.includes(spki)) {
        return Object.assign(new Error('The Hub certificate does not match the pinned key.'), { code: PIN_MISMATCH_CODE });
      }
      target.onPeerSpki?.(spki);
      return undefined;
    },
  };
}

export class HubTransportError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'HubTransportError';
  }
}

/** A `HubTransport` over node:https with certificate pinning, a 15 s timeout, a 1 MiB cap and JSON-only bodies. */
export function createPinnedTransport(target: PinnedTarget, timeoutMs = HUB_REQUEST_TIMEOUT_MS): HubTransport {
  const tls = pinnedTlsOptions(target);
  const host = unbracketHost(target.host);
  return {
    request: (req: HubRequest): Promise<HubResponse> =>
      new Promise<HubResponse>((resolve, reject) => {
        const payload = req.body === undefined ? undefined : Buffer.from(JSON.stringify(req.body), 'utf8');
        const headers: Record<string, string> = { accept: 'application/json', ...req.headers };
        if (payload) { headers['content-type'] = 'application/json'; headers['content-length'] = String(payload.length); }
        const request = https.request(
          { host, port: target.port, method: req.method, path: req.path, headers, agent: false, ...tls },
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
              for (const [k, v] of Object.entries(res.headers)) if (typeof v === 'string') out[k] = v;
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
