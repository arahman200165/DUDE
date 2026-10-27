import { mkdtempSync, rmSync } from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HUB_API_PREFIX } from '@dude/contracts/hub';
import { parseHubConfig } from '../config/hub-config.js';
import type { Supervisor } from '../supervisor/supervisor.js';
import { createCloudflaredSupervisor, pickFreeLoopbackPort, sha256File } from '../tunnel/cloudflared.js';
import { startTestHub } from './test-helpers.js';
import type { TestHub } from './test-helpers.js';

/**
 * Tunnel mode behind the stub connector (32-SS1, Milestone 837, PD-119, PD-143): the stub is the one trusted hop (loopback), forwards to the
 * real Hub test server over HTTPS and appends the client address to `X-Forwarded-For`, exactly as the Cloudflare edge and `cloudflared` do.
 * Forged forwarding headers must change nothing, `www` redirects to the bare domain, and only the domain, `www` and loopback names are served.
 * The precedent for the forged-header checks is `scripts/check-caddy-proxy.mjs`.
 */
const STUB = path.join(import.meta.dirname, '..', 'tunnel', 'test-stub', 'cloudflared-stub.mjs');
const WHOAMI = `${HUB_API_PREFIX}/test/whoami`;
const HOST = 'notes.example.com';
const TOKEN = Buffer.from(JSON.stringify({ a: '0123456789abcdef0123456789abcdef', t: '11111111-2222-3333-4444-555555555555', s: 'c2VjcmV0LXNlY3JldC1zZWNyZXQtc2VjcmV0' })).toString('base64');

let hub: TestHub;
let supervisor: Supervisor;
let edgePort = 0;
let dir = '';

beforeAll(async () => {
  hub = await startTestHub(
    parseHubConfig({ exposure: { names: [HOST], proxy: { trusted: ['127.0.0.1', '::1'], publicOrigin: `https://${HOST}` }, tunnel: { enabled: true, hostname: HOST } } }),
    {
      rateLimit: { global: { perMinute: 600_000, burst: 100_000 } },
      configure: (app) => {
        app.get(WHOAMI, async (req) => ({ ip: req.ip, host: req.host, protocol: req.protocol }));
        app.get(`${HUB_API_PREFIX}/test/echo`, async (req) => ({ url: req.url }));
      },
    },
  );
  dir = mkdtempSync(path.join(os.tmpdir(), 'hub-edge-'));
  edgePort = await pickFreeLoopbackPort();
  supervisor = createCloudflaredSupervisor({
    secrets: { getText: () => TOKEN },
    dataRoot: dir,
    exePath: STUB,
    expectedSha256: await sha256File(STUB),
    launch: (exe, args) => ({ command: process.execPath, args: [exe, ...args] }),
    expectedImagePath: process.execPath,
    extraEnv: { STUB_FORWARD_LISTEN: String(edgePort), STUB_FORWARD_TO: String(hub.port) },
    supervisor: { readiness: { intervalMs: 20, startTimeoutMs: 8000 }, stopGraceMs: 1500 },
  });
  await supervisor.start();
  await supervisor.waitFor(['running'], 10_000);
  // The forwarding listener opens right after the metrics one; wait until it answers.
  for (let i = 0; i < 100; i += 1) {
    const probe = await viaEdge('/', { host: HOST }).catch(() => null);
    if (probe !== null) break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}, 30_000);

afterAll(async () => {
  await supervisor?.stop();
  await hub?.close();
  rmSync(dir, { recursive: true, force: true });
});

interface Res { status: number; headers: http.IncomingHttpHeaders; body: string }

function viaEdge(requestPath: string, headers: Record<string, string>): Promise<Res> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: edgePort, path: requestPath, method: 'GET', headers, agent: false }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

/** Straight to the Hub, optionally from another loopback address (127.0.0.2): a peer that is not the trusted connector. */
function direct(requestPath: string, headers: Record<string, string>, localAddress?: string): Promise<Res> {
  return new Promise((resolve, reject) => {
    const req = https.request({
      host: '127.0.0.1', port: hub.port, path: requestPath, method: 'GET', headers, ca: hub.tls.certPem, servername: 'localhost', agent: false, ...(localAddress ? { localAddress } : {}),
    }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

const json = (res: Res): Record<string, string> => JSON.parse(res.body) as Record<string, string>;

describe('through the connector (the one trusted hop)', () => {
  it('serves the public domain with the client address the edge appended, the public host and https', async () => {
    const res = await viaEdge(WHOAMI, { host: HOST });
    expect(res.status).toBe(200);
    expect(json(res)).toEqual({ ip: '127.0.0.1', host: HOST, protocol: 'https' });
  });

  it('ignores a client-forged X-Forwarded-For: only the entry the edge appended counts', async () => {
    const res = await viaEdge(WHOAMI, { host: HOST, 'x-forwarded-for': '203.0.113.9, 198.51.100.7' });
    expect(res.status).toBe(200);
    expect(json(res).ip).toBe('127.0.0.1');
    expect(res.body).not.toContain('203.0.113.9');
    expect(res.body).not.toContain('198.51.100.7');
  });

  it('ignores a client-forged X-Forwarded-Proto: the edge decides it', async () => {
    const res = await viaEdge(WHOAMI, { host: HOST, 'x-forwarded-proto': 'http' });
    expect(json(res).protocol).toBe('https');
  });

  it('refuses a forged X-Forwarded-Host that names another host, however the Host header reads', async () => {
    for (const forged of ['evil.example', 'notes.example.com.evil.example', 'localhost.evil.example']) {
      const res = await viaEdge(WHOAMI, { host: HOST, 'x-forwarded-host': forged });
      expect(res.status).toBe(421);
      expect(res.body).not.toContain(forged);
    }
  });

  it('refuses any other Host: the OS host name, another configured name and an IP literal are not served through the tunnel', async () => {
    for (const host of ['evil.example', os.hostname().toLowerCase(), '203.0.113.7', 'notes.example.com.evil.example', `${HOST}:8443`]) {
      expect((await viaEdge(WHOAMI, { host })).status).toBe(421);
    }
  });

  it('accepts the default HTTPS port spelling of the domain', async () => {
    expect((await viaEdge(WHOAMI, { host: `${HOST}:443` })).status).toBe(200);
  });
});

describe('www redirects to the bare domain', () => {
  it('answers 308 with the same path and query, before any route or authentication', async () => {
    const res = await viaEdge(`${HUB_API_PREFIX}/test/echo?a=1&b=%20two&c=%E2%9C%93`, { host: `www.${HOST}` });
    expect(res.status).toBe(308);
    expect(res.headers['location']).toBe(`https://${HOST}${HUB_API_PREFIX}/test/echo?a=1&b=%20two&c=%E2%9C%93`);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body).toBe('');
  });

  it('redirects the root and keeps the redirect off the owner API too (no 401 first)', async () => {
    const root = await viaEdge('/', { host: `WWW.${HOST.toUpperCase()}` });
    expect(root.status).toBe(308);
    expect(root.headers['location']).toBe(`https://${HOST}/`);
    const api = await viaEdge(`${HUB_API_PREFIX}/sessions`, { host: `www.${HOST}:443` });
    expect(api.status).toBe(308);
    expect(api.headers['location']).toBe(`https://${HOST}${HUB_API_PREFIX}/sessions`);
  });

  it('builds the target from the configured origin, never from a header: a forged X-Forwarded-Host cannot steer it', async () => {
    const res = await viaEdge('/x', { host: `www.${HOST}`, 'x-forwarded-host': 'evil.example' });
    // The forwarded host is the effective one and it is not www.<domain>: refused, not redirected anywhere.
    expect(res.status).toBe(421);
    expect(res.headers['location']).toBeUndefined();
  });

  it('never reflects an arbitrary host: only exactly www.<domain> redirects', async () => {
    for (const host of ['www.evil.example', `www.www.${HOST}`, `wwww.${HOST}`, `www${HOST}`]) {
      const res = await viaEdge('/', { host });
      expect(res.status).toBe(421);
      expect(res.headers['location']).toBeUndefined();
    }
  });
});

describe('a peer that is not the trusted connector', () => {
  const canBindSecondLoopback = async (): Promise<boolean> => direct(WHOAMI, { host: `localhost:${hub.port}` }, '127.0.0.2').then(() => true, () => false);

  it('cannot spoof the client address, host or protocol with forwarding headers', async () => {
    if (!(await canBindSecondLoopback())) return; // this machine cannot source a connection from 127.0.0.2
    const res = await direct(WHOAMI, { host: `localhost:${hub.port}`, 'x-forwarded-for': '203.0.113.9', 'x-forwarded-host': HOST, 'x-forwarded-proto': 'http' }, '127.0.0.2');
    expect(res.status).toBe(200);
    expect(json(res)).toEqual({ ip: '127.0.0.2', host: `localhost:${hub.port}`, protocol: 'https' });
  });

  it('is refused the public domain, www and a forged X-Forwarded-Host (it is served loopback names only)', async () => {
    if (!(await canBindSecondLoopback())) return;
    for (const headers of [
      { host: HOST } as Record<string, string>,
      { host: `www.${HOST}` },
      { host: `localhost:${hub.port}`, 'x-forwarded-host': HOST }, // honoured by nobody: not a trusted hop, so the Host header decides (localhost: allowed)
    ]) {
      const res = await direct(WHOAMI, headers, '127.0.0.2');
      if (headers.host === `localhost:${hub.port}`) expect(json(res).host).toBe(`localhost:${hub.port}`);
      else {
        expect(res.status).toBe(421);
        expect(res.headers['location']).toBeUndefined(); // no www redirect for an untrusted peer
      }
    }
  });
});

describe('local use is unaffected', () => {
  it('the desktop and the admin still reach the Hub on loopback names, and the OS host name is not served in tunnel mode', async () => {
    expect((await direct(WHOAMI, { host: `127.0.0.1:${hub.port}` })).status).toBe(200);
    expect((await direct(WHOAMI, { host: `localhost:${hub.port}` })).status).toBe(200);
    expect((await direct(WHOAMI, { host: `${os.hostname().toLowerCase()}:${hub.port}` })).status).toBe(421);
  });
});
