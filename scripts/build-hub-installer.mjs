// Compiles build/hub-installer/dude-hub-setup.nsi into dist/hub-installer/DUDE-Hub-Setup.exe (+ SHA256 file).
// Requires dist/hub-stage (run `npm run hub:stage` first). Uses the NSIS that electron-builder caches
// (%LOCALAPPDATA%\electron-builder\Cache\nsis-*), falling back to `makensis` on PATH.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
export const OUT_DIR = path.join(root, 'dist', 'hub-installer');
export const OUT_FILE = path.join(OUT_DIR, 'DUDE-Hub-Setup.exe');

/** Newest electron-builder-cached makensis.exe, or null. */
export function findCachedMakensis() {
  const cacheRoot = process.env.ELECTRON_BUILDER_CACHE
    ?? (process.platform === 'win32'
      ? path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local'), 'electron-builder', 'Cache')
      : path.join(os.homedir(), '.cache', 'electron-builder'));
  const nsisRoot = path.join(cacheRoot, process.env.ELECTRON_BUILDER_NSIS_DIR ?? '');
  if (!existsSync(cacheRoot)) return null;
  const candidates = [];
  for (const entry of readdirSync(nsisRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith('nsis-') || entry.name.startsWith('nsis-resources')) continue;
    const dir = path.join(nsisRoot, entry.name);
    for (const inner of readdirSync(dir, { withFileTypes: true })) {
      if (!inner.isDirectory()) continue;
      const exe = path.join(dir, inner.name, process.platform === 'win32' ? 'makensis.exe' : path.join(process.platform === 'darwin' ? 'mac' : 'linux', 'makensis'));
      if (existsSync(exe)) candidates.push({ exe, mtime: statSync(exe).mtimeMs });
    }
  }
  candidates.sort((a, b) => b.mtime - a.mtime);
  return candidates[0]?.exe ?? null;
}

export function buildHubInstaller() {
  const stage = path.join(root, 'dist', 'hub-stage');
  if (!existsSync(path.join(stage, 'dude-hub.exe')) || !existsSync(path.join(stage, 'DudeHub.exe'))) {
    throw new Error('Missing dist/hub-stage (dude-hub.exe, DudeHub.exe). Run "npm run hub:stage" first.');
  }
  const makensis = findCachedMakensis() ?? 'makensis';
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
  console.log(`Compiling DUDE-Hub-Setup.exe with ${makensis}`);
  const result = spawnSync(makensis, args, { stdio: 'inherit', cwd: root });
  if (result.error) throw new Error(`Could not run makensis: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`makensis failed with exit code ${result.status}.`);

  const sha = createHash('sha256').update(readFileSync(OUT_FILE)).digest('hex');
  writeFileSync(`${OUT_FILE}.sha256`, `${sha}  DUDE-Hub-Setup.exe\n`);
  console.log(`Built ${path.relative(root, OUT_FILE)} (${(statSync(OUT_FILE).size / 1048576).toFixed(1)} MiB, unsigned)\nSHA256 ${sha}`);
  return OUT_FILE;
}

if (import.meta.filename === path.resolve(process.argv[1] ?? '')) buildHubInstaller();
