// Downloads WinSW 2.12.0 (the Windows service wrapper used by the Hub, PD-024) to build/vendor/winsw/
// and verifies it against a pinned SHA-256. The pin was recorded trust-on-first-download from the official
// GitHub release; a changed hash fails the step instead of being accepted.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const WINSW_VERSION = '2.12.0';
export const WINSW_URL = `https://github.com/winsw/winsw/releases/download/v${WINSW_VERSION}/WinSW-x64.exe`;
export const WINSW_SHA256 = '05b82d46ad331cc16bdc00de5c6332c1ef818df8ceefcd49c726553209b3a0da';

const root = path.resolve(import.meta.dirname, '..');
export const WINSW_PATH = path.join(root, 'build', 'vendor', 'winsw', 'WinSW-x64.exe');

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');

export async function fetchWinsw() {
  if (existsSync(WINSW_PATH) && sha256(readFileSync(WINSW_PATH)) === WINSW_SHA256) {
    console.log(`WinSW ${WINSW_VERSION} already present and verified (${WINSW_SHA256}).`);
    return WINSW_PATH;
  }
  console.log(`Downloading ${WINSW_URL}`);
  const response = await fetch(WINSW_URL, { redirect: 'follow' });
  if (!response.ok) throw new Error(`WinSW download failed: HTTP ${response.status}`);
  const body = Buffer.from(await response.arrayBuffer());
  const actual = sha256(body);
  if (actual !== WINSW_SHA256) {
    throw new Error(`WinSW checksum mismatch: expected ${WINSW_SHA256}, got ${actual}. The file was not saved.`);
  }
  mkdirSync(path.dirname(WINSW_PATH), { recursive: true });
  const temp = `${WINSW_PATH}.tmp`;
  writeFileSync(temp, body);
  renameSync(temp, WINSW_PATH);
  console.log(`WinSW ${WINSW_VERSION} verified (${actual}) -> ${path.relative(root, WINSW_PATH)}`);
  return WINSW_PATH;
}

if (import.meta.filename === path.resolve(process.argv[1] ?? '')) await fetchWinsw();
