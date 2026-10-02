import https from 'node:https';
import { isIP } from 'node:net';
import { connect } from 'node:tls';
import type { TLSSocket } from 'node:tls';
import { Value } from 'typebox/value';
import type { AgentHubProbe } from '@dude/contracts';
import { HUB_API_PREFIX, HUB_DEFAULT_PORT, HUB_MIN_CLIENT_PROTOCOL, HUB_PROTOCOL_VERSION, HelloResponse, checkProtocolCompatibility } from '@dude/contracts/hub';
import { spkiSha256Of, unbracketHost } from './pinned-transport.js';

export interface PinProbe { matches: boolean; certPem: string; spki: string }

const derToPem = (der: Uint8Array): string => {
  const b64 = Buffer.from(der).toString('base64');
  return `-----BEGIN CERTIFICATE-----\n${b64.match(/.{1,64}/g)?.join('\n') ?? ''}\n-----END CERTIFICATE-----\n`;
};

/**
 * Pairing-time pin check: opens a raw TLS socket that accepts any certificate, reads the presented leaf and closes at once.
 * NO application bytes are ever written on this socket, so no credential or request can reach an unverified peer. The
 * returned PEM is only usable as a trust anchor after `matches` is true.
 */
export function probePin(host: string, port: number, expectedSpki: string, timeoutMs = 10_000): Promise<PinProbe> {
  return new Promise<PinProbe>((resolve, reject) => {
    const bare = unbracketHost(host);
    let settled = false;
    let timer: NodeJS.Timeout | undefined;
    const done = (fn: () => void): void => { if (!settled) { settled = true; clearTimeout(timer); fn(); } };
    const socket: TLSSocket = connect({ host: bare, port, servername: isIP(bare) === 0 ? bare : undefined, rejectUnauthorized: false });
    timer = setTimeout(() => { socket.destroy(); done(() => reject(Object.assign(new Error('The Hub did not answer in time.'), { code: 'ETIMEDOUT' }))); }, timeoutMs);
    socket.once('secureConnect', () => {
      try {
        const raw = socket.getPeerCertificate().raw;
        const spki = spkiSha256Of(raw);
        const certPem = derToPem(raw);
        socket.destroy();
        done(() => resolve({ matches: spki === expectedSpki, certPem, spki }));
      } catch (error) {
        socket.destroy();
        done(() => reject(error));
      }
    });
    socket.once('error', (error) => done(() => reject(error)));
  });
}

/**
 * DISCOVERY ONLY. Asks 127.0.0.1 for the public `hello` while accepting any certificate, to tell the user that a Hub
 * is running here. Only the unauthenticated hello is sent, no credential is ever attached, and the result must never
 * be used to trust the peer: pairing re-verifies the pin from the pairing string.
 */
export function probeLocalHub(port: number = HUB_DEFAULT_PORT, timeoutMs = 3_000): Promise<AgentHubProbe> {
  const notFound: AgentHubProbe = { found: false, bootstrapped: null, hubInstanceId: null, spkiSha256: null, compatibility: null, hubVersion: null };
  return new Promise<AgentHubProbe>((resolve) => {
    const req = https.request(
      { host: '127.0.0.1', port, method: 'GET', path: `${HUB_API_PREFIX}/hello`, agent: false, rejectUnauthorized: false, headers: { accept: 'application/json' } },
      (res) => {
        let spki: string | null = null;
        try { spki = spkiSha256Of((res.socket as TLSSocket).getPeerCertificate().raw); } catch { /* leave null */ }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on('data', (chunk: Buffer) => { size += chunk.length; if (size > 64 * 1024) req.destroy(); else chunks.push(chunk); });
        res.on('error', () => resolve(notFound));
        res.on('end', () => {
          try {
            const body: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
            if (!Value.Check(HelloResponse, body)) { resolve(notFound); return; }
            resolve({
              found: true, bootstrapped: body.bootstrapped, hubInstanceId: body.hubInstanceId, spkiSha256: spki, hubVersion: body.hubVersion,
              compatibility: checkProtocolCompatibility(body, { protocolVersion: HUB_PROTOCOL_VERSION, minHubProtocol: HUB_MIN_CLIENT_PROTOCOL }),
            });
          } catch { resolve(notFound); }
        });
      },
    );
    req.setTimeout(timeoutMs, () => req.destroy());
    req.on('error', () => resolve(notFound));
    req.end();
  });
}
