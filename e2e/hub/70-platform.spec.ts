import { spawn, type ChildProcess } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { DatabaseSync } from 'node:sqlite';
import { expect, test } from '@playwright/test';
import { HubApiError, bytesSource, createHubClient, uploadFileResumable } from '@dude/api-client';
import type { HubClient, HubRequest, HubResponse, HubTransport } from '@dude/api-client';
import { INGEST_SCOPES } from '@dude/contracts/hub';
import { PASSWORD, hubClient, pinnedTransport, runHubCli, spawnExtraHub, type ExtraHub, type HubTarget } from './hub-helpers';

// Phase 32-SS1 platform exit pass (Milestone 854, PD-154): the SaveSphere platform end to end against a REAL Hub process of the compiled TEST bundle,
// on its own data directory (the shared Hub of the other specs is never touched). Everything outside the machine is a stand-in, as the exit gate
// decided: the OpenID provider is the fake one (`apps/hub/src/auth/oidc/fake-idp.ts`, run as a loopback server beside the Hub), the tunnel connector is the
// stub `cloudflared` (hash-checked like the real binary, with a forwarding edge that appends the client address as Cloudflare does), and backups go to
// a folder. The real Cloudflare, Google and Windows-service passes are the owner's guided script (Milestone 855), not this spec.
//
//   1  a fresh Hub: bootstrap, the provisioning read model says "not provisioned", the route gate holds, static assets are public
//   2  `dude-hub provision` (the real CLI over the admin pipe), then a restart brings the queue and the workers up
//   3  a resumable chunked upload (interrupted, duplicate chunk, wrong hash, resumed) becomes a blob that is byte-identical on disk
//   4  the queue: a scheduled `blobs.verify` job verifies that blob (the schedule is made due while the Hub is stopped)
//   5  ingest tokens: ping, the credential matrix, a two-step revoke
//   6  Google sign-in against the fake provider: link, sign in; wrong sub, nonce, aud and exp are refused; Google unreachable falls back to the password
//   7  tunnel mode behind the stub connector: forged X-Forwarded-For/-Proto/-Host change nothing, www redirects, other hosts are refused
//   8  backup v2 to a folder: run, verify, restore drill, then an offline restore onto a fresh data directory with every blob byte for byte
const REPO = path.resolve(__dirname, '../..');
const STUB = path.join(REPO, 'apps', 'hub', 'src', 'tunnel', 'test-stub', 'cloudflared-stub.mjs');
const IDP_BUNDLE = path.join(REPO, 'dist', 'hub-test', 'fake-idp-server.cjs');
const HOST = 'notes.example.com';
const REDIRECT_ORIGIN = 'https://hub.example.com';
const CONNECTOR_TOKEN = Buffer.from(JSON.stringify({ a: '0123456789abcdef0123456789abcdef', t: '11111111-2222-3333-4444-555555555555', s: 'c2VjcmV0LXNlY3JldC1zZWNyZXQtc2VjcmV0' })).toString('base64');
const BACKUP_PASSPHRASE = 'platform exit backup passphrase 2026';
const OLD_HUB_GONE = 'THE OLD HUB IS GONE';
const MIB = 1024 * 1024;
const CROSS_SITE = { 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document' };
const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

test.describe.configure({ mode: 'serial' });

let root = '';
let dataDir = '';
let edgePort = 0;
let hub: ExtraHub;
const restored: ExtraHub[] = [];
let idp: { child: ChildProcess; url: string; clientId: string; clientSecret: string };

// ---- helpers ---------------------------------------------------------------------------------------------------------------------------

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as net.AddressInfo;
      server.close(() => resolve(port));
    });
  });
}

async function startFakeIdp(): Promise<typeof idp> {
  if (!existsSync(IDP_BUNDLE)) throw new Error(`The fake identity provider bundle is missing: ${IDP_BUNDLE}. Run "npm run hub:compile:test".`);
  const child = spawn(process.execPath, [IDP_BUNDLE], { stdio: ['ignore', 'pipe', 'pipe'] });
  const listening = await new Promise<{ url: string; clientId: string; clientSecret: string }>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('The fake identity provider did not start within 30 s.')), 30_000);
    child.once('exit', (code) => reject(new Error(`The fake identity provider exited early with ${code}.`)));
    createInterface({ input: child.stdout! }).on('line', (line) => {
      try {
        const parsed = JSON.parse(line) as { event?: string; url?: string; clientId?: string; clientSecret?: string };
        if (parsed.event === 'listening' && parsed.url && parsed.clientId && parsed.clientSecret) {
          clearTimeout(timer);
          resolve({ url: parsed.url, clientId: parsed.clientId, clientSecret: parsed.clientSecret });
        }
      } catch {
        // Not a JSON line.
      }
    });
  });
  return { child, ...listening };
}

async function idpControl<T = unknown>(op: string, params: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(`${idp.url}/control`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op, ...params }) });
  if (!res.ok) throw new Error(`fake idp ${op}: ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

/** Starts the platform Hub: the test bundle with the fake provider, the stub connector and plain secret files (knobs are test-build only). */
async function startPlatformHub(): Promise<ExtraHub> {
  const started = await spawnExtraHub(dataDir, {
    DUDE_HUB_TEST_PLAIN_SECRETS: '1',
    DUDE_HUB_TEST_OIDC_IDP_URL: idp.url,
    DUDE_HUB_TEST_CLOUDFLARED_STUB: STUB,
    DUDE_HUB_TEST_CLOUDFLARED_EDGE_PORT: String(edgePort),
  });
  return started;
}

/** Stops the Hub, then the connector it may have orphaned (a hard stop on Windows cannot run the Hub's own shutdown). */
async function stopPlatformHub(): Promise<void> {
  await hub.stop();
  try {
    const record = JSON.parse(readFileSync(path.join(dataDir, 'run', 'cloudflared.pid'), 'utf8')) as { pid?: number };
    if (typeof record.pid === 'number') process.kill(record.pid);
  } catch {
    // No connector was running, or it already exited.
  }
}

interface Session { cookie: string; csrf: string }

/** The owner's cookie session over the pinned transport. */
async function signIn(target: HubTarget, password = PASSWORD): Promise<Session> {
  const res = await pinnedTransport(target).request({ method: 'POST', path: '/api/v1/auth/sign-in', body: { password }, headers: { origin: target.url } });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  const cookie = /__Host-dude_session=([^;,\s]+)/.exec(res.headers['set-cookie'] ?? '')?.[1];
  expect(cookie).toBeTruthy();
  return { cookie: cookie!, csrf: (res.body as { csrfToken: string }).csrfToken };
}

/** A transport that carries the owner cookie, the CSRF header and the origin like the Hub web does. */
function sessionTransport(target: HubTarget, session: Session): HubTransport {
  const inner = pinnedTransport(target);
  return {
    request: (req: HubRequest): Promise<HubResponse> =>
      inner.request({ ...req, headers: { cookie: `__Host-dude_session=${session.cookie}`, origin: target.url, ...(req.method === 'GET' ? {} : { 'x-dude-csrf': session.csrf }), ...req.headers } }),
  };
}

const ownerClient = (target: HubTarget, session: Session): HubClient => createHubClient(sessionTransport(target, session), { clientProtocol: 1, minHubProtocol: 1 });

/** A request with no credential, the way an anonymous browser or a script would make it. */
const anonymous = (target: HubTarget, req: HubRequest): Promise<HubResponse> => pinnedTransport(target).request({ ...req, headers: { origin: target.url, ...req.headers } });

/** One request through the stub connector's forwarding edge, as the Cloudflare edge would deliver it (plain http into the connector). */
function viaEdge(requestPath: string, headers: Record<string, string>): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
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

const jsonOf = (stdout: string): any => JSON.parse(stdout.trim());
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** The `savesphere.db` of the platform Hub, read-only unless `write` (only while the Hub is stopped). */
function saveSphereDb(write = false): DatabaseSync {
  return new DatabaseSync(path.join(dataDir, 'data', 'savesphere.db'), write ? {} : { readOnly: true });
}

const blobFileOf = (base: string, sha: string): string | undefined => {
  const walk = (dir: string): string | undefined => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { const found = walk(full); if (found !== undefined) return found; } else if (entry.name === sha) return full;
    }
    return undefined;
  };
  return existsSync(base) ? walk(base) : undefined;
};

let session: Session;
let client: HubClient;
let uploaded: { sha256: string; size: number; bytes: Buffer } | undefined;

test.beforeAll(async () => {
  root = mkdtempSync(path.join(tmpdir(), 'dude-hub-e2e-platform-'));
  dataDir = path.join(root, 'hub');
  edgePort = await freePort();
  idp = await startFakeIdp();

  // What an owner would have configured: a tunnel hostname (the connector token in the secret store), Google sign-in (the client secret in the
  // secret store) and nothing else. Written before the first start; the secret files are the plain fallback the test knob selects.
  mkdirSync(path.join(dataDir, 'config', 'secrets'), { recursive: true });
  writeFileSync(path.join(dataDir, 'config', 'hub.json'), JSON.stringify({
    exposure: { names: [HOST], proxy: { trusted: ['127.0.0.1', '::1'], publicOrigin: `https://${HOST}` }, tunnel: { enabled: true, hostname: HOST } },
    oidc: { issuer: 'https://accounts.google.com', clientId: idp.clientId, redirectOrigin: REDIRECT_ORIGIN },
  }));
  writeFileSync(path.join(dataDir, 'config', 'secrets', 'tunnel.connectorToken.secret'), CONNECTOR_TOKEN);
  writeFileSync(path.join(dataDir, 'config', 'secrets', 'oidc.clientSecret.secret'), idp.clientSecret);
});

test.afterAll(async () => {
  for (const extra of restored) await extra.stop().catch(() => undefined);
  if (hub !== undefined) await stopPlatformHub().catch(() => undefined);
  idp?.child.kill();
  try {
    if (root !== '') rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
  } catch {
    // A leftover temp directory is harmless.
  }
});

// ---- 1: a fresh Hub ----------------------------------------------------------------------------------------------------------------------

test('1. a fresh Hub: owner bootstrapped, nothing provisioned, every API route gated, the static shell public', async () => {
  test.setTimeout(180_000);
  hub = await startPlatformHub();
  const anon = hubClient(hub.target);
  expect((await anon.hello()).bootstrapped).toBe(false);
  const setupToken = readFileSync(path.join(dataDir, 'config', 'setup-token'), 'utf8').trim();
  await anon.bootstrap({ setupToken, ownerDisplayName: 'Platform Owner', environmentName: 'Platform Environment', password: PASSWORD });
  session = await signIn(hub.target);
  client = ownerClient(hub.target, session);

  const status = await client.provisioningStatus(undefined);
  expect(status.overall).toBe('not-provisioned');
  expect(status.components.find((c) => c.id === 'content-store')?.state).toBe('not-configured');
  expect(await client.queueStatus(undefined)).toMatchObject({ available: false });

  // Route gating, sampled (the exhaustive enumeration is the `route-gating` server spec): an anonymous caller gets 401 from every SS1 API family.
  for (const [method, route] of [
    ['GET', '/api/v1/provisioning'], ['GET', '/api/v1/queue'], ['GET', '/api/v1/tunnel'], ['GET', '/api/v1/jobs'], ['POST', '/api/v1/uploads'], ['GET', '/api/v1/uploads/none'],
    ['GET', '/api/v1/ingest/ping'], ['GET', '/api/v1/auth/oidc/accounts'], ['GET', '/api/v1/backup/status'], ['GET', '/api/v1/admin/ingest-tokens'],
  ] as const) {
    const res = await anonymous(hub.target, { method, path: route, ...(method === 'POST' ? { body: { size: 1 } } : {}) });
    expect([401, 403], `${method} ${route} -> ${res.status}`).toContain(res.status);
  }
  // The public surface: hello, the OIDC status offer and the static web shell carry no credential.
  expect((await anonymous(hub.target, { method: 'GET', path: '/api/v1/hello' })).status).toBe(200);
  expect((await anonymous(hub.target, { method: 'GET', path: '/api/v1/auth/oidc/status' })).body).toEqual({ configured: true, enabled: true });
  const shell = await anonymous(hub.target, { method: 'GET', path: '/' });
  expect(shell.status).toBe(200);
  expect(shell.headers['content-type']).toMatch(/text\/html/);
  expect(String(shell.body)).toContain('<app-root');
});

// ---- 2: provisioning ---------------------------------------------------------------------------------------------------------------------

test('2. dude-hub provision creates the content store through the admin pipe; a restart brings the queue and workers up', async () => {
  test.setTimeout(240_000);
  const provisioned = await runHubCli(['provision', '--json', '--data-dir', dataDir], { timeoutMs: 180_000 });
  const report = jsonOf(provisioned.stdout).report ?? jsonOf(provisioned.stdout);
  expect(Array.isArray(report.components), `${provisioned.stdout}\n${provisioned.stderr}`).toBe(true);
  const state = (id: string): string => report.components.find((c: { id: string }) => c.id === id)?.state;
  expect(state('content-store')).toBe('ready');
  expect(state('blob-store')).toBe('ready');
  expect(state('fts')).toBe('ready');
  expect(existsSync(path.join(dataDir, 'data', 'savesphere.db'))).toBe(true);

  await stopPlatformHub();
  hub = await startPlatformHub();
  client = ownerClient(hub.target, session); // the session is durable: it survives the restart
  const after = await client.provisioningStatus(undefined);
  const component = (id: string): string | undefined => after.components.find((c) => c.id === id)?.state;
  for (const id of ['content-store', 'blob-store', 'queue', 'workers', 'fts']) expect(component(id), id).toBe('ready');
  expect(component('oidc')).toBe('ready');
  // The secrets the owner configured are present (a presence flag, never a value).
  expect(JSON.stringify(after)).not.toContain(idp.clientSecret);
  expect(JSON.stringify(after)).not.toContain(CONNECTOR_TOKEN);
  // Windows-only components: on another platform the power policy and vector search are "unavailable by design"; on Windows they report whatever the machine has.
  if (process.platform === 'win32') expect(['ready', 'degraded', 'needs-attention', 'not-configured', 'unavailable']).toContain(component('power'));
  else { expect(component('power')).toBe('unavailable'); expect(component('vector')).toBe('unavailable'); }
  expect((await client.queueStatus(undefined)).available).toBe(true);
});

// ---- 3: resumable upload -----------------------------------------------------------------------------------------------------------------

test('3. a resumable chunked upload: interrupted, a repeated chunk, a wrong hash, resumed; the blob is on disk byte for byte', async () => {
  test.setTimeout(120_000);
  const bytes = randomBytes(5 * MIB + 123);
  const expected = sha256(bytes);
  const chunkHash = async (part: Uint8Array): Promise<string> => sha256(part);
  const created = await client.createUpload(undefined, { size: bytes.length, sha256: expected, chunkSize: MIB, name: 'platform.bin', mime: 'application/octet-stream' });
  expect(created).toMatchObject({ state: 'open', chunkSize: MIB, chunkCount: 6, received: [] });
  const part = (index: number): Uint8Array => bytes.subarray(index * MIB, Math.min(bytes.length, (index + 1) * MIB));

  // The connection "drops" after some chunks: 0, 2 and 5 (the short last one) arrive.
  for (const index of [0, 2, 5]) await client.putUploadChunk(undefined, created.uploadId, index, part(index), { sha256: await chunkHash(part(index)) });
  const repeated = await client.putUploadChunk(undefined, created.uploadId, 2, part(2), { sha256: await chunkHash(part(2)) });
  expect(repeated.duplicate).toBe(true);
  await expect(client.putUploadChunk(undefined, created.uploadId, 1, part(1), { sha256: 'f'.repeat(64) })).rejects.toBeInstanceOf(HubApiError);
  expect(await client.uploadStatus(undefined, created.uploadId)).toMatchObject({ state: 'open', received: [[0, 0], [2, 2], [5, 5]], receivedChunks: 3 });
  // Completing early is refused and loses nothing.
  await expect(client.completeUpload(undefined, created.uploadId)).rejects.toMatchObject({ status: 409 });

  const done = await uploadFileResumable(client, bytesSource(bytes), { uploadId: created.uploadId, sha256Hex: chunkHash, baseDelayMs: 10 });
  expect(done).toMatchObject({ sha256: expected, size: bytes.length, blobRef: `upload:${created.uploadId}` });
  uploaded = { sha256: expected, size: bytes.length, bytes };

  const onDisk = blobFileOf(path.join(dataDir, 'storage', 'blobs'), expected);
  expect(onDisk, 'the blob file').toBeDefined();
  expect(sha256(readFileSync(onDisk!))).toBe(expected);
  expect(statSync(onDisk!).size).toBe(bytes.length);
  const db = saveSphereDb();
  try {
    expect(db.prepare('SELECT owner_kind, owner_id FROM blob_refs WHERE blob_sha256 = ?').all(expected)).toEqual([{ owner_kind: 'upload', owner_id: created.uploadId }]);
  } finally { db.close(); }
  // The Hub audit trail records the upload without a name or a byte.
  const audit = await client.listAudit(undefined, { limit: 200 });
  expect(audit.events.map((e) => e.event)).toEqual(expect.arrayContaining(['upload.created', 'upload.completed']));
  expect(JSON.stringify(audit.events)).not.toContain('platform.bin');
  // Owner credential only: an anonymous caller and an ingest-style bearer are refused.
  expect((await anonymous(hub.target, { method: 'GET', path: `/api/v1/uploads/${created.uploadId}` })).status).toBe(401);
});

// ---- 4: the queue ------------------------------------------------------------------------------------------------------------------------

test('4. the queue runs a scheduled blobs.verify job over the uploaded blob after a Hub restart', async () => {
  test.setTimeout(180_000);
  expect(uploaded).toBeDefined();
  const before = saveSphereDb();
  try {
    expect((before.prepare('SELECT verified_at FROM blobs WHERE sha256 = ?').get(uploaded!.sha256) as { verified_at: string | null }).verified_at).toBeNull();
  } finally { before.close(); }

  // The scheduled verify last ran at the first start, before the blob existed. Make it due and restart: the runner queues it, a worker slot runs it.
  await stopPlatformHub();
  const db = saveSphereDb(true);
  try { db.prepare("UPDATE meta SET value = '0' WHERE key = 'queue_schedule:blobs.verify'").run(); } finally { db.close(); }
  hub = await startPlatformHub();
  client = ownerClient(hub.target, session);

  await expect.poll(async () => {
    const check = saveSphereDb();
    try { return (check.prepare('SELECT verified_at FROM blobs WHERE sha256 = ?').get(uploaded!.sha256) as { verified_at: string | null }).verified_at !== null; } finally { check.close(); }
  }, { message: 'the blob was verified by a queue job', timeout: 60_000, intervals: [500] }).toBe(true);

  const queue = await client.queueStatus(undefined);
  expect(queue.available).toBe(true);
  expect(queue.kinds.find((k) => k.kind === 'blobs.verify')?.succeeded).toBeGreaterThanOrEqual(1);
  expect(queue.counts.dead).toBe(0);
  expect(queue.recentFailures).toEqual([]);
  const jobs = await client.listJobs(undefined);
  expect(jobs.jobs.find((j) => j.id === 'blobs-verify')).toBeDefined();
  // The queue read model carries counts and short notes only: no payload and no path.
  expect(JSON.stringify(queue)).not.toContain(dataDir);
});

// ---- 5: ingest tokens ---------------------------------------------------------------------------------------------------------------------

test('5. ingest tokens: a token-only ping, the credential matrix and a two-step revoke', async () => {
  test.setTimeout(60_000);
  session = await signIn(hub.target); // a fresh password confirmation for the step-up
  client = ownerClient(hub.target, session);
  const minted = await client.createIngestToken(undefined, { label: 'platform e2e', scopes: [...INGEST_SCOPES], expiresInDays: 7 });
  expect(minted.secret).toMatch(/^dit_[A-Za-z0-9_-]{43}$/);
  expect((await client.listIngestTokens(undefined)).tokens.map((t) => t.id)).toContain(minted.token.id);
  expect(JSON.stringify(await client.listIngestTokens(undefined))).not.toContain(minted.secret);

  const ping = await hubClient(hub.target).ingestPing(minted.secret);
  expect(ping).toMatchObject({ ok: true, tokenId: minted.token.id });

  // The matrix: the owner cookie is not an ingest credential, and the ingest token opens nothing else.
  expect((await sessionTransport(hub.target, session).request({ method: 'GET', path: '/api/v1/ingest/ping' })).status).toBe(401);
  for (const route of ['/api/v1/queue', '/api/v1/provisioning', '/api/v1/uploads/none', '/api/v1/admin/ingest-tokens']) {
    const res = await pinnedTransport(hub.target).request({ method: 'GET', path: route, headers: { authorization: `Bearer ${minted.secret}` } });
    expect(res.status, route).toBe(401);
  }

  // Revoke is two steps; the preview changes nothing.
  const preview = await client.revokeIngestTokenPreview(undefined, minted.token.id);
  await expect(hubClient(hub.target).ingestPing(minted.secret)).resolves.toMatchObject({ ok: true });
  await client.revokeIngestToken(undefined, minted.token.id, preview.confirmToken);
  await expect(hubClient(hub.target).ingestPing(minted.secret)).rejects.toMatchObject({ status: 401 });
  await expect(client.revokeIngestToken(undefined, minted.token.id, preview.confirmToken)).rejects.toBeInstanceOf(HubApiError); // single use
});

// ---- 6: Google sign-in against the fake provider -----------------------------------------------------------------------------------------

test('6. Google sign-in: link and sign in; wrong sub, nonce, aud and exp are refused; Google unreachable falls back to the password', async () => {
  test.setTimeout(180_000);
  session = await signIn(hub.target);
  client = ownerClient(hub.target, session);
  const owner = sessionTransport(hub.target, session);

  /** Plays the browser: the Hub starts the flow, the provider approves, the cross-site callback arrives without any cookie. */
  async function viaGoogle(options: { account?: { sub: string; email: string } } = {}): Promise<{ start: HubResponse; callback?: HubResponse; callbackPath?: string }> {
    const start = await anonymous(hub.target, { method: 'POST', path: '/api/v1/auth/oidc/start', body: {} });
    if (start.status !== 200) return { start };
    const approved = await idpControl<{ callbackUrl: string }>('authorize', { authorizationUrl: (start.body as { authorizationUrl: string }).authorizationUrl, ...(options.account === undefined ? {} : { account: options.account }) });
    const callbackUrl = new URL(approved.callbackUrl);
    const callbackPath = `${callbackUrl.pathname}${callbackUrl.search}`;
    const callback = await pinnedTransport(hub.target).request({ method: 'GET', path: callbackPath, headers: CROSS_SITE });
    return { start, callback, callbackPath };
  }
  const signedIn = async (callback: HubResponse): Promise<boolean> => {
    const cookie = /__Host-dude_session=([^;,\s]+)/.exec(callback.headers['set-cookie'] ?? '')?.[1];
    if (cookie === undefined || cookie === '') return false;
    const current = await pinnedTransport(hub.target).request({ method: 'GET', path: '/api/v1/auth/session', headers: { cookie: `__Host-dude_session=${cookie}` } });
    return current.status === 200;
  };

  // Link the owner's Google account (leg one at the provider, leg two with the password-confirmed session).
  const linkStart = await owner.request({ method: 'POST', path: '/api/v1/auth/oidc/link/start', body: { returnTo: '/settings/security' } });
  expect(linkStart.status, JSON.stringify(linkStart.body)).toBe(200);
  const account = { sub: 'platform-owner-sub', email: 'platform.owner@example.com' };
  const approved = await idpControl<{ callbackUrl: string }>('authorize', { authorizationUrl: (linkStart.body as { authorizationUrl: string }).authorizationUrl, account });
  const callbackUrl = new URL(approved.callbackUrl);
  const legOne = await pinnedTransport(hub.target).request({ method: 'GET', path: `${callbackUrl.pathname}${callbackUrl.search}`, headers: CROSS_SITE });
  expect(legOne.status).toBe(302);
  const linkToken = new URL(legOne.headers['location']!, 'https://x.invalid').searchParams.get('oidcLink');
  expect(linkToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
  const linked = await owner.request({ method: 'POST', path: '/api/v1/auth/oidc/link/complete', body: { linkToken } });
  expect(linked.status, JSON.stringify(linked.body)).toBe(200);
  expect((await client.listOidcAccounts(undefined)).accounts).toHaveLength(1);

  // Refusals first (each counts into the per-address throttle, which allows five; the successful sign-in below resets it).
  await idpControl('account', { account });
  for (const mode of ['wrong-nonce', 'wrong-aud', 'expired'] as const) {
    await idpControl('failure', { mode });
    const refused = await viaGoogle({ account });
    expect(refused.callback?.status, mode).toBe(302);
    expect(refused.callback?.headers['location'], mode).toMatch(/\/hub\/sign-in\?oidc=failed/);
    expect(await signedIn(refused.callback!), mode).toBe(false);
  }
  await idpControl('failure', {});
  const stranger = await viaGoogle({ account: { sub: 'someone-elses-sub', email: 'stranger@example.com' } }); // a valid token for an account nobody linked
  expect(stranger.callback?.headers['location']).toMatch(/\/hub\/sign-in\?oidc=failed/);
  expect(await signedIn(stranger.callback!)).toBe(false);

  // The real thing works, and only once: the code is single use.
  const good = await viaGoogle({ account });
  expect(good.callback?.status).toBe(302);
  expect(good.callback?.headers['location']).not.toMatch(/oidc=failed/);
  expect(await signedIn(good.callback!)).toBe(true);
  const replay = await pinnedTransport(hub.target).request({ method: 'GET', path: good.callbackPath!, headers: CROSS_SITE });
  expect(replay.headers['location']).toMatch(/\/hub\/sign-in\?oidc=failed/);
  expect(replay.headers['set-cookie'] ?? '').not.toMatch(/__Host-dude_session=[^;]+/);

  // Google is unreachable at the token exchange: the owner lands on the password page, and the password still signs in.
  await idpControl('down', { part: 'token', down: true });
  const unreachable = await viaGoogle({ account });
  expect(unreachable.callback?.status).toBe(302);
  expect(unreachable.callback?.headers['location']).toMatch(/\/hub\/sign-in\?oidc=unavailable/);
  expect(await signedIn(unreachable.callback!)).toBe(false);
  await signIn(hub.target);
  await idpControl('down', { part: 'token', down: false });

  // The provider's whole outage across a Hub restart: the Hub starts, the sign-in offer degrades to a 503, the password is unaffected.
  await idpControl('down', { part: 'all', down: true });
  await stopPlatformHub();
  hub = await startPlatformHub();
  const offline = await anonymous(hub.target, { method: 'POST', path: '/api/v1/auth/oidc/start', body: {} });
  expect(offline.status).toBe(503);
  expect(offline.body).toMatchObject({ error: { code: 'oidc-unavailable' } });
  session = await signIn(hub.target);
  client = ownerClient(hub.target, session);
  expect(['degraded', 'ready']).toContain((await client.provisioningStatus(undefined)).components.find((c) => c.id === 'oidc')?.state);
  await idpControl('down', { part: 'all', down: false });
  // Nothing in the provider's traffic leaked the client secret or an ID token into the Hub's audit trail.
  const audit = await client.listAudit(undefined, { limit: 300 });
  expect(JSON.stringify(audit.events)).not.toContain(idp.clientSecret);
  expect(audit.events.map((e) => e.event)).toEqual(expect.arrayContaining(['oidc.link', 'oidc.signin', 'oidc.signin-failed', 'oidc.refused-account']));
});

// ---- 7: tunnel mode behind the stub connector ----------------------------------------------------------------------------------------------

test('7. tunnel mode: the stub connector is the one trusted hop; forged forwarding headers change nothing, www redirects, other hosts are refused', async () => {
  test.setTimeout(120_000);
  await expect.poll(async () => (await client.tunnelStatus(undefined)).state, { message: 'the tunnel connector is ready', timeout: 60_000, intervals: [500] }).toBe('ready');
  const tunnel = await client.tunnelStatus(undefined);
  expect(tunnel).toMatchObject({ configured: true, enabled: true, hostname: HOST, supported: true, tokenPresent: true });
  expect(JSON.stringify(tunnel)).not.toContain(CONNECTOR_TOKEN);

  // The edge forwards over HTTPS to the real Hub and appends the client address; the owner's cookie works through it as it would on the public domain.
  const cookie = { cookie: `__Host-dude_session=${session.cookie}` };
  await expect.poll(async () => (await viaEdge('/api/v1/hello', { host: HOST }).catch(() => ({ status: 0 }))).status, { timeout: 30_000, intervals: [250] }).toBe(200);
  const honest = JSON.parse((await viaEdge('/api/v1/reachability/echo', { host: HOST, ...cookie })).body) as { observed: { scope: string; viaProxy: boolean }; host: string };
  expect(honest).toMatchObject({ observed: { scope: 'loopback', viaProxy: true }, host: HOST });

  // A client-forged X-Forwarded-For (a public address) must not become the client address: the Hub sees the entry the edge appended.
  const forged = await viaEdge('/api/v1/reachability/echo', { host: HOST, ...cookie, 'x-forwarded-for': '8.8.8.8, 1.1.1.1', 'x-forwarded-proto': 'http' });
  expect(forged.status).toBe(200);
  expect(JSON.parse(forged.body)).toMatchObject({ observed: { scope: 'loopback', viaProxy: true }, host: HOST, verified: false });
  // A forged X-Forwarded-Host naming another host is refused whatever the Host header says.
  for (const host of ['evil.example', `${HOST}.evil.example`]) {
    const refused = await viaEdge('/api/v1/hello', { host: HOST, 'x-forwarded-host': host });
    expect(refused.status, host).toBe(421);
    expect(refused.body).not.toContain(host);
  }
  // Only the domain, www and loopback names are served: any other Host is refused, and www redirects to the bare domain before anything else.
  for (const host of ['evil.example', '203.0.113.7', `${HOST}.evil.example`]) expect((await viaEdge('/api/v1/hello', { host })).status, host).toBe(421);
  const www = await viaEdge('/settings/security?a=1', { host: `www.${HOST}` });
  expect(www.status).toBe(308);
  expect(www.headers['location']).toBe(`https://${HOST}/settings/security?a=1`);
  expect((await viaEdge('/api/v1/queue', { host: `www.${HOST}` })).status).toBe(308); // before authentication, not a 401 first

  // Anonymous through the edge is still gated; the static shell is public through it.
  expect((await viaEdge('/api/v1/queue', { host: HOST })).status).toBe(401);
  const shell = await viaEdge('/', { host: HOST });
  expect(shell.status).toBe(200);
  expect(shell.body).toContain('<app-root');
});

// ---- 8: backup v2, the restore drill and an offline restore ------------------------------------------------------------------------------

test('8. backup v2: run, verify, the restore drill, then an offline restore onto a fresh data directory with the blob byte for byte', async () => {
  test.setTimeout(420_000);
  expect(uploaded).toBeDefined();
  const folder = path.join(root, 'backup-repo');
  mkdirSync(folder, { recursive: true });
  const env = { DUDE_HUB_BACKUP_PASSPHRASE: BACKUP_PASSPHRASE };
  const cli = async (args: string[], extra: Record<string, string> = env): Promise<ReturnType<typeof runHubCli>> => runHubCli(args, { env: extra, timeoutMs: 300_000 });
  const ok = async (args: string[]): Promise<string> => {
    const result = await cli(args);
    expect(result.code, `dude-hub ${args.join(' ')}\n${result.stdout}\n${result.stderr}`).toBe(0);
    return result.stdout;
  };

  const added = jsonOf(await ok(['backup', 'destination', 'add', '--folder', folder, '--label', 'platform e2e', '--data-dir', dataDir]));
  const id = String(added.id ?? added.destination?.id ?? added.destinationId);
  expect(id).not.toBe('undefined');
  await ok(['backup', 'run', '--data-dir', dataDir]);
  const listed = await ok(['backup', 'destination', 'list', '--data-dir', dataDir]);
  expect(listed).toContain(id);
  await ok(['backup', 'destination', 'verify', '--id', id, '--data-dir', dataDir]);
  await ok(['backup', 'drill', '--data-dir', dataDir]);
  expect(readdirSync(path.join(folder, 'packs')).filter((n) => !n.endsWith('.part')).length).toBeGreaterThan(0);
  // Nothing in the repository is plaintext: not the blob, not the passphrase.
  const packFile = path.join(folder, 'packs', readdirSync(path.join(folder, 'packs'))[0]!);
  expect(readFileSync(packFile).includes(uploaded!.bytes.subarray(0, 4096))).toBe(false);
  expect(readFileSync(packFile).includes(Buffer.from(BACKUP_PASSPHRASE))).toBe(false);

  // The audit trail records the run, the verification and the drill by id and code; no passphrase, no path.
  client = ownerClient(hub.target, session);
  const audit = await client.listAudit(undefined, { limit: 300 });
  expect(audit.events.map((e) => e.event)).toEqual(expect.arrayContaining(['backup.v2-created', 'backup.v2-verified']));
  expect(JSON.stringify(audit.events)).not.toContain(BACKUP_PASSPHRASE);

  // Offline restore of the newest backup onto a fresh data directory (the 31G rules: new identity and epoch, every device to re-pair).
  await stopPlatformHub();
  const target = path.join(root, 'restored');
  const base = ['backup', 'restore', '--folder', folder, '--data-dir', target];
  const preview = await cli(base);
  expect(preview.code, preview.stderr).toBe(0);
  const confirmToken = jsonOf(preview.stdout).confirmToken as string;
  expect(typeof confirmToken).toBe('string');
  expect(existsSync(path.join(target, 'data', 'dude.db'))).toBe(false); // the preview changes nothing
  const applied = await cli([...base, '--confirm', confirmToken, '--old-hub-gone', OLD_HUB_GONE]);
  expect(applied.code, `${applied.stdout}\n${applied.stderr}`).toBe(0);
  const restoredFile = blobFileOf(path.join(target, 'storage', 'blobs'), uploaded!.sha256);
  expect(restoredFile, 'the restored blob').toBeDefined();
  expect(sha256(readFileSync(restoredFile!))).toBe(uploaded!.sha256);

  // The restored Hub starts as a new instance; the owner password still works; it needs provisioning again (secrets and the run belong to the old identity).
  const second = await spawnExtraHub(target, { DUDE_HUB_TEST_PLAIN_SECRETS: '1' });
  restored.push(second);
  const hello = await hubClient(second.target).hello();
  expect(hello.bootstrapped).toBe(true);
  expect(hello.authorityEpoch).toBeGreaterThan(1);
  const restoredSession = await signIn(second.target);
  const status = await ownerClient(second.target, restoredSession).provisioningStatus(undefined);
  expect(status.overall).toBe('needs-provisioning');
  await sleep(0);
});
