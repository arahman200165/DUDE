// Compiles build/hub-installer/dude-hub-setup.nsi into dist/hub-installer/DUDE-Hub-Setup.exe (+ SHA256 file).
// Requires dist/hub-stage (run `npm run hub:stage` first). Uses the same NSIS as the desktop installer: electron-builder
// resolves it (downloading and checksum-verifying it into its cache when missing), so neither a previous electron-builder
// run nor a system NSIS on PATH is needed. ELECTRON_BUILDER_NSIS_DIR still overrides it.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
export const OUT_DIR = path.join(root, 'dist', 'hub-installer');
export const OUT_FILE = path.join(OUT_DIR, 'DUDE-Hub-Setup.exe');

/** electron-builder's makensis for the default (unset) `toolsets.nsis`: `{ path, env? }`. */
export async function resolveMakensis() {
  const { getMakeNsisPath } = createRequire(import.meta.url)('app-builder-lib/out/toolsets/windows.js');
  return getMakeNsisPath(null);
}

export async function buildHubInstaller() {
  const stage = path.join(root, 'dist', 'hub-stage');
  if (!existsSync(path.join(stage, 'dude-hub.exe')) || !existsSync(path.join(stage, 'DudeHub.exe'))) {
    throw new Error('Missing dist/hub-stage (dude-hub.exe, DudeHub.exe). Run "npm run hub:stage" first.');
  }
  const makensis = await resolveMakensis();
  const version = String(JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).version).replace(/[-+].*$/, '');
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`Unsupported version "${version}".`);
  const icon = path.join(root, 'build', 'icon.ico');

  rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });
  const args = [
    '/WX', // warnings are errors
    '/V2',
    `/DSTAGE_DIR=${stage}`,
    `/DOUT_FILE=${OUT_FILE}`,
    `/DHUB_VERSION=${version}`,
    ...(existsSync(icon) ? [`/DICON_FILE=${icon}`] : []),
    path.join(root, 'build', 'hub-installer', 'dude-hub-setup.nsi'),
  ];
  console.log(`Compiling DUDE-Hub-Setup.exe with ${makensis.path}`);
  const result = spawnSync(makensis.path, args, { stdio: 'inherit', cwd: root, env: { ...process.env, ...(makensis.env ?? {}) } });
  if (result.error) throw new Error(`Could not run makensis: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`makensis failed with exit code ${result.status}.`);

  const sha = createHash('sha256').update(readFileSync(OUT_FILE)).digest('hex');
  writeFileSync(`${OUT_FILE}.sha256`, `${sha}  DUDE-Hub-Setup.exe\n`);
  console.log(`Built ${path.relative(root, OUT_FILE)} (${(statSync(OUT_FILE).size / 1048576).toFixed(1)} MiB, unsigned)\nSHA256 ${sha}`);
  return OUT_FILE;
}

if (import.meta.filename === path.resolve(process.argv[1] ?? '')) await buildHubInstaller();
