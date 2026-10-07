// End-to-end check of the Windows service lifecycle (Phase 31C acceptance): install an "N-1" Hub, bootstrap it,
// restart, update to the staged build, toggle LAN mode, run doctor, uninstall, reinstall, and clean up.
//
// Needs an elevated Windows session and `npm run hub:stage`. Elsewhere it prints "skipped" and exits 0
// unless --require is given (CI passes --require so a skipped run fails).
import { execFileSync, spawnSync } from 'node:child_process';
import { X509Certificate, createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import https from 'node:https';
import net from 'node:net';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const required = process.argv.includes('--require');

const elevated = () => process.platform === 'win32' && spawnSync('fltmc', [], { windowsHide: true }).status === 0;
if (process.platform !== 'win32' || !elevated()) {
  if (!required) {
    console.log('skipped: requires elevated Windows');
    process.exit(0);
  }
  console.error('--require was given but this is not an elevated Windows session.');
  process.exit(1);
}

const stage = path.join(root, 'dist', 'hub-stage');
if (!existsSync(path.join(stage, 'dude-hub.exe')) || !existsSync(path.join(stage, 'DudeHub.exe'))) {
  console.error('dist/hub-stage is missing. Run "npm run hub:stage" first.');
  process.exit(1);
}

const OLD_VERSION = process.env['DUDE_CI_OLD_VERSION'] || '0.0.0-ci-old';
const PASSWORD = 'ci-check-password-1234';
const steps = [];
const step = (name) => { steps.push(name); console.log(`\n== ${name}`); };
function assert(condition, message) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function run(exe, args, { expect = 0, label } = {}) {
  const result = spawnSync(exe, args, { encoding: 'utf8', windowsHide: true, timeout: 180_000 });
  const text = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
  if (text) console.log(text.length > 1500 ? `${text.slice(0, 1500)}...` : text);
  if (expect !== null && result.status !== expect) throw new Error(`${label ?? `${path.basename(exe)} ${args.join(' ')}`} exited ${result.status} (expected ${expect})`);
  return result;
}
const json = (result) => JSON.parse(result.stdout);

const freePort = () => new Promise((resolve, reject) => {
  const server = net.createServer();
  server.listen(0, '127.0.0.1', () => { const { port } = server.address(); server.close(() => resolve(port)); });
  server.on('error', reject);
});

const spki = (certificate) => createHash('sha256').update(new X509Certificate(certificate).publicKey.export({ type: 'spki', format: 'der' })).digest('base64url');

function pinnedRequest(dataDir, port, method, requestPath, body) {
  const pem = readFileSync(path.join(dataDir, 'config', 'tls', 'cert.pem'), 'utf8');
  const pin = spki(pem);
  const rootFile = path.join(dataDir, 'config', 'tls', 'ca', 'ca-cert.pem'); // new Hubs issue their leaf from a local CA
  const trust = existsSync(rootFile) ? [pem, readFileSync(rootFile, 'utf8')] : pem;
  return new Promise((resolve, reject) => {
    const req = https.request({
      host: '127.0.0.1', port, path: requestPath, method, ca: trust, servername: 'localhost',
      headers: body ? { 'content-type': 'application/json', origin: `https://localhost:${port}`, host: `localhost:${port}` } : {},
      checkServerIdentity: (_host, cert) => (spki(cert.raw) === pin ? undefined : new Error('pin mismatch')),
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    req.end(body ? JSON.stringify(body) : undefined);
  });
}
const hello = async (dataDir, port) => JSON.parse((await pinnedRequest(dataDir, port, 'GET', '/api/v1/hello')).body);

const serviceExists = () => spawnSync('sc.exe', ['query', 'DudeHub'], { windowsHide: true }).status !== 1060;
const ruleExists = () => spawnSync('netsh', ['advfirewall', 'firewall', 'show', 'rule', 'name=DUDE Hub (LAN)'], { windowsHide: true }).status === 0;
const processes = () => execFileSync('tasklist', ['/FO', 'CSV', '/NH'], { encoding: 'utf8', windowsHide: true }).toLowerCase();

const programData = process.env['ProgramData'] || 'C:\\ProgramData';
const base = path.join(programData, `DUDE-CI-${process.pid}`);
const installDir = path.join(base, 'Program Files', 'DUDE Hub');
const dataDir = path.join(base, 'Data', 'Hub');
const oldStage = path.join(root, 'dist', 'hub-ci-old-stage');
let port;

async function main() {
  port = await freePort();
  const cli = path.join(stage, 'dude-hub.exe');
  const common = ['--install-dir', installDir, '--data-dir', dataDir];
  const currentVersion = run(cli, ['version']).stdout.trim();

  step(`build N-1 Hub (${OLD_VERSION})`);
  const { buildHub } = await import('./build-hub.mjs');
  const { buildHubSea } = await import('./build-hub-sea.mjs');
  const oldBuild = path.join(root, 'dist', 'hub-ci-old');
  mkdirSync(oldBuild, { recursive: true });
  await buildHub({ outfile: path.join(oldBuild, 'dude-hub.cjs'), version: OLD_VERSION });
  buildHubSea({ outDir: oldBuild });
  rmSync(oldStage, { recursive: true, force: true });
  mkdirSync(oldStage, { recursive: true });
  cpSync(path.join(oldBuild, 'dude-hub.exe'), path.join(oldStage, 'dude-hub.exe'));
  cpSync(path.join(stage, 'DudeHub.exe'), path.join(oldStage, 'DudeHub.exe'));
  if (existsSync(path.join(stage, 'service'))) cpSync(path.join(stage, 'service'), path.join(oldStage, 'service'), { recursive: true });
  const oldCli = path.join(oldStage, 'dude-hub.exe');
  assert(run(oldCli, ['version']).stdout.trim() === OLD_VERSION, 'the N-1 build reports the overridden version');

  step('install N-1 as a service');
  const installed = json(run(oldCli, ['service', 'install', ...common, '--port', String(port)]));
  assert(installed.installed === true && /^[A-Za-z0-9_-]{43}$/.test(installed.spkiSha256), 'install prints installed + spkiSha256');
  assert(installed.hubVersion === OLD_VERSION, 'the installed Hub is the N-1 build');
  assert(!JSON.stringify(installed).includes('token'), 'install output carries no token');

  step('bootstrap through setup-token and POST /bootstrap');
  const tokenInfo = json(run(cli, ['setup-token', '--data-dir', dataDir]));
  const boot = await pinnedRequest(dataDir, port, 'POST', '/api/v1/bootstrap', { setupToken: tokenInfo.token, ownerDisplayName: 'CI', environmentName: 'CI Environment', password: PASSWORD });
  assert(boot.status === 201, `bootstrap returned ${boot.status}: ${boot.body.slice(0, 200)}`);
  const environmentId = JSON.parse(boot.body).environmentId;
  const afterBoot = await hello(dataDir, port);
  assert(afterBoot.bootstrapped === true && afterBoot.environmentId === environmentId, 'hello shows bootstrapped with the environment');

  step('service runs without Electron');
  assert(spawnSync('sc.exe', ['query', 'DudeHub'], { encoding: 'utf8', windowsHide: true }).stdout.includes('RUNNING'), 'service state is RUNNING');
  const listing = processes();
  assert(!listing.includes('"electron.exe"') && !listing.includes('"dude.exe"'), 'no electron.exe or DUDE.exe is running');

  step('restart preserves the bootstrap');
  run(cli, ['service', 'restart', ...common]);
  const afterRestart = await hello(dataDir, port);
  assert(afterRestart.bootstrapped === true && afterRestart.environmentId === environmentId, 'bootstrapped and environment survive a restart');

  step('update to the staged build');
  const before = json(run(cli, ['status', '--data-dir', dataDir]));
  const update = json(run(cli, ['service', 'update', '--source', stage, ...common]));
  assert(update.updated === true && update.oldHubVersion === OLD_VERSION && update.newHubVersion === currentVersion, `hubVersion changed ${OLD_VERSION} -> ${currentVersion}`);
  const afterUpdate = await hello(dataDir, port);
  assert(afterUpdate.hubVersion === currentVersion && afterUpdate.bootstrapped === true && afterUpdate.environmentId === environmentId, 'no data loss across the update');
  const after = json(run(cli, ['status', '--data-dir', dataDir]));
  const preMigration = path.join(dataDir, 'data', 'pre-migration');
  const copies = existsSync(preMigration) ? readdirSync(preMigration).filter((f) => f.endsWith('.db')) : [];
  const schemaChanged = before.schemaVersion !== after.schemaVersion;
  assert(schemaChanged ? copies.length > 0 : copies.length === 0, `pre-migration copy exists only when the schema changed (changed=${schemaChanged}, copies=${copies.length})`);

  step('LAN mode on and off');
  run(cli, ['network', 'lan', 'on', ...common]);
  assert(ruleExists(), 'the firewall rule exists after "network lan on"');
  assert((await hello(dataDir, port)).bootstrapped === true, 'the Hub answers after the restart');
  assert(json(run(cli, ['status', '--data-dir', dataDir])).bind === 'lan', 'the Hub is bound to the LAN');
  run(cli, ['network', 'lan', 'off', ...common]);
  assert(!ruleExists(), 'the firewall rule is gone after "network lan off"');
  assert(json(run(cli, ['status', '--data-dir', dataDir])).bind === 'loopback', 'the Hub is back on loopback');

  step('doctor');
  // The checklist comes first; the machine-readable report follows the "--- details ---" marker.
  const doctorOutput = run(cli, ['doctor', ...common]).stdout;
  const marker = '--- details ---';
  assert(doctorOutput.includes(marker), 'doctor prints a details section');
  const doctor = JSON.parse(doctorOutput.slice(doctorOutput.indexOf(marker) + marker.length));
  assert(doctor.hubVersion === currentVersion && doctor.admin && Array.isArray(doctor.logTail), 'doctor reports the version, admin status and log tail');
  assert(!JSON.stringify(doctor).includes(PASSWORD) && !JSON.stringify(doctor).includes(tokenInfo.token), 'doctor output has no secrets');

  step('uninstall keeps the data; reinstall comes back bootstrapped');
  const removed = json(run(cli, ['service', 'uninstall', ...common]));
  assert(removed.uninstalled === true && removed.dataKept === true, 'uninstall reports the data kept');
  assert(!serviceExists(), 'the service is gone');
  assert(existsSync(path.join(dataDir, 'data', 'dude.db')), 'the database is still there');
  json(run(cli, ['service', 'install', ...common, '--port', String(port)]));
  const reinstalled = await hello(dataDir, port);
  assert(reinstalled.bootstrapped === true && reinstalled.environmentId === environmentId, 'reinstall is bootstrapped with the same environmentId');

  console.log(`\nOK: ${steps.length} steps passed.`);
}

let failure;
try {
  await main();
} catch (error) {
  failure = error;
  console.error(`\nFAILED at step "${steps.at(-1) ?? 'setup'}": ${error.message}`);
}

// The cleanup below deletes the logs, so print what the service and its wrapper wrote while they still exist.
function dumpLogs() {
  const folders = [path.join(dataDir, 'logs'), path.join(dataDir, 'logs', 'service'), installDir];
  for (const folder of folders) {
    let names = [];
    try { names = readdirSync(folder).filter((name) => /\.(log|err|out|wrapper)(\.\w+)?$/i.test(name)); } catch { /* folder missing */ }
    for (const name of names) {
      let text = '';
      try { text = readFileSync(path.join(folder, name), 'utf8'); } catch { /* unreadable */ }
      console.log(`
--- ${path.join(folder, name)} (last 6000 characters)
${text.slice(-6000)}`);
    }
  }
  const state = spawnSync('sc.exe', ['query', 'DudeHub'], { encoding: 'utf8', windowsHide: true });
  console.log(`
--- sc query DudeHub
${state.stdout ?? ''}${state.stderr ?? ''}`);
}
if (failure) dumpLogs();

// Clean up even on failure; the data directory is removed by this script, never by "purge".
try { if (serviceExists()) spawnSync(path.join(stage, 'dude-hub.exe'), ['service', 'uninstall', '--install-dir', installDir, '--data-dir', dataDir], { windowsHide: true, timeout: 120_000 }); } catch { /* best effort */ }
try { if (ruleExists()) spawnSync('netsh', ['advfirewall', 'firewall', 'delete', 'rule', 'name=DUDE Hub (LAN)'], { windowsHide: true }); } catch { /* best effort */ }
rmSync(base, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
rmSync(oldStage, { recursive: true, force: true });
rmSync(path.join(root, 'dist', 'hub-ci-old'), { recursive: true, force: true });
process.exit(failure ? 1 : 0);
