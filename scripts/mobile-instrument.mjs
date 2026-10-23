import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// Usage: node scripts/mobile-instrument.mjs <dude-hub-debug-androidTest.apk>
// Installs the :dude-hub instrumentation APK (from `./gradlew :dude-hub:assembleDebugAndroidTest`) and runs it with `am instrument`,
// which is what :dude-hub:connectedDebugAndroidTest does, without a Gradle project on the machine driving the emulator. CI builds the
// APK once and runs it on each emulator. The raw output goes to test-results/mobile/<serial>/instrumentation.txt.
const root = path.resolve(import.meta.dirname, '..');
const apk = process.argv[2];
if (!apk || process.argv.length > 3) throw new Error('Usage: node scripts/mobile-instrument.mjs <dude-hub-debug-androidTest.apk>');
const testPackage = 'expo.modules.dudehub.test';
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
let result;
try {
  result = adbRun('shell', 'am', 'instrument', '-w', '-r', runner);
} finally {
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
console.log(`Android instrumentation passed on ${device}: ${passed[1]} tests (${testPackage}).`);
