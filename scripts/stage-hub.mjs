// Assembles dist/hub-stage/ from the built SEA, WinSW and (when present) the Hub web build:
//   dude-hub.exe, DudeHub.exe (WinSW renamed), service/web/ and SHA256SUMS.
// Run through `npm run hub:stage`, which builds the SEA and fetches WinSW first.
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
export const STAGE_DIR = path.join(root, 'dist', 'hub-stage');

function listFiles(dir, base = dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(full, base));
    else out.push(path.relative(base, full).split(path.sep).join('/'));
  }
  return out.sort();
}

export function stageHub({ outDir = STAGE_DIR, seaDir = path.join(root, 'dist', 'hub'), winsw = path.join(root, 'build', 'vendor', 'winsw', 'WinSW-x64.exe') } = {}) {
  const exeName = process.platform === 'win32' ? 'dude-hub.exe' : 'dude-hub';
  const exe = path.join(seaDir, exeName);
  if (!existsSync(exe)) throw new Error(`Missing ${path.relative(root, exe)}. Run "npm run hub:sea" first.`);
  if (!existsSync(winsw)) throw new Error(`Missing ${path.relative(root, winsw)}. Run "npm run hub:winsw" first.`);

  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  cpSync(exe, path.join(outDir, exeName));
  cpSync(winsw, path.join(outDir, 'DudeHub.exe'));
  const web = path.join(root, 'dist', 'hub-web', 'browser');
  if (existsSync(web)) cpSync(web, path.join(outDir, 'service', 'web'), { recursive: true });
  else console.log('Note: dist/hub-web/browser not found; the stage has no service/web (the Hub web build ships later).');

  const sums = listFiles(outDir)
    .filter((f) => f !== 'SHA256SUMS')
    .map((f) => `${createHash('sha256').update(readFileSync(path.join(outDir, f))).digest('hex')}  ${f}`);
  writeFileSync(path.join(outDir, 'SHA256SUMS'), `${sums.join('\n')}\n`);
  const size = statSync(path.join(outDir, exeName)).size;
  console.log(`Staged ${path.relative(root, outDir)}: ${listFiles(outDir).length} files (${exeName} ${(size / 1048576).toFixed(1)} MiB, unsigned).`);
  return outDir;
}

if (import.meta.filename === path.resolve(process.argv[1] ?? '')) stageHub();
