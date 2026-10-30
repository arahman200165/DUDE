// The SaveSphere platform half of the `docker-smoke` CI job (32-SS1, Milestone 854): against the running, already bootstrapped Hub container it
// provisions the content store through the real CLI, restarts the container, and then proves the platform works in the Docker image and that the
// Windows-only parts say so plainly:
//   - provisioning: content store, blob store, FTS, queue and workers `ready`; vector search, the managed tunnel and the power policy `unavailable`
//     (by design: no sqlite-vec build for musl, no cloudflared and no powercfg in the image), never an error and never `needs-attention`;
//   - a resumable chunked upload (a repeated chunk, a wrong hash) becomes a blob on the volume, byte for byte (`sha256sum` inside the container);
//   - the durable queue runs its scheduled jobs (nothing dead, nothing failed);
//   - an ingest token pings and is then revoked in two steps;
//   - backup v2 to a folder on the volume: destination add, run, verify, restore drill, then an offline restore into a scratch directory with the blob intact.
// Usage: node scripts/docker-smoke-platform.mjs [--container hub] [--port 47600] [--password <owner password>]
// Needs Docker, Node 20 or newer, and the container from the earlier smoke steps. It is also the local replay: build the image, start the container as
// the workflow does, bootstrap the owner with the same password, run this. Exit 0 = every step passed.
import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import https from 'node:https';
import { tmpdir } from 'node:os';
import path from 'node:path';

const arg = (name, fallback) => {
  const at = process.argv.indexOf(name);
  return at >= 0 && process.argv[at + 1] !== undefined ? process.argv[at + 1] : fallback;
};
const container = arg('--container', 'hub');
const port = Number(arg('--port', '47600'));
const password = arg('--password', 'correct horse battery staple 42');
const BACKUP_PASSPHRASE = 'docker smoke backup passphrase 2026';
const MIB = 1024 * 1024;
const HUB = '/opt/dude-hub/dude-hub.cjs';
const work = mkdtempSync(path.join(tmpdir(), 'dude-docker-smoke-'));
const steps = [];
const step = (name) => { steps.push(name); console.log(`\n== ${name}`); };
function assert(condition, message) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function docker(args, { allowFailure = false, input } = {}) {
  const result = spawnSync('docker', args, { encoding: 'utf8', input, maxBuffer: 64 * MIB });
  if (!allowFailure && result.status !== 0) throw new Error(`docker ${args.join(' ')} exited ${result.status}\n${result.stdout ?? ''}\n${result.stderr ?? ''}`);
  return result;
}
/** `dude-hub` inside the container, as the image's own user, with extra environment. */
const hubCli = (args, env = {}, options = {}) => docker(['exec', ...Object.entries(env).flatMap(([k, v]) => ['-e', `${k}=${v}`]), container, 'node', HUB, ...args], options);

async function waitHealthy() {
  for (let i = 0; i < 60; i += 1) {
    const status = docker(['inspect', '-f', '{{.State.Health.Status}}', container], { allowFailure: true }).stdout.trim();
    if (status === 'healthy') return;
    await sleep(2000);
  }
  throw new Error('The Hub container did not become healthy.');
}

let ca = '';
function request(method, requestPath, { body, raw, headers = {}, cookie } = {}) {
  return new Promise((resolve, reject) => {
    const payload = raw !== undefined ? raw : body === undefined ? undefined : Buffer.from(JSON.stringify(body));
    const req = https.request({
      host: '127.0.0.1', port, path: requestPath, method, ca, servername: 'localhost',
      headers: {
        host: `localhost:${port}`, accept: 'application/json',
        ...(method === 'GET' ? {} : { origin: `https://localhost:${port}` }),
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(payload !== undefined ? { 'content-length': String(payload.length) } : {}),
        ...(cookie !== undefined ? { cookie: `__Host-dude_session=${cookie.value}`, ...(method === 'GET' ? {} : { 'x-dude-csrf': cookie.csrf }) } : {}),
        ...headers,
      },
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json;
        try { json = text === '' ? undefined : JSON.parse(text); } catch { json = undefined; }
        resolve({ status: res.statusCode, headers: res.headers, text, json });
      });
    });
    req.on('error', reject);
    if (payload !== undefined) req.write(payload);
    req.end();
  });
}

async function signIn() {
  const res = await request('POST', '/api/v1/auth/sign-in', { body: { password } });
  assert(res.status === 200, `sign-in returned ${res.status}: ${res.text.slice(0, 200)}`);
  const value = /__Host-dude_session=([^;,\s]+)/.exec([].concat(res.headers['set-cookie'] ?? []).join(','))?.[1];
  assert(value, 'sign-in set the session cookie');
  return { value, csrf: res.json.csrfToken };
}

async function main() {
  step('trust the container certificate');
  docker(['cp', `${container}:/data/config/tls/cert.pem`, path.join(work, 'cert.pem')]);
  const rootCopy = docker(['cp', `${container}:/data/config/tls/ca/ca-cert.pem`, path.join(work, 'ca-cert.pem')], { allowFailure: true });
  ca = readFileSync(path.join(work, 'cert.pem'), 'utf8') + (rootCopy.status === 0 ? readFileSync(path.join(work, 'ca-cert.pem'), 'utf8') : '');
  let cookie = await signIn();
  const owner = (method, p, options = {}) => request(method, p, { ...options, cookie });

  step('before provisioning: not provisioned, the queue is off, the tunnel is unsupported');
  const before = await owner('GET', '/api/v1/provisioning');
  assert(before.status === 200, `GET /provisioning returned ${before.status}`);
  assert(before.json.overall === 'not-provisioned', `overall before provisioning is ${before.json.overall}`);
  assert((await owner('GET', '/api/v1/queue')).json.available === false, 'the queue is unavailable before the content store exists');
  const tunnel = await owner('GET', '/api/v1/tunnel');
  assert(tunnel.status === 200 && tunnel.json.supported === false, `the tunnel reports supported=${tunnel.json?.supported} (expected false in the Docker image)`);
  assert(tunnel.json.state === 'not-configured', `the tunnel state is ${tunnel.json.state}`);

  step('dude-hub provision (the real CLI over the admin pipe), then restart so the queue starts');
  const provisioned = hubCli(['provision', '--json'], {}, { allowFailure: true });
  console.log(provisioned.stdout.slice(0, 1500), provisioned.stderr.slice(0, 600));
  const report = JSON.parse(provisioned.stdout.trim());
  const fresh = report.report ?? report;
  assert(Array.isArray(fresh.components), 'provision --json printed a report');
  // Exit 1 is expected here: the queue reads "started without it" (needs-attention) until the restart below; 2 would be a usage error or a Hub that is not running.
  assert(provisioned.status === 0 || provisioned.status === 1, `dude-hub provision exited ${provisioned.status}`);
  docker(['restart', container]);
  await waitHealthy();
  await sleep(1500);
  cookie = await signIn();

  step('after provisioning: the platform components are ready and the Windows-only ones are "unavailable on this platform"');
  const after = await owner('GET', '/api/v1/provisioning');
  const state = (id) => after.json.components.find((c) => c.id === id)?.state;
  console.log(after.json.components.map((c) => `${c.id}=${c.state}`).join(' '), `overall=${after.json.overall}`);
  for (const id of ['content-store', 'blob-store', 'fts', 'queue', 'workers']) assert(state(id) === 'ready', `${id} is ${state(id)}, expected ready`);
  for (const id of ['vector', 'tunnel', 'power']) assert(state(id) === 'unavailable', `${id} is ${state(id)}, expected unavailable in the Docker image`);
  assert(after.json.overall !== 'needs-attention' && after.json.overall !== 'not-provisioned', `overall is ${after.json.overall}`);
  const tunnelAfter = await owner('GET', '/api/v1/tunnel');
  assert(tunnelAfter.json.supported === false, 'the tunnel is still unsupported after provisioning');

  step('resumable upload: a repeated chunk, a wrong hash, then complete; the blob is byte-identical on the volume');
  const bytes = randomBytes(3 * MIB + 17);
  const expected = sha256(bytes);
  const created = await owner('POST', '/api/v1/uploads', { body: { size: bytes.length, sha256: expected, chunkSize: MIB, name: 'smoke.bin' } });
  assert(created.status === 201, `create upload returned ${created.status}: ${created.text.slice(0, 200)}`);
  const id = created.json.uploadId;
  const part = (index) => bytes.subarray(index * MIB, Math.min(bytes.length, (index + 1) * MIB));
  const put = (index, hash) => owner('PUT', `/api/v1/uploads/${id}/chunks/${index}`, { raw: part(index), headers: { 'content-type': 'application/octet-stream', 'x-chunk-sha256': hash ?? sha256(part(index)) } });
  for (const index of [0, 3]) assert((await put(index)).status === 200, `chunk ${index} was accepted`);
  assert((await put(0)).json.duplicate === true, 'a repeated chunk is a safe duplicate');
  assert((await put(1, 'f'.repeat(64))).status >= 400, 'a chunk with the wrong hash is refused');
  assert((await owner('POST', `/api/v1/uploads/${id}/complete`)).status === 409, 'completing early is refused');
  for (const index of [1, 2]) assert((await put(index)).status === 200, `chunk ${index} was accepted`);
  const done = await owner('POST', `/api/v1/uploads/${id}/complete`);
  assert(done.status === 200 && done.json.sha256 === expected && done.json.size === bytes.length, `complete returned ${done.status}: ${done.text.slice(0, 200)}`);
  const onDisk = docker(['exec', container, 'sh', '-c', `sha256sum /data/storage/blobs/${expected.slice(0, 2)}/${expected.slice(2, 4)}/${expected}`]).stdout.split(/\s+/)[0];
  assert(onDisk === expected, `the blob on the volume hashes to ${onDisk}, expected ${expected}`);
  assert((await request('GET', `/api/v1/uploads/${id}`)).status === 401, 'an anonymous caller cannot read an upload session');

  step('the durable queue ran its scheduled jobs without a failure');
  let queue;
  for (let i = 0; i < 40; i += 1) {
    queue = (await owner('GET', '/api/v1/queue')).json;
    if (queue.available && queue.counts.succeeded >= 1) break;
    await sleep(1500);
  }
  assert(queue.available === true, 'the queue is available');
  assert(queue.counts.succeeded >= 1, `no queue job succeeded (${JSON.stringify(queue.counts)})`);
  assert(queue.counts.dead === 0 && queue.counts.failed === 0, `the queue has failed jobs: ${JSON.stringify(queue.recentFailures)}`);

  step('ingest token: ping, then a two-step revoke');
  const minted = await owner('POST', '/api/v1/admin/ingest-tokens', { body: { label: 'docker smoke', scopes: ['ingest:ping'], expiresInDays: 1 } });
  assert(minted.status === 201 || minted.status === 200, `create ingest token returned ${minted.status}: ${minted.text.slice(0, 200)}`);
  const secret = minted.json.secret;
  const ping = await request('GET', '/api/v1/ingest/ping', { headers: { authorization: `Bearer ${secret}` } });
  assert(ping.status === 200 && ping.json.ok === true, `ingest ping returned ${ping.status}`);
  assert((await owner('GET', '/api/v1/ingest/ping')).status === 401, 'the owner cookie is not an ingest credential');
  const preview = await owner('POST', `/api/v1/admin/ingest-tokens/${minted.json.token.id}/revoke/preview`);
  assert(preview.status === 200, `revoke preview returned ${preview.status}`);
  const revoked = await owner('POST', `/api/v1/admin/ingest-tokens/${minted.json.token.id}/revoke`, { body: { confirmToken: preview.json.confirmToken } });
  assert(revoked.status === 200, `revoke returned ${revoked.status}`);
  assert((await request('GET', '/api/v1/ingest/ping', { headers: { authorization: `Bearer ${secret}` } })).status === 401, 'a revoked token is refused');

  step('backup v2 to a folder on the volume: add, run, verify, drill, then an offline restore into a scratch directory');
  const env = { DUDE_HUB_BACKUP_PASSPHRASE: BACKUP_PASSPHRASE };
  const added = hubCli(['backup', 'destination', 'add', '--folder', '/data/smoke-repo', '--label', 'docker smoke'], env);
  const destination = JSON.parse(added.stdout.trim());
  const destinationId = String(destination.id ?? destination.destination?.id ?? destination.destinationId);
  assert(destinationId !== 'undefined', `destination add printed no id: ${added.stdout}`);
  hubCli(['backup', 'run'], env);
  hubCli(['backup', 'destination', 'verify', '--id', destinationId], env);
  hubCli(['backup', 'drill'], env);
  const base = ['backup', 'restore', '--folder', '/data/smoke-repo', '--data-dir', '/tmp/smoke-restored'];
  const restorePreview = JSON.parse(hubCli(base, env).stdout.trim());
  assert(typeof restorePreview.confirmToken === 'string', 'the restore preview printed a confirm token');
  hubCli([...base, '--confirm', restorePreview.confirmToken, '--old-hub-gone', 'THE OLD HUB IS GONE'], env);
  const restoredHash = docker(['exec', container, 'sh', '-c', `sha256sum /tmp/smoke-restored/storage/blobs/${expected.slice(0, 2)}/${expected.slice(2, 4)}/${expected}`]).stdout.split(/\s+/)[0];
  assert(restoredHash === expected, 'the restored blob is byte-identical');
  docker(['exec', container, 'rm', '-rf', '/tmp/smoke-restored']);

  console.log(`\nOK: ${steps.length} steps passed.`);
}

let failure;
try {
  await main();
} catch (error) {
  failure = error;
  console.error(`\nFAILED at step "${steps.at(-1) ?? 'setup'}": ${error.message}`);
  console.error(docker(['logs', '--tail', '60', container], { allowFailure: true }).stdout);
}
if (existsSync(work)) rmSync(work, { recursive: true, force: true });
process.exit(failure ? 1 : 0);
