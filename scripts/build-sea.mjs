// Generic Node single-executable-application builder, first used for the Device Agent
// (`dist/agent/dude-agent[.exe]`).
//
// Node 24.21 has no `--build-sea`, so this uses the documented flow: `--experimental-sea-config`
// produces a blob, the running node binary is copied, and `postject` injects the blob.
//
// The result is UNSIGNED (the copied node.exe's Authenticode signature is invalidated by the injection).
// A SHA256SUMS file is written next to the executable.
//
// CLI: node scripts/build-sea.mjs --bundle <cjs bundle> --out <dir> --name <output name without extension>
//   e.g. node scripts/build-sea.mjs --bundle dist/electron/device-agent.js --out dist/agent --name dude-agent
// Follow-up: scripts/build-hub-sea.mjs should reuse `buildSea` (it duplicates this flow today).
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const SENTINEL = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2';

/**
 * @param {{ bundle: string, outDir: string, name: string }} options  bundle: a CommonJS script; outDir: output directory; name: file name without extension.
 * @returns {string} the executable path
 */
export function buildSea({ bundle, outDir, name }) {
  const bundlePath = path.resolve(root, bundle);
  const out = path.resolve(root, outDir);
  if (!existsSync(bundlePath)) throw new Error(`Missing ${path.relative(root, bundlePath)}. Build the bundle first.`);
  mkdirSync(out, { recursive: true });
  const blob = path.join(out, `${name}-sea-prep.blob`);
  const configFile = path.join(out, `${name}-sea-config.json`);
  const exe = path.join(out, process.platform === 'win32' ? `${name}.exe` : name);

  writeFileSync(
    configFile,
    `${JSON.stringify({ main: bundlePath, output: blob, disableExperimentalSEAWarning: true, useCodeCache: false, useSnapshot: false }, null, 2)}\n`,
  );
  execFileSync(process.execPath, ['--experimental-sea-config', configFile], { stdio: 'inherit' });

  rmSync(exe, { force: true });
  cpSync(process.execPath, exe);

  const postject = path.join(root, 'node_modules', 'postject', 'dist', 'cli.js');
  const args = [postject, exe, 'NODE_SEA_BLOB', blob, '--sentinel-fuse', SENTINEL];
  if (process.platform === 'darwin') args.push('--macho-segment-name', 'NODE_SEA');
  execFileSync(process.execPath, args, { stdio: 'inherit' });

  rmSync(blob, { force: true });
  const hash = createHash('sha256').update(readFileSync(exe)).digest('hex');
  writeFileSync(path.join(out, 'SHA256SUMS'), `${hash}  ${path.basename(exe)}\n`);
  console.log(`Built ${path.relative(root, exe)} (${(statSync(exe).size / 1048576).toFixed(1)} MiB, unsigned), sha256 ${hash}`);
  return exe;
}

function flag(name) {
  const index = process.argv.indexOf(`--${name}`);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value) throw new Error(`Missing --${name}`);
  return value;
}

if (import.meta.filename === path.resolve(process.argv[1] ?? '')) {
  buildSea({ bundle: flag('bundle'), outDir: flag('out'), name: flag('name') });
}
