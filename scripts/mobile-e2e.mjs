import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';

// Usage: node scripts/mobile-e2e.mjs [--tools-only] [--flow <id>]...
//   (no flag)      shell journeys (apps/mobile/.maestro/*.yaml) then every tool journey (.maestro/tools/*.yaml)
//   --tools-only   only the tool journeys
//   --flow <id>    only the named flow(s): a tool id (tools/<id>.yaml) or a shell flow name (e.g. 01-shell); repeatable
const root = path.resolve(import.meta.dirname, '..');
const flowRoot = path.join(root, 'apps/mobile/.maestro');
const args = process.argv.slice(2);
let toolsOnly = false;
const wanted = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--tools-only') toolsOnly = true;
  else if (args[i] === '--flow') {
    const id = args[++i];
    if (!id || id.startsWith('--')) throw new Error('--flow requires a flow id.');
    wanted.push(id);
  } else if (args[i].startsWith('--flow=')) wanted.push(args[i].slice('--flow='.length));
  else throw new Error(`Unknown argument ${args[i]}. Supported: --tools-only, --flow <id>.`);
}
const yamlIn = dir => readdirSync(dir, { withFileTypes: true }).filter(entry => entry.isFile() && /\.ya?ml$/.test(entry.name) && entry.name !== 'config.yaml').map(entry => path.join(dir, entry.name)).sort();
const flowId = file => path.basename(file).replace(/\.ya?ml$/, '');
let flows = [...(toolsOnly ? [] : yamlIn(flowRoot)), ...yamlIn(path.join(flowRoot, 'tools'))];
if (wanted.length) {
  flows = flows.filter(file => wanted.includes(flowId(file)));
  const missing = wanted.filter(id => !flows.some(file => flowId(file) === id));
  if (missing.length) throw new Error(`No Maestro flow named ${missing.join(', ')}${toolsOnly ? ' among tool flows' : ''}.`);
}
if (!flows.length) throw new Error('No Maestro flows selected.');

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
console.log(`Maestro flows (${flows.length}) on ${device}: ${flows.map(flowId).join(', ')}`);
const previousScale = setting(['get', 'system', 'font_scale']);
// Explicit file list: Maestro does not recurse into subdirectories (tools/) of a flow directory.
function runMaestro(files, dir) {
  mkdirSync(dir, { recursive: true });
  return spawnSync(maestro, ['--device', device, 'test', '--format', 'junit', '--output', path.join(dir, 'maestro.xml'), '--debug-output', dir, '--test-output-dir', dir, ...files], {
    cwd: root, stdio: 'inherit', env: { ...process.env, MAESTRO_CLI_NO_ANALYTICS: '1' }, shell: process.platform === 'win32',
  });
}
// A flow that fails once and passes on a fresh re-run is reported loudly as flaky (see flaky.json) instead of failing the gate;
// DUDE_E2E_RETRIES=0 disables this. Default 3: a fresh-data cold start occasionally dies in native expo-sqlite (SIGSEGV, ~1 in 10 launches); see the report. A flow that fails every attempt always fails the run.
const retries = Number(process.env.DUDE_E2E_RETRIES ?? '3');
if (!Number.isInteger(retries) || retries < 0 || retries > 3) throw new Error('DUDE_E2E_RETRIES must be an integer from 0 to 3.');
function failedFlows(dir) {
  try {
    const xml = readFileSync(path.join(dir, 'maestro.xml'), 'utf8');
    const sep = String.fromCharCode(92);
    return xml.split('<testcase').slice(1).filter(part => part.includes('<failure')).map(part => path.resolve(root, /file="([^"]+)"/.exec(part)[1].split(sep).join('/')));
  } catch { return undefined; }
}
const appId = 'io.github.arahman200165.dude.preview';
const adbShell = (...shellArgs) => spawnSync(adb, ['-s', device, 'shell', ...shellArgs], { encoding: 'utf8' });
// 03-share needs an inbound Android share intent, which Maestro cannot send: clear the app, deliver the SEND intent with the JWT quoted in the
// flow header, then run the flow without relaunching (a relaunch would drop the pending share).
const SHARE_FLOW = '03-share';
function prepareShare(file) {
  const text = readFileSync(file, 'utf8');
  const token = text.split(String.fromCharCode(10)).map(line => /^# JWT .*: (eyJ[A-Za-z0-9_.-]+)/.exec(line)?.[1]).find(Boolean);
  if (!token) throw new Error('03-share.yaml has no "# JWT ...: <token>" header line.');
  adbShell('am', 'force-stop', appId);
  adbShell('pm', 'clear', appId);
  const started = adbShell('am', 'start', '-a', 'android.intent.action.SEND', '-t', 'text/plain', '--es', 'android.intent.extra.TEXT', token, '-n', appId + '/.MainActivity');
  if (started.status !== 0) throw new Error('Could not deliver the share intent for ' + SHARE_FLOW + '.');
  adbShell('sleep', '8');
}
// Run a group of flows; failed flows are re-run (see DUDE_E2E_RETRIES) and the group result is that of the last attempt.
function runGroup(files, dir, prepare) {
  const flaky = [];
  prepare?.();
  let result = runMaestro(files, dir);
  for (let attempt = 1; attempt <= retries && !result.error && result.status !== 0; attempt++) {
    const failed = failedFlows(attempt === 1 ? dir : path.join(dir, 'retry-' + (attempt - 1)));
    if (!failed?.length) break;
    console.warn('Re-running ' + failed.length + ' failed flow(s) once more (attempt ' + attempt + '): ' + failed.map(flowId).join(', '));
    flaky.push(...failed.map(flowId));
    prepare?.();
    result = runMaestro(failed, path.join(dir, 'retry-' + attempt));
    if (result.status === 0) {
      console.warn('FLAKY (passed only on re-run): ' + flaky.join(', ') + '. Investigate; see ' + dir + '.');
      writeFileSync(path.join(dir, 'flaky.json'), JSON.stringify({ flaky }, null, 2));
    }
  }
  return result;
}
let result;
try {
  setting(['put', 'system', 'font_scale', fontScale]);
  const shareFlows = flows.filter(file => flowId(file) === SHARE_FLOW);
  const plain = flows.filter(file => flowId(file) !== SHARE_FLOW);
  result = plain.length ? runGroup(plain, output) : { status: 0 };
  if (shareFlows.length && !result.error) {
    const shareResult = runGroup(shareFlows, path.join(output, SHARE_FLOW), () => prepareShare(shareFlows[0]));
    if (result.status === 0) result = shareResult;
  }
} finally {
  setting(previousScale === 'null' ? ['delete', 'system', 'font_scale'] : ['put', 'system', 'font_scale', previousScale]);
}
if (result.error || result.status !== 0) throw new Error('Maestro Android acceptance failed. Install a bundled DUDE Preview build and configure MAESTRO_PATH/JDK 17.');
