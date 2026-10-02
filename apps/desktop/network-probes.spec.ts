import { createServer } from 'node:net';
import { createServer as createHttpServer } from 'node:http';
import { createSocket } from 'node:dgram';
import { describe, expect, it, vi } from 'vitest';
vi.mock('electron', () => ({ app: { isPackaged: false } }));
import { runNetworkRequest, tcpProbe, udpProbe } from './network-runner';

describe('local network probe fixtures', () => {
  it('distinguishes open and refused TCP ports on loopback', async () => {
    const server = createServer((socket) => socket.end());
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as { port: number }).port;
    expect((await tcpProbe('127.0.0.1', port, new AbortController().signal)).state).toBe('open');
    await new Promise<void>((resolve) => server.close(() => resolve()));
    expect((await tcpProbe('127.0.0.1', port, new AbortController().signal)).state).toBe('closed');
  });

  it('reports a UDP reply as open and silence as open or filtered', async () => {
    const server = createSocket('udp4');
    server.on('message', (_message, sender) => server.send(Buffer.from('ok'), sender.port, sender.address));
    await new Promise<void>((resolve) => server.bind(0, '127.0.0.1', resolve));
    const port = (server.address() as { port: number }).port;
    try { expect((await udpProbe('127.0.0.1', port, new AbortController().signal, 1000)).state).toBe('open'); }
    finally { server.close(); }
    const silent = await udpProbe('127.0.0.1', port, new AbortController().signal, 150);
    expect(['closed', 'open-or-filtered']).toContain(silent.state);
    expect(silent.state).not.toBe('open');
  });

  it('supports a custom HTTP method and streams a loopback response', async () => {
    const server = createHttpServer((request, response) => {
      let body = '';
      request.on('data', (chunk) => { body += chunk.toString(); });
      request.on('end', () => { response.setHeader('content-type', 'text/plain'); response.end(`${request.method}:${body}`); });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const port = (server.address() as { port: number }).port;
      const result = await runNetworkRequest({ kind: 'connectivity-tester', connectivityMode: 'http', target: `http://127.0.0.1:${port}/`, method: 'TRACE', body: 'hello' }, new AbortController().signal, () => {}) as { status: number; bodyBase64: string; bodyBytes: number; headersMs: number };
      expect(result.status).toBe(200);
      expect(Buffer.from(result.bodyBase64, 'base64').toString()).toBe('TRACE:hello');
      expect(result.bodyBytes).toBe(11);
      expect(result.headersMs).toBeGreaterThanOrEqual(0);
    } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
  });

  it('does not forward credentials across HTTP redirect origins', async () => {
    const destination = createHttpServer((request, response) => response.end(request.headers['authorization'] ?? 'no-auth'));
    await new Promise<void>((resolve) => destination.listen(0, '127.0.0.1', resolve));
    const destinationPort = (destination.address() as { port: number }).port;
    const redirect = createHttpServer((_request, response) => {
      response.writeHead(302, { location: `http://127.0.0.1:${destinationPort}/landing` });
      response.end();
    });
    await new Promise<void>((resolve) => redirect.listen(0, '127.0.0.1', resolve));
    try {
      const port = (redirect.address() as { port: number }).port;
      const result = await runNetworkRequest({ kind: 'connectivity-tester', connectivityMode: 'http', target: `http://127.0.0.1:${port}/redirect`, method: 'GET', headers: { Authorization: 'Bearer private' } }, new AbortController().signal, () => {}) as { bodyBase64: string; redirects: string[] };
      expect(Buffer.from(result.bodyBase64, 'base64').toString()).toBe('no-auth');
      expect(result.redirects).toHaveLength(1);
    } finally {
      await new Promise<void>((resolve) => redirect.close(() => resolve()));
      await new Promise<void>((resolve) => destination.close(() => resolve()));
    }
  });
});
