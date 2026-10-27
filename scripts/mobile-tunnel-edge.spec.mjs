import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';
import tls from 'node:tls';
import { after, before, test } from 'node:test';
import { opensslAvailable, startTunnelEdge } from './mobile-tunnel-edge.mjs';

// The tunnel-domain stand-in of the Android emulator acceptance (Milestone 840) behaves as the instrumented test assumes: it needs `openssl`
// (present on the CI runners and in Git for Windows) and only loopback.
const available = opensslAvailable();
let dir;
let edge;
let ca;
before(async () => {
  if (!available) return;
  dir = mkdtempSync(path.join(os.tmpdir(), 'dude-tunnel-edge-'));
  edge = await startTunnelEdge({ dir });
  ca = readFileSync(edge.caPemPath);
});
after(async () => {
  await edge?.stop();
  if (dir) rmSync(dir, { recursive: true, force: true });
});

const get = (port, pathname, options = {}) => new Promise((resolve, reject) => {
  const request = https.request({ host: '127.0.0.1', servername: edge.domain, port, path: pathname, method: options.method ?? 'GET', ca: options.ca === undefined ? ca : options.ca, headers: { host: edge.domain, ...options.headers } }, response => {
    const chunks = [];
    response.on('data', chunk => chunks.push(chunk));
    response.on('end', () => resolve({ status: response.statusCode, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) }));
  });
  request.on('error', reject);
  request.end(options.body);
});
const token = `Bearer ddt_${'A'.repeat(43)}`;

test('the good listener serves the domain over a CA-issued chain and the stub Hub sees it as HTTPS from an edge', { skip: !available }, async () => {
  const hello = await get(edge.ports.good, '/api/v1/hello');
  assert.equal(hello.status, 200);
  assert.deepEqual({ ...hello.body, host: undefined }, { service: 'dude-hub', acceptanceStub: true, trustMode: 'public-ca', trustDomain: edge.domain, listener: 'good', forwardedProto: 'https', host: undefined });
  assert.equal((await get(edge.ports.good, '/api/v1/acceptance/sync', { method: 'POST', body: 'one' })).status, 401);
  assert.equal((await get(edge.ports.good, '/api/v1/acceptance/sync', { method: 'POST', body: 'one', headers: { authorization: token } })).body.stored, 1);
  assert.deepEqual((await get(edge.ports.good, '/api/v1/acceptance/sync', { headers: { authorization: token } })).body.items, ['one']);
});

test('a client that trusts only the throwaway CA refuses the wrong host, the self-signed and the other-CA listeners before any request reaches the Hub', { skip: !available }, async () => {
  const before = (await get(edge.ports.good, '/api/v1/acceptance/counts')).body.counts;
  for (const name of ['wrongHost', 'selfSigned', 'otherCa']) await assert.rejects(get(edge.ports[name], '/api/v1/hello'), name);
  const afterCounts = (await get(edge.ports.good, '/api/v1/acceptance/counts')).body.counts;
  for (const name of ['wrongHost', 'selfSigned', 'otherCa']) assert.equal(afterCounts[name], before[name], name);
});

test('the WebSocket upgrade is forwarded with its bearer token and answers a welcome frame; without the token it is refused', { skip: !available }, async () => {
  const upgrade = headers => new Promise((resolve, reject) => {
    const socket = tls.connect({ host: '127.0.0.1', port: edge.ports.good, servername: edge.domain, ca }, () => {
      socket.write(`GET /api/v1/realtime HTTP/1.1\r\nhost: ${edge.domain}\r\nupgrade: websocket\r\nconnection: Upgrade\r\nsec-websocket-key: dGhlIHNhbXBsZSBub25jZQ==\r\nsec-websocket-version: 13\r\n${headers}\r\n`);
    });
    let data = '';
    socket.on('data', chunk => {
      data += chunk.toString('latin1');
      if (data.includes('\r\n\r\n') && (data.startsWith('HTTP/1.1 401') || data.includes('acceptance-welcome'))) { socket.destroy(); resolve(data); }
    });
    socket.on('error', reject);
  });
  const accepted = await upgrade(`authorization: ${token}\r\n`);
  assert.match(accepted, /^HTTP\/1\.1 101 /);
  assert.match(accepted, /sec-websocket-accept: s3pPLMBiTxaQ9kYGzzhZRbK\+xOo=/i);
  assert.match(accepted, /acceptance-welcome/);
  assert.match(await upgrade(''), /^HTTP\/1\.1 401 /);
});

test('the Android user-store file name is the legacy OpenSSL subject hash of the CA certificate', { skip: !available }, () => {
  assert.match(edge.androidCaFile, /^[0-9a-f]{8}\.0$/);
});
