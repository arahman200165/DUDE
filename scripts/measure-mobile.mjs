import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync, statSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { buildSync } from 'esbuild';

// --tools: launch the measurement deep link (needs a build with EXPO_PUBLIC_DUDE_MEASURE=1), wait for the done marker, parse the
// DUDE_MEASURE logcat lines and write dist/measurements/mobile-tools-<api>.json. --apk=<file> / --aab=<file> point at the artifacts.
const toolsMode = process.argv.includes('--tools');
const argument = name => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);

mkdirSync('tmp/mobile-measurements', { recursive: true });
const benchmark = path.resolve('tmp/mobile-measurements/host-benchmark.mjs');
buildSync({ entryPoints: ['scripts/measure-mobile-sync.ts'], outfile: benchmark, bundle: true, platform: 'node', format: 'esm', packages: 'external', target: 'node24' });
if (!toolsMode) {
  const measured = spawnSync(process.execPath, [benchmark], { stdio: 'inherit' });
  if (measured.error || measured.status !== 0) throw new Error('Mobile driver/SQLite host catch-up measurement failed.');
  if (process.argv.includes('--host-only')) process.exit(0);
}

// Device observations are evidence, not release thresholds. No credential or
// entity payload is printed; a debug-only DB copy stays in ignored tmp/.
const sdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT;
const adb = sdk ? path.join(sdk, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb') : 'adb';
function command(args, binary = false, allowFailure = false) {
  const result = spawnSync(adb, args, { encoding: binary ? undefined : 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (result.error || result.status !== 0) {
    if (allowFailure) return null;
    throw new Error('Android measurement requires an installed DUDE Preview and an online device selected with ANDROID_SERIAL.');
  }
  return result.stdout;
}
const devices = command(['devices']).split(/\r?\n/).flatMap(line => /^([^\s]+)\s+device$/.exec(line)?.[1] ?? []);
const serial = process.env.ANDROID_SERIAL ?? (devices.length === 1 ? devices[0] : null);
if (!serial || !devices.includes(serial)) throw new Error('Set ANDROID_SERIAL to one online emulator or physical device.');
const appId = 'io.github.arahman200165.dude.preview';
const shell = args => command(['-s', serial, 'shell', ...args]);
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

/** Release artifact sizes: APK, AAB when built, and the Hermes bytecode that "npm run mobile:bundle" leaves in dist/mobile. */
function artifactSizes() {
  const sized = file => (file && existsSync(file) ? { path: file.replaceAll('\\', '/'), bytes: statSync(file).size } : null);
  const hermes = [];
  const walk = directory => {
    for (const entry of existsSync(directory) ? readdirSync(directory, { withFileTypes: true }) : []) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(file); else if (entry.name.endsWith('.hbc')) hermes.push(sized(file));
    }
  };
  walk('dist/mobile');
  return {
    apk: sized(argument('apk') ?? process.env.DUDE_MEASURE_APK ?? 'apps/mobile/android/app/build/outputs/apk/release/app-release.apk'),
    aab: sized(argument('aab') ?? process.env.DUDE_MEASURE_AAB ?? 'apps/mobile/android/app/build/outputs/bundle/release/app-release.aab'),
    hermesBytecode: hermes,
    hermesBytecodeBytes: hermes.reduce((total, file) => total + file.bytes, 0) || null,
  };
}

/** PSS from dumpsys meminfo (KiB) with the app summary rows, plus peak resident set (VmHWM) when /proc is readable. */
function memorySnapshot() {
  const memory = shell(['dumpsys', 'meminfo', appId]);
  const totalPss = /TOTAL PSS:\s*(\d+)/.exec(memory)?.[1] ?? /^\s*TOTAL\s+(\d+)/m.exec(memory)?.[1];
  const summary = {};
  for (const [label, key] of [['Java Heap', 'javaHeapKiB'], ['Native Heap', 'nativeHeapKiB'], ['Code', 'codeKiB'], ['Graphics', 'graphicsKiB'], ['Private Other', 'privateOtherKiB']]) {
    const value = new RegExp('^\\s*' + label + ':\\s+(\\d+)', 'm').exec(memory)?.[1];
    if (value) summary[key] = Number(value);
  }
  const pid = shell(['pidof', appId]).trim().split(/\s+/)[0];
  const status = pid ? command(['-s', serial, 'shell', 'cat', '/proc/' + pid + '/status'], false, true) : null;
  const peak = status ? /^VmHWM:\s*(\d+)/m.exec(status)?.[1] : undefined;
  return { totalPssKiB: totalPss ? Number(totalPss) : null, ...summary, peakRssKiB: peak ? Number(peak) : null };
}

/** Log lines from the last DUDE_MEASURE_START of this scope (logcat -c does not always empty the buffer before the next run). */
function thisRun(log, scope) {
  const lines = log.split(/\r?\n/);
  const start = lines.map(line => /DUDE_MEASURE_START .*"scope":"([a-z-]+)"/.exec(line)?.[1]).lastIndexOf(scope);
  return start < 0 ? [] : lines.slice(start);
}
const finished = (log, scope) => thisRun(log, scope).some(line => new RegExp('DUDE_MEASURE_DONE .*"scope":"' + scope + '"').test(line));

async function runMeasurement(scope, timeoutMs) {
  shell(['am', 'force-stop', appId]);
  command(['-s', serial, 'logcat', '-c']);
  if (!/^Status: ok$/m.test(shell(['am', 'start', '-W', '-n', appId + '/.MainActivity']))) throw new Error('Android activity did not start successfully.');
  // A link delivered while the cold-started router is still mounting is dropped, so let the shell settle first.
  await sleep(7000);
  shell(['am', 'start', '-a', 'android.intent.action.VIEW', '-d', "'dude://dev/measure?scope=" + scope + "'", appId]);
  const deadline = Date.now() + timeoutMs;
  let log = '';
  while (Date.now() < deadline) {
    await sleep(2500);
    log = command(['-s', serial, 'logcat', '-d', '-s', 'ReactNativeJS:V', 'AndroidRuntime:E', '-v', 'brief']);
    if (/FATAL EXCEPTION/.test(log)) throw new Error('The app crashed during the ' + scope + ' measurement run.');
    if (finished(log, scope)) break;
  }
  if (!finished(log, scope)) throw new Error('No DUDE_MEASURE_DONE marker for scope ' + scope + ': install a build made with EXPO_PUBLIC_DUDE_MEASURE=1 or raise the timeout.');
  const rows = [];
  for (const line of thisRun(log, scope)) {
    const match = /DUDE_MEASURE (\{.*\})/.exec(line);
    if (match) rows.push(JSON.parse(match[1]));
  }
  const errors = thisRun(log, scope).filter(line => /DUDE_MEASURE_ERROR/.test(line)).map(line => line.replace(/^.*DUDE_MEASURE_ERROR\s*/, ''));
  return { rows, errors, memory: memorySnapshot() };
}

if (toolsMode) {
  const api = Number(shell(['getprop', 'ro.build.version.sdk']).trim());
  const packageInfo = shell(['dumpsys', 'package', appId]);
  const idle = await runMeasurement('idle', 90_000);
  const peak = await runMeasurement('json-peak', 10 * 60_000);
  const all = await runMeasurement('all', 40 * 60_000);
  const sweep = await runMeasurement('sweep', 40 * 60_000);
  const report = {
    recordedAt: new Date().toISOString(),
    device: { serial, api, model: shell(['getprop', 'ro.product.model']).trim(), emulator: shell(['getprop', 'ro.kernel.qemu']).trim() === '1' },
    versionName: /versionName=([^\s]+)/.exec(packageInfo)?.[1] ?? null,
    note: 'Emulator-fixture measurements of the real mobile tasks (a measurement build with EXPO_PUBLIC_DUDE_MEASURE=1); thresholds derived from them are emulator-fixture thresholds, not hardware guarantees.',
    memory: { idleMeasureScreen: idle.memory, afterJson2MiB: peak.memory, afterFullRun: all.memory },
    jsonPeakRows: peak.rows,
    errors: [...idle.errors, ...peak.errors, ...all.errors, ...sweep.errors],
    artifacts: artifactSizes(),
    rows: all.rows,
    sweepRows: sweep.rows,
  };
  mkdirSync('dist/measurements', { recursive: true });
  const target = 'dist/measurements/mobile-tools-' + api + '.json';
  writeFileSync(target, JSON.stringify(report, null, 2) + '\n');
  shell(['am', 'force-stop', appId]);
  console.log('Wrote ' + target + ': ' + report.rows.length + ' runs, PSS after json 2 MiB ' + peak.memory.totalPssKiB + ' KiB.');
  process.exit(0);
}

const starts = [];
for (let index = 0; index < 3; index++) {
  shell(['am', 'force-stop', appId]);
  const output = shell(['am', 'start', '-W', '-n', `${appId}/.MainActivity`]);
  if (!/^Status: ok$/m.test(output)) throw new Error('Android activity did not start successfully.');
  const total = /^TotalTime:\s*(\d+)/m.exec(output);
  starts.push(total ? Number(total[1]) : null);
}
const memory = memorySnapshot();
const packageInfo = shell(['dumpsys', 'package', appId]);
const result = {
  recordedAt: new Date().toISOString(),
  device: { serial, api: Number(shell(['getprop', 'ro.build.version.sdk']).trim()), model: shell(['getprop', 'ro.product.model']).trim(), emulator: shell(['getprop', 'ro.kernel.qemu']).trim() === '1' },
  versionName: /versionName=([^\s]+)/.exec(packageInfo)?.[1] ?? null,
  startup: { measurement: 'Android am start -W TotalTime; activity display, not JS interactive readiness', milliseconds: starts },
  memory: { measurement: 'dumpsys meminfo immediately after the third cold start; peakRssKiB is /proc VmHWM (peak resident)', ...memory },
  artifacts: artifactSizes(),
  database: null,
  catchUp: { milliseconds: null, reason: 'Record an enrolled foreground catch-up from sync diagnostics during the physical/network acceptance pass.' },
  thresholds: null,
  hostSync: JSON.parse(readFileSync('dist/measurements/mobile-sync.json', 'utf8')),
};
// Force-stop gives a consistent main DB/WAL pair. run-as intentionally fails on
// protected release builds; never root a device to obtain measurements.
shell(['am', 'force-stop', appId]);
const parent = path.resolve('tmp/mobile-measurements');
mkdirSync(parent, { recursive: true });
const directory = mkdtempSync(path.join(parent, 'device-'));
const deviceFile = 'files/SQLite/dude-mobile.db';
// Older exec-out paths can return exit 0 with a run-as denial on stdout.
// Preflight through shell (which propagates the remote status), then validate
// binary framing before treating output as a database.
const readable = command(['-s', serial, 'shell', 'run-as', appId, 'test', '-r', deviceFile], false, true) !== null;
const bytes = readable ? command(['-s', serial, 'exec-out', 'run-as', appId, 'cat', deviceFile], true, true) : null;
if (bytes?.subarray(0, 16).equals(Buffer.from('SQLite format 3\0'))) {
  const local = path.join(directory, 'dude-mobile.db');
  writeFileSync(local, bytes);
  let walBytes = 0;
  for (const suffix of ['-wal', '-shm']) {
    if (command(['-s', serial, 'shell', 'run-as', appId, 'test', '-r', `${deviceFile}${suffix}`], false, true) === null) continue;
    const sidecar = command(['-s', serial, 'exec-out', 'run-as', appId, 'cat', `${deviceFile}${suffix}`], true, true);
    if (sidecar?.length) { writeFileSync(`${local}${suffix}`, sidecar); if (suffix === '-wal') walBytes = sidecar.length; }
  }
  const db = new DatabaseSync(local);
  try {
    result.database = { mainBytes: statSync(local).size, walBytes, contexts: db.prepare('SELECT COUNT(*) AS count FROM contexts').get().count, records: db.prepare('SELECT COUNT(*) AS count FROM records').get().count, outboxRows: db.prepare('SELECT COUNT(*) AS count FROM outbox').get().count, claimedRows: db.prepare('SELECT COUNT(*) AS count FROM outbox WHERE claimed=1').get().count };
  } finally { db.close(); }
} else result.database = { unavailable: 'App-private DB is unavailable through run-as on this build. Capture database/outbox diagnostics from the enrolled app acceptance pass.' };
shell(['am', 'start', '-W', '-n', `${appId}/.MainActivity`]);
mkdirSync('dist/measurements', { recursive: true });
writeFileSync('dist/measurements/mobile.json', `${JSON.stringify(result, null, 2)}\n`);
writeFileSync(`dist/measurements/mobile-api${result.device.api}.json`, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
