import https from 'node:https';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { spkiSha256Of } from '../hub/pinned-transport.js';
// Test-only: reuse the Hub's own self-signed certificate generator so tests present exactly what a real Hub presents.
import { generateSelfSigned } from '../../../hub/src/tls/self-signed.js';

export interface TestCert { keyPem: string; certPem: string; spki: string }

export function makeCert(label = 'test'): TestCert {
  const { keyPem, certPem } = generateSelfSigned({ hubInstanceId: `${label}-0000-0000-0000-000000000000`, extraNames: ['localhost', '127.0.0.1'] });
  return { keyPem, certPem, spki: spkiSha256Of(certPem) };
}

export interface TestHttpsServer {
  port: number;
  close(): Promise<void>;
  requests: Array<{ method: string; url: string; headers: Record<string, string | string[] | undefined> }>;
}

const okJson = (_req: IncomingMessage, res: ServerResponse): void => { res.setHeader('content-type', 'application/json'); res.end('{"ok":true}'); };

export async function startHttps(cert: TestCert, handler: (req: IncomingMessage, res: ServerResponse) => void = okJson): Promise<TestHttpsServer> {
  const requests: TestHttpsServer['requests'] = [];
  const server = https.createServer({ key: cert.keyPem, cert: cert.certPem }, (req, res) => {
    requests.push({ method: req.method ?? '', url: req.url ?? '', headers: req.headers });
    handler(req, res);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    port: (server.address() as AddressInfo).port,
    requests,
    close: () => new Promise<void>((resolve) => { server.closeAllConnections(); server.close(() => resolve()); }),
  };
}
