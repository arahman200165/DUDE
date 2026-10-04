#!/usr/bin/env node
// Local gate (NOT wired into CI): runs the DUDE Hub behind a REAL Caddy reverse proxy and checks the reverse-proxy mode
// contract end to end (Host/Origin/CSRF with the public origin, diagnostics, realtime upgrade, reachability echo, forged
// X-Forwarded-For). Exit 0 = all steps passed (or Caddy is not installed: skipped), 1 = a step failed.
//
// Nothing is installed into the OS trust store (`skip_install_trust`); Caddy's admin API is off; every process this script
// starts is killed in `finally` and on SIGINT/SIGTERM. The client trusts exactly Caddy's own internal root (read from the
// temporary Caddy storage directory), so no TLS verification is disabled in the client. `tls_insecure_skip_verify` appears
// only in the generated Caddyfile for the Caddy -> Hub leg (the Hub's own certificate is self-signed in this scenario).
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import https from 'node:https';
import net from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HUB_BUNDLE = path.join(root, 'dist', 'hub', 'dude-hub.cjs');
const WEB_ROOT = path.join(root, 'dist', 'hub-web', 'browser');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const PASSWORD = 'correct horse battery staple 42';

let failures = 0;
const step = (name, ok, evidence) => {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${evidence === undefined ? '' : ` -- ${typeof evidence === 'string' ? evidence : JSON.stringify(evidence)}`}`);
};

const hasCaddy = () => spawnSync('caddy', ['version'], { encoding: 'utf8', shell: process.platform === 'win32' }).status === 0;

const portFree = (port) => new Promise((resolve) => {
  const server = net.createServer();
  server.once('error', () => resolve(false));
  server.listen(port, '127.0.0.1', () => server.close(() => resolve(true)));
});
async function pickPorts(count) {
  const picked = [];
  while (picked.length < count) {
    const port = 18443 + Math.floor(Math.random() * 57);
    if (!picked.includes(port) && (await portFree(port))) picked.push(port);
  }
  return picked;
}

function runSync(script) {
  const result = spawnSync(npm, ['run', script], { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.status !== 0) throw new Error(`npm run ${script} failed`);
}

const children = [];
function track(child) { children.push(child); return child; }
async function stop(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await new Promise((resolve) => {
    const force = setTimeout(() => { child.kill('SIGKILL'); }, 8000);
    child.once('exit', () => { clearTimeout(force); resolve(); });
    // `caddy` on PATH may be a shim (Chocolatey) that spawns the real binary: on Windows kill the whole process tree.
    if (process.platform === 'win32' && child.pid !== undefined) spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F']);
    else child.kill('SIGTERM');
  });
}

function hubCli(args, dataDir) {
  return spawnSync(process.execPath, [HUB_BUNDLE, ...args, '--data-dir', dataDir], { encoding: 'utf8' });
}

/** One HTTPS request to Caddy (127.0.0.1:port), trusting only `ca`; `host` is the Host header. Returns {status, headers, body}. */
function request({ port, ca, method = 'GET', pathname, headers = {}, body, servername = 'localhost' }) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const req = https.request({
      host: '127.0.0.1', port, servername, method, path: pathname, ca,
      headers: { accept: 'application/json', ...(payload === undefined ? {} : { 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(payload)) }), ...headers },
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let parsed = text;
        try { parsed = text === '' ? undefined : JSON.parse(text); } catch { /* keep text */ }
        resolve({ status: res.statusCode ?? 0, headers: res.headers, body: parsed });
      });
    });
    req.on('error', reject);
    if (payload !== undefined) req.write(payload);
    req.end();
  });
}

async function main() {
  if (!hasCaddy()) {
    console.log('SKIP  caddy is not on PATH; install it (e.g. "choco install caddy") to run this gate.');
    return;
  }
  if (!existsSync(path.join(WEB_ROOT, 'index.html'))) runSync('build:hub-web');
  if (!existsSync(HUB_BUNDLE)) runSync('hub:compile');

  const [hubPort, caddyPort] = await pickPorts(2);
  const tmp = mkdtempSync(path.join(tmpdir(), 'dude-caddy-'));
  const dataDir = path.join(tmp, 'hub');
  const caddyData = path.join(tmp, 'caddy-data');
  const origin = `https://localhost:${caddyPort}`;
  const caddyHost = `localhost:${caddyPort}`;
  try {
    // 1. Reverse-proxy mode through the elevation-free foreground config-edit path (no Hub is running yet, no service installed).
    const proxyOn = hubCli(['network', 'proxy', 'on', '--trusted', '127.0.0.1/32', '--public-origin', origin], dataDir);
    step('network proxy on (foreground config edit)', proxyOn.status === 0, (proxyOn.stdout || proxyOn.stderr).replace(/\s+/g, ' ').trim().slice(0, 200));
    if (proxyOn.status !== 0) return;

    // 2. Foreground Hub.
    const hub = track(spawn(process.execPath, [HUB_BUNDLE, 'run', '--data-dir', dataDir, '--port', String(hubPort), '--web-root', WEB_ROOT], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] }));
    let hubErr = '';
    hub.stderr.on('data', (c) => { hubErr += c.toString(); });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Hub did not start in 60 s. ${hubErr}`)), 60_000);
      hub.once('exit', (code) => reject(new Error(`Hub exited early (${code}). ${hubErr}`)));
      createInterface({ input: hub.stdout }).on('line', (line) => {
        try { if (JSON.parse(line).event === 'listening') { clearTimeout(timer); resolve(); } } catch { /* log line */ }
      });
    });
    hub.removeAllListeners('exit');
    step('foreground Hub started in reverse-proxy mode', true, `127.0.0.1:${hubPort}`);

    // 3. Caddy with its own internal CA, nothing installed into the trust store, no admin endpoint, no HTTP redirect listener.
    const caddyfile = path.join(tmp, 'Caddyfile');
    writeFileSync(caddyfile, [
      '{',
      '\tadmin off',
      '\tauto_https disable_redirects',
      '\tlocal_certs',
      '\tskip_install_trust',
      `\tstorage file_system "${caddyData.replace(/\\/g, '/')}"`,
      '}',
      '',
      `https://localhost:${caddyPort} {`,
      '\ttls internal',
      `\treverse_proxy https://127.0.0.1:${hubPort} {`,
      '\t\ttransport http {',
      '\t\t\ttls_insecure_skip_verify',
      '\t\t}',
      '\t}',
      '}',
      '',
    ].join('\n'));
    const caddy = track(spawn('caddy', ['run', '--config', caddyfile, '--adapter', 'caddyfile'], { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, XDG_DATA_HOME: caddyData, XDG_CONFIG_HOME: path.join(tmp, 'caddy-config') } }));
    let caddyErr = '';
    caddy.stderr.on('data', (c) => { caddyErr += c.toString(); });
    const rootCrt = path.join(caddyData, 'pki', 'authorities', 'local', 'root.crt');
    const started = Date.now();
    let ca;
    for (;;) {
      if (caddy.exitCode !== null) throw new Error(`Caddy exited early. ${caddyErr.slice(-800)}`);
      if (existsSync(rootCrt)) {
        const candidate = readFileSync(rootCrt, 'utf8');
        const probe = await request({ port: caddyPort, ca: candidate, pathname: '/api/v1/hello', headers: { host: caddyHost } }).catch(() => null);
        if (probe !== null) { ca = candidate; break; }
      }
      if (Date.now() - started > 30_000) throw new Error(`Caddy did not come up in 30 s. ${caddyErr.slice(-800)}`);
      await new Promise((r) => setTimeout(r, 250));
    }
    step('Caddy started with its internal CA', true, `https://localhost:${caddyPort} -> 127.0.0.1:${hubPort}`);
    const call = (o) => request({ port: caddyPort, ca, ...o, headers: { host: caddyHost, ...(o.headers ?? {}) } });

    // (a) hello through Caddy.
    const hello = await call({ pathname: '/api/v1/hello' });
    step('(a) GET /api/v1/hello through Caddy', hello.status === 200 && hello.body?.service !== undefined && hello.body?.bootstrapped === false, { status: hello.status, service: hello.body?.service, bootstrapped: hello.body?.bootstrapped });

    // (b) bootstrap + sign-in + CSRF-protected mutation, all through the proxy with the public origin.
    const tokenRun = hubCli(['setup-token'], dataDir);
    const setupToken = (tokenRun.stdout || '').trim().split(/\s+/).find((s) => /^[A-Za-z0-9_-]{43}$/.test(s)) ?? readFileSync(path.join(dataDir, 'config', 'setup-token'), 'utf8').trim();
    const bootstrap = await call({ method: 'POST', pathname: '/api/v1/bootstrap', headers: { origin }, body: { setupToken, ownerDisplayName: 'Proxy Owner', environmentName: 'Caddy test', password: PASSWORD } });
    step('(b1) POST /bootstrap through Caddy', bootstrap.status === 201, { status: bootstrap.status, body: bootstrap.status === 201 ? '(recovery codes omitted)' : bootstrap.body });
    const signIn = await call({ method: 'POST', pathname: '/api/v1/auth/sign-in', headers: { origin }, body: { password: PASSWORD } });
    const cookie = (signIn.headers['set-cookie'] ?? []).map((c) => c.split(';')[0]).join('; ');
    const csrf = signIn.body?.csrfToken;
    const hsts = signIn.headers['strict-transport-security'];
    step('(b2) sign-in sets a __Host- session cookie and returns a CSRF token; HSTS sent', signIn.status === 200 && cookie.startsWith('__Host-dude_session=') && typeof csrf === 'string' && csrf !== '' && hsts !== undefined, { status: signIn.status, cookie: cookie.split('=')[0], hsts });
    const owner = { cookie, 'x-dude-csrf': csrf };
    const pairing = await call({ method: 'POST', pathname: '/api/v1/pairing-codes', headers: { origin, ...owner }, body: {} });
    step('(b3) POST /pairing-codes with cookie + CSRF + public Origin; pairing string carries the public host', pairing.status === 200 && String(pairing.body?.pairingString).includes(`localhost`) && String(pairing.body?.pairingString).includes(String(caddyPort)), { status: pairing.status, hostInString: String(pairing.body?.pairingString).replace(/code=[^&]*/g, 'code=*').slice(0, 120) });
    const noCsrf = await call({ method: 'POST', pathname: '/api/v1/pairing-codes', headers: { origin, cookie }, body: {} });
    step('(b4) same mutation without CSRF is refused', noCsrf.status === 403, { status: noCsrf.status });
    const hubOrigin = await call({ method: 'POST', pathname: '/api/v1/pairing-codes', headers: { origin: `https://127.0.0.1:${hubPort}`, ...owner }, body: {} });
    step('(f1) mutation with a wrong Origin is refused', hubOrigin.status === 403, { status: hubOrigin.status });

    // (c) diagnostics.
    const diag = await call({ pathname: '/api/v1/diagnostics', headers: { cookie } });
    const diagText = JSON.stringify(diag.body);
    const proxy = diag.body?.exposure?.proxy;
    step('(c) GET /diagnostics shows the proxy settings: trusted hop and public origin (exposure.mode stays "private")', diag.status === 200 && Array.isArray(proxy?.trusted) && proxy.trusted.includes('127.0.0.1/32') && proxy.publicOrigin === origin && diag.body?.exposure?.canonicalOrigin === origin, { status: diag.status, mode: diag.body?.exposure?.mode, proxy });

    // (d) realtime upgrade through Caddy.
    const welcome = await new Promise((resolve) => {
      const ws = new WebSocket(`wss://localhost:${caddyPort}/api/v1/realtime`, { ca, headers: { cookie, origin }, host: '127.0.0.1', servername: 'localhost' });
      const timer = setTimeout(() => { ws.terminate(); resolve({ error: 'timeout' }); }, 10_000);
      ws.on('open', () => ws.send(JSON.stringify({ type: 'hello', protocolVersion: 1, minHubProtocol: 1 })));
      ws.on('message', (data) => { clearTimeout(timer); const msg = JSON.parse(data.toString()); ws.close(); resolve(msg); });
      ws.on('unexpected-response', (_req, res) => { clearTimeout(timer); resolve({ error: `HTTP ${res.statusCode}` }); });
      ws.on('error', (e) => { clearTimeout(timer); resolve({ error: e.message }); });
    });
    step('(d) wss realtime through Caddy authenticates by cookie and receives welcome', welcome.type === 'welcome' && welcome.sessionKind === 'owner-cookie', welcome.type ? { type: welcome.type, sessionKind: welcome.sessionKind } : welcome);

    // (e) reachability echo: observed source is the real client (loopback); a client-supplied X-Forwarded-For must not change it.
    const echo = await call({ pathname: '/api/v1/reachability/echo', headers: { cookie } });
    step('(e1) reachability echo through the proxy: scope loopback, viaProxy, not verified', echo.status === 200 && echo.body?.observed?.scope === 'loopback' && echo.body?.observed?.viaProxy === true && echo.body?.verified === false, echo.body);
    const forged = await call({ pathname: '/api/v1/reachability/echo', headers: { cookie, 'x-forwarded-for': '203.0.113.9' } });
    step('(e2) client-forged X-Forwarded-For: 203.0.113.9 does NOT change the observed scope (Caddy overwrites it)', forged.status === 200 && forged.body?.observed?.scope === 'loopback' && forged.body?.verified === false, { status: forged.status, observed: forged.body?.observed, verified: forged.body?.verified });

    // (f) wrong Host: through Caddy (Caddy itself refuses an unknown Host) and straight at the Hub (Host guard).
    // Caddy answers an unknown Host itself (an empty 200 for an unmatched site): what matters is that the Hub is not served.
    const badHostCaddy = await request({ port: caddyPort, ca, pathname: '/api/v1/hello', headers: { host: 'evil.example' } });
    step('(f2) wrong Host through Caddy does not reach the Hub', badHostCaddy.body?.service !== 'dude-hub', { status: badHostCaddy.status, body: badHostCaddy.body });
    const badHostViaForward = await call({ pathname: '/api/v1/hello', headers: { 'x-forwarded-host': 'evil.example' } });
    step('(f3) client-supplied X-Forwarded-Host is not honoured through Caddy (Caddy overwrites it)', badHostViaForward.status === 200, { status: badHostViaForward.status });
    // Straight at the Hub (we are a trusted peer from 127.0.0.1): a forwarded/real Host outside the allowlist is 421, loopback is fine.
    const hubRoot = path.join(dataDir, 'config', 'tls', 'ca', 'ca-cert.pem'); // a new Hub issues its leaf from its local CA
    const hubCa = readFileSync(path.join(dataDir, 'config', 'tls', 'cert.pem'), 'utf8') + (existsSync(hubRoot) ? readFileSync(hubRoot, 'utf8') : '');
    const direct = (headers) => request({ port: hubPort, ca: hubCa, pathname: '/api/v1/hello', headers });
    const directBad = await direct({ host: 'evil.example' });
    const directFwdBad = await direct({ host: `localhost:${hubPort}`, 'x-forwarded-host': 'evil.example' });
    const directGood = await direct({ host: `localhost:${hubPort}` });
    step('(f4) direct to the Hub: Host evil.example and forwarded evil.example are 421, loopback Host is 200', directBad.status === 421 && directFwdBad.status === 421 && directGood.status === 200, { evil: directBad.status, forwardedEvil: directFwdBad.status, loopback: directGood.status });
  } finally {
    for (const child of children.reverse()) await stop(child);
    const leftover = children.filter((c) => c.exitCode === null && c.signalCode === null);
    step('(g) clean shutdown: Hub and Caddy stopped', leftover.length === 0, `${children.length} processes`);
    try { rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* best effort */ }
  }
}

const onSignal = () => {
  for (const c of children) {
    if (process.platform === 'win32' && c.pid !== undefined) spawnSync('taskkill', ['/PID', String(c.pid), '/T', '/F']);
    else { try { c.kill('SIGKILL'); } catch { /* gone */ } }
  }
  process.exit(1);
};
process.on('SIGINT', onSignal);
process.on('SIGTERM', onSignal);

main().then(
  () => process.exit(failures === 0 ? 0 : 1),
  (error) => { console.error(`FAIL  ${error instanceof Error ? error.message : String(error)}`); process.exit(1); },
);
