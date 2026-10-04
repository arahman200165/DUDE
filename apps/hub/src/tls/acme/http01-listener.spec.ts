import http from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { createHttp01Listener } from './http01-listener.js';
import type { Http01Listener } from './http01-listener.js';

const TOKEN = 'abcdefghijklmnopqrstuvwxyz012345';
let listener: Http01Listener | null = null;
afterEach(async () => { await listener?.stop(); listener = null; });

function request(port: number, method: string, path: string): Promise<{ status: number; body: string; type: string | undefined }> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path, agent: false }, (res) => {
      const parts: Buffer[] = [];
      res.on('data', (c: Buffer) => parts.push(c));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(parts).toString(), type: res.headers['content-type'] }));
    });
    req.on('error', reject);
    req.end();
  });
}

async function started(): Promise<number> {
  listener = createHttp01Listener({ port: 0, host: '127.0.0.1' });
  return (await listener.start()).port;
}

describe('http-01 listener', () => {
  it('serves only the stored key authorization at the challenge path', async () => {
    const port = await started();
    listener!.set(TOKEN, `${TOKEN}.thumb`);
    const hit = await request(port, 'GET', `/.well-known/acme-challenge/${TOKEN}`);
    expect(hit).toMatchObject({ status: 200, body: `${TOKEN}.thumb`, type: 'text/plain' });
    expect(listener!.stats().served).toBe(1);
  });

  it('answers 404 for everything else', async () => {
    const port = await started();
    listener!.set(TOKEN, 'x');
    for (const [method, path] of [
      ['GET', '/'],
      ['GET', '/.well-known/acme-challenge/'],
      ['GET', '/.well-known/acme-challenge/unknowntokenunknowntoken'],
      ['GET', '/.well-known/acme-challenge/short'],
      ['GET', `/.well-known/acme-challenge/${TOKEN}/extra`],
      ['GET', `/.well-known/acme-challenge/${TOKEN}?x=1`],
      ['POST', `/.well-known/acme-challenge/${TOKEN}`],
      ['HEAD', `/.well-known/acme-challenge/${TOKEN}`],
      ['GET', '/index.html'],
    ] as const) {
      expect((await request(port, method, path)).status, `${method} ${path}`).toBe(404);
    }
    listener!.remove(TOKEN);
    expect((await request(port, 'GET', `/.well-known/acme-challenge/${TOKEN}`)).status).toBe(404);
  });

  it('rejects malformed tokens on set', async () => {
    await started();
    expect(() => listener!.set('../etc', 'x')).toThrow();
  });

  it('releases the port on stop', async () => {
    const port = await started();
    await listener!.stop();
    listener = null;
    const again = createHttp01Listener({ port, host: '127.0.0.1' });
    expect((await again.start()).port).toBe(port);
    await again.stop();
  });
});
