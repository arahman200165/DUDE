import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { buildSync } from 'esbuild';

mkdirSync('tmp/mobile-measurements', { recursive: true });
const benchmark = path.resolve('tmp/mobile-measurements/host-benchmark.mjs');
buildSync({ entryPoints: ['scripts/measure-mobile-sync.ts'], outfile: benchmark, bundle: true, platform: 'node', format: 'esm', packages: 'external', target: 'node24' });
const measured = spawnSync(process.execPath, [benchmark], { stdio: 'inherit' });
if (measured.error || measured.status !== 0) throw new Error('Mobile driver/SQLite host catch-up measurement failed.');
if (process.argv.includes('--host-only')) process.exit(0);

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
const starts = [];
for (let index = 0; index < 3; index++) {
  shell(['am', 'force-stop', appId]);
  const output = shell(['am', 'start', '-W', '-n', `${appId}/.MainActivity`]);
  if (!/^Status: ok$/m.test(output)) throw new Error('Android activity did not start successfully.');
  const total = /^TotalTime:\s*(\d+)/m.exec(output);
  starts.push(total ? Number(total[1]) : null);
}
const memory = shell(['dumpsys', 'meminfo', appId]);
const totalPss = /TOTAL PSS:\s*(\d+)/.exec(memory)?.[1] ?? /^\s*TOTAL\s+(\d+)/m.exec(memory)?.[1];
const packageInfo = shell(['dumpsys', 'package', appId]);
const result = {
  recordedAt: new Date().toISOString(),
  device: { serial, api: Number(shell(['getprop', 'ro.build.version.sdk']).trim()), model: shell(['getprop', 'ro.product.model']).trim(), emulator: shell(['getprop', 'ro.kernel.qemu']).trim() === '1' },
  versionName: /versionName=([^\s]+)/.exec(packageInfo)?.[1] ?? null,
  startup: { measurement: 'Android am start -W TotalTime; activity display, not JS interactive readiness', milliseconds: starts },
  memory: { totalPssKiB: totalPss ? Number(totalPss) : null },
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
console.log(JSON.stringify(result, null, 2));
