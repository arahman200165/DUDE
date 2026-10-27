// Go/no-go check of the Hub runtime capabilities the 32-SS1 platform depends on (Milestone 830, PD-141, PD-147):
// SQLite FTS5, the pinned sqlite-vec library loading through `node:sqlite` loadExtension, and a worker started by
// re-spawning the Hub itself in internal worker mode. It builds nothing: it runs `self-test` of the already-built
// single-executable Hub (dist/hub/dude-hub[.exe]) or, with --bundle or when no executable exists, of the CJS bundle
// under node (dist/hub/dude-hub.cjs).
//
//   npm run hub:sqlite-vec            # once: fetch and verify build/vendor/sqlite-vec/vec0.dll
//   npm run hub:compile && npm run hub:sea
//   npm run check:hub-capabilities [-- --bundle] [-- --require-vector]
//
// FTS5 and the worker re-spawn must pass. sqlite-vec is optional: its absence (no vec0.dll, a non-Windows host, the
// Alpine image) is reported as "unavailable" and passes, unless --require-vector is given. For the executable run the
// vendored vec0.dll is copied beside the exe (what `hub:stage` will do), because the Hub only loads a library it finds
// there and verifies against its pinned hash.
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const outDir = path.join(root, 'dist', 'hub');
const exe = path.join(outDir, process.platform === 'win32' ? 'dude-hub.exe' : 'dude-hub');
const bundle = path.join(outDir, 'dude-hub.cjs');
const vendoredVec = path.join(root, 'build', 'vendor', 'sqlite-vec', 'vec0.dll');
const requireVector = process.argv.includes('--require-vector');
const useExe = !process.argv.includes('--bundle') && existsSync(exe);

if (!useExe && !existsSync(bundle)) {
  console.error('Nothing to check: build the Hub first ("npm run hub:compile", then "npm run hub:sea" for the executable).');
  process.exit(1);
}
if (useExe && existsSync(vendoredVec) && !existsSync(path.join(outDir, 'vec0.dll'))) {
  copyFileSync(vendoredVec, path.join(outDir, 'vec0.dll'));
  console.log('Copied build/vendor/sqlite-vec/vec0.dll beside the executable.');
}

const [command, args] = useExe ? [exe, ['self-test']] : [process.execPath, [bundle, 'self-test']];
console.log(`Running ${useExe ? 'single-executable' : 'node bundle'} self-test: ${path.relative(root, useExe ? exe : bundle)}`);
const run = spawnSync(command, args, { encoding: 'utf8', windowsHide: true, timeout: 120000, cwd: outDir });
if (run.error) throw run.error;
let result;
try {
  result = JSON.parse(run.stdout);
} catch {
  console.error(`self-test did not print JSON (exit ${run.status}):\n${run.stdout}\n${run.stderr}`);
  process.exit(1);
}

const byName = Object.fromEntries(result.checks.map((c) => [c.name, c]));
const problems = [];
const expectCheck = (name, test, message) => {
  const found = byName[name];
  if (!found) problems.push(`${name}: probe missing from self-test`);
  else if (!found.ok) problems.push(`${name}: ${found.detail ?? 'failed'}`);
  else if (test && !test(found)) problems.push(`${name}: ${message}`);
};
expectCheck('sqlite-fts5');
expectCheck('worker-respawn', (c) => (useExe ? /executable re-spawn/.test(c.detail ?? '') : /node re-spawn/.test(c.detail ?? '')), `expected a ${useExe ? 'executable' : 'node'} re-spawn`);
expectCheck('sqlite-vec', (c) => c.state === 'available' || (c.state === 'unavailable' && !requireVector), 'vector search is unavailable and --require-vector was given');
if (!result.ok) problems.push('self-test reported ok: false');

for (const c of result.checks) console.log(`  ${c.ok ? 'ok  ' : 'FAIL'} ${c.name}${c.state ? ` [${c.state}]` : ''}${c.detail ? `: ${c.detail}` : ''}`);
if (problems.length > 0) {
  console.error(`\nCapability check FAILED:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
  process.exit(1);
}
console.log(`\nCapability check passed (${useExe ? 'single-executable' : 'node bundle'}); vector search ${byName['sqlite-vec'].state}.`);
