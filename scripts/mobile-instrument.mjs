import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Usage: node scripts/mobile-instrument.mjs <dude-hub-debug-androidTest.apk> [--tunnel-edge]
// Installs the :dude-hub instrumentation APK (from `./gradlew :dude-hub:assembleDebugAndroidTest`) and runs it with `am instrument`,
// which is what :dude-hub:connectedDebugAndroidTest does, without a Gradle project on the machine driving the emulator. CI builds the
// APK once and runs it on each emulator. The raw output goes to test-results/mobile/<serial>/instrumentation.txt.
// --tunnel-edge (Milestone 840) also runs the tunnel-domain acceptance (PublicCaTunnelAcceptanceTest): it starts scripts/mobile-tunnel-edge.mjs on this
// machine (a TLS-terminating edge with throwaway certificates in front of a stub Hub; a child process, because the synchronous adb calls below would block an in-process server), installs the throwaway CA into the emulator's USER trust store
// with `adb root` (an emulator or userdebug image; a Play-store image refuses) and passes the domain and ports to the instrumentation. Only the
// instrumentation APK trusts the user store (src/androidTest network security config); the release app does not. The CA file is removed afterwards.
const root = path.resolve(import.meta.dirname, '..');
const apk = process.argv[2];
const tunnelEdge = process.argv[3] === '--tunnel-edge';
if (!apk || process.argv.length > (tunnelEdge ? 4 : 3) || (process.argv.length === 4 && !tunnelEdge)) throw new Error('Usage: node scripts/mobile-instrument.mjs <dude-hub-debug-androidTest.apk> [--tunnel-edge]');
const testPackage = 'expo.modules.dudehub.test';
// The @Test methods of PublicCaTunnelAcceptanceTest.kt; --tunnel-edge fails when fewer ran (so a skipped or removed test cannot pass silently).
const EXPECTED_TUNNEL_TESTS = 7;
const runner = `${testPackage}/androidx.test.runner.AndroidJUnitRunner`;

const sdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT;
const adb = sdk ? path.join(sdk, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb') : 'adb';
const list = spawnSync(adb, ['devices'], { encoding: 'utf8' });
if (list.error || list.status !== 0) throw new Error('Android instrumentation requires adb and an online Android emulator/device.');
const devices = list.stdout.split(/\r?\n/).flatMap(line => /^([^\s]+)\s+device$/.exec(line)?.[1] ?? []);
const device = process.env.ANDROID_SERIAL ?? (devices.length === 1 ? devices[0] : undefined);
if (!device || !devices.includes(device)) throw new Error('Set ANDROID_SERIAL to an online Android device (required when multiple devices are connected).');
const adbRun = (...args) => spawnSync(adb, ['-s', device, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

const install = adbRun('install', '-r', '-t', path.resolve(apk));
if (install.error || install.status !== 0) throw new Error(`Could not install ${apk}: ${install.stderr || install.stdout}`);
// The directory the user trust store reads on every supported API level (API 24+): /data/misc/user/<user id>/cacerts-added/<legacy subject hash>.0.
const userCaDir = '/data/misc/user/0/cacerts-added';
let rooted = false;
let edge;
let edgeDir;
let caFile;
/** Starts scripts/mobile-tunnel-edge.mjs as a child process and resolves to what it prints once every listener is up (domain, ports, CA path and file name). */
const startEdge = dir => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [path.join(import.meta.dirname, 'mobile-tunnel-edge.mjs'), '--dir', dir], { stdio: ['ignore', 'pipe', 'inherit'] });
  let out = '';
  const timer = setTimeout(() => { child.kill(); reject(new Error('The tunnel edge did not start within 60 seconds.')); }, 60_000);
  child.stdout.on('data', chunk => {
    out += chunk;
    if (!out.includes('\n')) return;
    clearTimeout(timer);
    resolve({ ...JSON.parse(out.split('\n')[0]), stop: () => child.kill() });
  });
  child.on('exit', code => { clearTimeout(timer); reject(new Error(`The tunnel edge exited (${code}) before it was ready. Is openssl installed?`)); });
});
const installUserCa = () => {
  const asRoot = adbRun('root');
  if (asRoot.error || asRoot.status !== 0 || /cannot run as root|production builds/i.test(`${asRoot.stdout}${asRoot.stderr}`)) throw new Error(`adb root is required to install the throwaway CA into the user trust store: ${asRoot.stdout}${asRoot.stderr}`);
  rooted = true;
  const waited = adbRun('wait-for-device');
  if (waited.error || waited.status !== 0) throw new Error(`The device did not come back after adb root: ${waited.stderr}`);
  caFile = `${userCaDir}/${edge.androidCaFile}`;
  for (const args of [['shell', 'mkdir', '-p', userCaDir], ['push', edge.caPem, caFile], ['shell', 'chown', 'system:system', userCaDir, caFile], ['shell', 'chmod', '775', userCaDir], ['shell', 'chmod', '644', caFile], ['shell', 'restorecon', '-R', userCaDir]]) {
    const step = adbRun(...args);
    if (step.error || step.status !== 0) throw new Error(`adb ${args.join(' ')} failed: ${step.stderr || step.stdout}`);
  }
};
let result;
try {
  const instrument = ['shell', 'am', 'instrument', '-w', '-r'];
  if (tunnelEdge) {
    edgeDir = mkdtempSync(path.join(os.tmpdir(), 'dude-tunnel-edge-'));
    edge = await startEdge(edgeDir);
    installUserCa();
    instrument.push('-e', 'dudeTunnelDomain', edge.domain, '-e', 'dudeTunnelPorts', Object.entries(edge.ports).map(([name, port]) => `${name}=${port}`).join(','));
  }
  result = adbRun(...instrument, runner);
} finally {
  if (caFile) adbRun('shell', 'rm', '-f', caFile);
  // Back to the shell user, so the Maestro journeys that follow on this emulator run exactly as on the other shards.
  if (rooted) { adbRun('unroot'); adbRun('wait-for-device'); }
  edge?.stop();
  if (edgeDir) rmSync(edgeDir, { recursive: true, force: true });
  adbRun('uninstall', testPackage);
}
const output = path.resolve(root, process.env.DUDE_E2E_OUTPUT_DIR ?? path.join('test-results/mobile', device));
mkdirSync(output, { recursive: true });
writeFileSync(path.join(output, 'instrumentation.txt'), result.stdout ?? '');
// `am instrument` exits 0 even when tests fail or the process crashes, so the verdict comes from the JUnit summary it prints.
const passed = /^OK \(([0-9]+) tests?\)/m.exec(result.stdout ?? '');
if (result.error || result.status !== 0 || !passed || Number(passed[1]) < 1 || !/INSTRUMENTATION_CODE: -1/.test(result.stdout)) {
  console.error(result.stdout?.split(/\r?\n/).filter(line => !line.startsWith('INSTRUMENTATION_STATUS')).join('\n'));
  throw new Error(`Android instrumentation failed on ${device}; see ${path.relative(root, path.join(output, 'instrumentation.txt'))}.`);
}
// The tunnel-domain tests skip themselves (assumption failure, status code -4) when the harness did not supply the edge; with --tunnel-edge every one must
// have run and passed. Raw output is a sequence of INSTRUMENTATION_STATUS blocks, each ended by its status code (1 start, 0 ok, -1/-2 error/failure, -3 ignored, -4 assumption).
if (tunnelEdge) {
  const parts = result.stdout.split(/INSTRUMENTATION_STATUS_CODE: (-?\d+)/);
  const codes = [];
  for (let i = 1; i < parts.length; i += 2) if (parts[i - 1].includes('class=expo.modules.dudehub.PublicCaTunnelAcceptanceTest')) codes.push(parts[i]);
  const ok = codes.filter(code => code === '0').length;
  if (ok !== EXPECTED_TUNNEL_TESTS || codes.some(code => code !== '0' && code !== '1')) {
    throw new Error(`The tunnel-domain acceptance did not run to completion on ${device}: ${ok} of ${EXPECTED_TUNNEL_TESTS} passed (status codes ${codes.join(',')}); see ${path.relative(root, path.join(output, 'instrumentation.txt'))}.`);
  }
  console.log(`Tunnel-domain acceptance passed against ${edge.domain}: ${ok} tests.`);
}
console.log(`Android instrumentation passed on ${device}: ${passed[1]} tests (${testPackage}).`);
