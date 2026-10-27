import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Usage: node scripts/mobile-tunnel-edge.mjs --dir <output directory>      (manual runs; CI starts it through scripts/mobile-instrument.mjs --tunnel-edge)
// The tunnel-domain stand-in for the Android emulator acceptance (32-SS1, Milestone 840). Node built-ins plus the `openssl` command only.
//
//   emulator --10.0.2.2:<port>--> TLS-terminating EDGE (like Cloudflare: HTTPS in, plain loopback HTTP out, X-Forwarded-Proto: https) --> stub HUB
//
// The edge has four TLS listeners for the same domain, each presenting a different certificate, so one run proves what the Android client accepts and
// refuses through the platform trust path:
//   good       a leaf for `domain` signed by the throwaway CA (the only certificate the client should accept once the CA is in the user trust store)
//   wrongHost  a leaf for another host name, signed by the same CA
//   selfSigned a self-signed certificate for `domain`
//   otherCa    a leaf for `domain` signed by a second CA that is never installed
// The stub Hub speaks only what the acceptance test needs: GET /api/v1/hello (advertising public-ca for the domain), a push/pull pair, a counters
// route and a WebSocket upgrade at /api/v1/realtime. It is NOT the real Hub: it exists so the emulator step needs no npm install.
// The throwaway CA's private key stays in `dir` on the CI machine; only the CA certificate is installed on the emulator, and only by the harness.

const OPENSSL = process.env.DUDE_OPENSSL ?? 'openssl';
export const TUNNEL_DOMAIN = 'hub.dude-acceptance.dev';
const WRONG_HOST = 'other.dude-acceptance.dev';
export const LISTENERS = ['good', 'wrongHost', 'selfSigned', 'otherCa'];
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

const run = (args, cwd) => execFileSync(OPENSSL, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });

/** Whether `openssl` can be run (specs skip when it cannot). */
export function opensslAvailable() {
  try {
    run(['version']);
    return true;
  } catch {
    return false;
  }
}

function makeCa(dir, name) {
  run(['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes', '-keyout', `${name}.key`, '-out', `${name}.pem`, '-subj', `/CN=DUDE acceptance ${name}`,
    '-days', '3', '-addext', 'basicConstraints=critical,CA:TRUE', '-addext', 'keyUsage=critical,keyCertSign,cRLSign'], dir);
}

function makeLeaf(dir, name, host, ca) {
  run(['req', '-new', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes', '-keyout', `${name}.key`, '-out', `${name}.csr`, '-subj', `/CN=${host}`], dir);
  writeFileSync(path.join(dir, `${name}.ext`), `subjectAltName=DNS:${host}\nbasicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature\nextendedKeyUsage=serverAuth\n`);
  run(['x509', '-req', '-in', `${name}.csr`, '-CA', `${ca}.pem`, '-CAkey', `${ca}.key`, '-CAcreateserial', '-out', `${name}.pem`, '-days', '3', '-extfile', `${name}.ext`], dir);
}

function makeSelfSigned(dir, name, host) {
  run(['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes', '-keyout', `${name}.key`, '-out', `${name}.pem`, '-subj', `/CN=${host}`, '-days', '3',
    '-addext', `subjectAltName=DNS:${host}`], dir);
}

/** The file name Android's user trust store uses (`/data/misc/user/<id>/cacerts-added/<hash>.0`): OpenSSL's legacy subject hash of the CA. */
export function androidCaFileName(dir) {
  return `${run(['x509', '-subject_hash_old', '-noout', '-in', 'ca.pem'], dir).trim()}.0`;
}

/** Minimal unmasked server text frame (payload under 126 bytes is all this stub sends). */
const textFrame = text => {
  const body = Buffer.from(text, 'utf8');
  if (body.length > 125) throw new Error('stub frames are short');
  return Buffer.concat([Buffer.from([0x81, body.length]), body]);
};
const json = (response, status, value) => {
  const body = JSON.stringify(value);
  response.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body), 'cache-control': 'no-store' });
  response.end(body);
};

function createStubHub(domain) {
  const counts = Object.fromEntries(LISTENERS.map(name => [name, 0]));
  const store = [];
  const sockets = new Set();
  const countOf = request => {
    const listener = String(request.headers['x-edge-listener'] ?? '');
    // The counters route is how the test asks, so its own request is not counted.
    if (listener in counts && !request.url?.startsWith('/api/v1/acceptance/counts')) counts[listener] += 1;
    return listener;
  };
  const bearer = request => /^Bearer ddt_[A-Za-z0-9_-]{43}$/.test(String(request.headers.authorization ?? ''));
  const server = http.createServer((request, response) => {
    const listener = countOf(request);
    const url = new URL(request.url ?? '/', 'http://hub.invalid');
    const chunks = [];
    request.on('data', chunk => chunks.push(chunk));
    request.on('end', () => {
      const proto = String(request.headers['x-forwarded-proto'] ?? '');
      if (url.pathname === '/api/v1/hello') return json(response, 200, { service: 'dude-hub', acceptanceStub: true, trustMode: 'public-ca', trustDomain: domain, listener, forwardedProto: proto, host: request.headers.host });
      if (url.pathname === '/api/v1/acceptance/counts') return json(response, 200, { counts });
      if (url.pathname === '/api/v1/acceptance/sync' && !bearer(request)) return json(response, 401, { error: 'unauthorized' });
      if (url.pathname === '/api/v1/acceptance/sync' && request.method === 'POST') {
        const item = Buffer.concat(chunks).toString('utf8');
        store.push(item);
        return json(response, 200, { ok: true, stored: store.length, forwardedProto: proto });
      }
      if (url.pathname === '/api/v1/acceptance/sync' && request.method === 'GET') return json(response, 200, { items: store, forwardedProto: proto });
      return json(response, 404, { error: 'not-found' });
    });
  });
  server.on('upgrade', (request, socket) => {
    countOf(request);
    const key = request.headers['sec-websocket-key'];
    if (!bearer(request) || new URL(request.url ?? '/', 'http://hub.invalid').pathname !== '/api/v1/realtime' || typeof key !== 'string') {
      socket.end('HTTP/1.1 401 Unauthorized\r\nconnection: close\r\ncontent-length: 0\r\n\r\n');
      return;
    }
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => undefined);
    const accept = createHash('sha1').update(key + WS_GUID).digest('base64');
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nupgrade: websocket\r\nconnection: Upgrade\r\nsec-websocket-accept: ${accept}\r\n\r\n`);
    socket.write(textFrame(JSON.stringify({ type: 'acceptance-welcome', forwardedProto: String(request.headers['x-forwarded-proto'] ?? '') })));
    // Whatever the client sends (a close frame, pings) ends the stub's side; OkHttp's own close handshake does not need a reply to finish.
    socket.on('data', () => socket.end());
  });
  return { server, sockets };
}

/** The edge for one certificate: terminates TLS and forwards HTTP and WebSocket upgrades to the stub Hub over loopback, labelled with its listener name. */
function createEdge(name, credentials, hubPort) {
  const forwardHead = request => {
    const headers = [];
    for (let i = 0; i < request.rawHeaders.length; i += 2) {
      const key = request.rawHeaders[i].toLowerCase();
      if (!['x-forwarded-proto', 'x-edge-listener', 'x-forwarded-for'].includes(key)) headers.push(`${request.rawHeaders[i]}: ${request.rawHeaders[i + 1]}`);
    }
    headers.push('x-forwarded-proto: https', 'x-forwarded-for: 203.0.113.7', `x-edge-listener: ${name}`);
    return `${request.method} ${request.url} HTTP/1.1\r\n${headers.join('\r\n')}\r\n\r\n`;
  };
  const server = https.createServer(credentials, (request, response) => {
    const headers = { ...request.headers, 'x-forwarded-proto': 'https', 'x-forwarded-for': '203.0.113.7', 'x-edge-listener': name };
    const upstream = http.request({ host: '127.0.0.1', port: hubPort, method: request.method, path: request.url, headers }, reply => {
      response.writeHead(reply.statusCode ?? 502, reply.headers);
      reply.pipe(response);
    });
    upstream.on('error', () => {
      if (!response.headersSent) response.writeHead(502);
      response.end();
    });
    request.pipe(upstream);
  });
  server.on('upgrade', (request, socket, head) => {
    const upstream = net.connect(hubPort, '127.0.0.1', () => {
      upstream.write(forwardHead(request));
      if (head.length > 0) upstream.write(head);
      upstream.pipe(socket);
      socket.pipe(upstream);
    });
    upstream.on('error', () => socket.destroy());
    socket.on('error', () => upstream.destroy());
    socket.on('close', () => upstream.destroy());
  });
  // A failed TLS handshake is the expected outcome for three of the four listeners.
  server.on('tlsClientError', () => undefined);
  return server;
}

const listen = (server, host = '127.0.0.1') => new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, host, () => resolve(server.address().port));
});
const close = server => new Promise(resolve => server.close(() => resolve()));

/**
 * Generates the throwaway PKI in `dir` and starts the stub Hub and the four edges. Resolves to `{ domain, ports, caPemPath, androidCaFile, stop }`.
 * Nothing listens beyond 127.0.0.1 (the emulator reaches the host's loopback as 10.0.2.2).
 */
export async function startTunnelEdge({ dir, domain = TUNNEL_DOMAIN } = {}) {
  if (!dir) throw new Error('startTunnelEdge needs a directory for the throwaway certificates.');
  mkdirSync(dir, { recursive: true });
  makeCa(dir, 'ca');
  makeCa(dir, 'other-ca');
  makeLeaf(dir, 'good', domain, 'ca');
  makeLeaf(dir, 'wrong-host', WRONG_HOST, 'ca');
  makeSelfSigned(dir, 'self-signed', domain);
  makeLeaf(dir, 'other-ca-leaf', domain, 'other-ca');
  const read = name => ({ key: readFileSync(path.join(dir, `${name}.key`)), cert: readFileSync(path.join(dir, `${name}.pem`)) });
  const { server: hub, sockets } = createStubHub(domain);
  const hubPort = await listen(hub);
  const edges = {
    good: createEdge('good', read('good'), hubPort),
    wrongHost: createEdge('wrongHost', read('wrong-host'), hubPort),
    selfSigned: createEdge('selfSigned', read('self-signed'), hubPort),
    otherCa: createEdge('otherCa', read('other-ca-leaf'), hubPort),
  };
  const ports = {};
  for (const [name, edge] of Object.entries(edges)) ports[name] = await listen(edge);
  return {
    domain,
    ports,
    hubPort,
    caPemPath: path.join(dir, 'ca.pem'),
    androidCaFile: androidCaFileName(dir),
    async stop() {
      for (const socket of sockets) socket.destroy();
      for (const edge of Object.values(edges)) {
        edge.closeAllConnections?.();
        await close(edge);
      }
      hub.closeAllConnections?.();
      await close(hub);
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const index = process.argv.indexOf('--dir');
  const dir = index > 0 ? process.argv[index + 1] : undefined;
  if (!dir || process.argv.length !== 4) throw new Error('Usage: node scripts/mobile-tunnel-edge.mjs --dir <output directory>');
  const edge = await startTunnelEdge({ dir: path.resolve(dir) });
  console.log(JSON.stringify({ domain: edge.domain, ports: edge.ports, caPem: edge.caPemPath, androidCaFile: edge.androidCaFile }));
  process.on('SIGINT', () => edge.stop().then(() => process.exit(0)));
}
