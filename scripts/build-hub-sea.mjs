// Builds the DUDE Hub as a Node single-executable application (dist/hub/dude-hub[.exe]).
//
// Node 24.21 has no `--build-sea`, so this uses the documented flow: `--experimental-sea-config`
// produces a blob, the running node binary is copied, and `postject` injects the blob.
//
// The result is UNSIGNED. On Windows the copied node.exe carries Node's Authenticode signature,
// which becomes invalid once the blob is injected; per PD-025 Hub binaries ship unsigned and the
// SmartScreen/checksum story is documented. A SHA256SUMS file is written next to the executable.
// Run `npm run hub:compile` first (the `prehub:sea` script does).
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { installHubWeb } from './hub-web.mjs';

const root = path.resolve(import.meta.dirname, '..');
const defaultOutDir = path.join(root, 'dist', 'hub');
const SENTINEL = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2';

export function buildHubSea({ outDir = defaultOutDir } = {}) {
  const bundle = path.join(outDir, 'dude-hub.cjs');
  const blob = path.join(outDir, 'sea-prep.blob');
  const configFile = path.join(outDir, 'sea-config.json');
  if (!existsSync(bundle)) throw new Error(`Missing ${path.relative(root, bundle)}. Run "npm run hub:compile" first.`);
  const exe = path.join(outDir, process.platform === 'win32' ? 'dude-hub.exe' : 'dude-hub');

  writeFileSync(
    configFile,
    `${JSON.stringify({ main: bundle, output: blob, disableExperimentalSEAWarning: true, useCodeCache: false, useSnapshot: false }, null, 2)}\n`,
  );
  execFileSync(process.execPath, ['--experimental-sea-config', configFile], { stdio: 'inherit' });

  rmSync(exe, { force: true });
  cpSync(process.execPath, exe);

  const postject = path.join(root, 'node_modules', 'postject', 'dist', 'cli.js');
  const args = [postject, exe, 'NODE_SEA_BLOB', blob, '--sentinel-fuse', SENTINEL];
  if (process.platform === 'darwin') args.push('--macho-segment-name', 'NODE_SEA');
  execFileSync(process.execPath, args, { stdio: 'inherit' });

  // The Hub web build is built on demand and precompressed; a missing build fails unless it was built already.
  installHubWeb(path.join(outDir, 'service', 'web'));

  const hash = createHash('sha256').update(readFileSync(exe)).digest('hex');
  writeFileSync(path.join(outDir, 'SHA256SUMS'), `${hash}  ${path.basename(exe)}\n`);
  console.log(`Built ${path.relative(root, exe)} (${(statSync(exe).size / 1048576).toFixed(1)} MiB, unsigned), sha256 ${hash}`);
  return exe;
}

if (import.meta.filename === path.resolve(process.argv[1] ?? '')) buildHubSea();
