import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { mkdirSync } from 'node:fs';

const root = path.resolve(import.meta.dirname, '..');
const sdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT;
const adb = sdk ? path.join(sdk, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb') : 'adb';
const list = spawnSync(adb, ['devices'], { encoding: 'utf8' });
if (list.error || list.status !== 0) throw new Error('Android acceptance requires adb and an online Android emulator/device.');
const devices = list.stdout.split(/\r?\n/).flatMap(line => /^([^\s]+)\s+device$/.exec(line)?.[1] ?? []);
const device = process.env.ANDROID_SERIAL ?? (devices.length === 1 ? devices[0] : undefined);
if (!device || !devices.includes(device)) throw new Error('Set ANDROID_SERIAL to an online Android device (required when multiple devices are connected).');
const maestro = process.env.MAESTRO_PATH ?? (process.platform === 'win32' ? 'maestro.bat' : 'maestro');
const fontScale = process.env.DUDE_E2E_FONT_SCALE ?? '1.5';
if (!/^(?:1(?:\.[0-9]+)?|2(?:\.0+)?)$/.test(fontScale)) throw new Error('DUDE_E2E_FONT_SCALE must be between 1 and 2.');
function setting(args) {
  const result = spawnSync(adb, ['-s', device, 'shell', 'settings', ...args], { encoding: 'utf8' });
  if (result.error || result.status !== 0) throw new Error('Could not configure Android accessibility acceptance settings.');
  return result.stdout.trim();
}
const output = path.resolve(root, process.env.DUDE_E2E_OUTPUT_DIR ?? path.join('test-results/mobile', device));
mkdirSync(output, { recursive: true });
const previousScale = setting(['get', 'system', 'font_scale']);
let result;
try {
  setting(['put', 'system', 'font_scale', fontScale]);
  result = spawnSync(maestro, ['--device', device, 'test', '--format', 'junit', '--output', path.join(output, 'maestro.xml'), '--debug-output', output, '--test-output-dir', output, path.join(root, 'apps/mobile/.maestro')], {
  cwd: root, stdio: 'inherit', env: { ...process.env, MAESTRO_CLI_NO_ANALYTICS: '1' }, shell: process.platform === 'win32',
});
} finally {
  setting(previousScale === 'null' ? ['delete', 'system', 'font_scale'] : ['put', 'system', 'font_scale', previousScale]);
}
if (result.error || result.status !== 0) throw new Error('Maestro Android acceptance failed. Install a bundled DUDE Preview build and configure MAESTRO_PATH/JDK 17.');
