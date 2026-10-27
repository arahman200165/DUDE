// Downloads cloudflared (the Cloudflare tunnel connector the Hub runs as a supervised child, 32-SS1 PD-142) to
// build/vendor/cloudflared/cloudflared.exe and verifies it against a pinned SHA-256. The pin was computed from a
// download of the official GitHub release and matches the checksum the release publishes (its notes and the asset
// digest both list the same value); a changed hash fails the step instead of being accepted. Windows only: the Docker
// image never carries cloudflared.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const CLOUDFLARED_VERSION = '2026.10.4';
export const CLOUDFLARED_ASSET = 'cloudflared-windows-amd64.exe';
export const CLOUDFLARED_URL = `https://github.com/cloudflare/cloudflared/releases/download/${CLOUDFLARED_VERSION}/${CLOUDFLARED_ASSET}`;
export const CLOUDFLARED_SHA256 = '411b16d40c8d872243efeb52c550053d00af0a8a97fbb32e730fb8aba429eaa8';

const root = path.resolve(import.meta.dirname, '..');
export const CLOUDFLARED_PATH = path.join(root, 'build', 'vendor', 'cloudflared', 'cloudflared.exe');

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');

export async function fetchCloudflared() {
  if (existsSync(CLOUDFLARED_PATH) && sha256(readFileSync(CLOUDFLARED_PATH)) === CLOUDFLARED_SHA256) {
    console.log(`cloudflared ${CLOUDFLARED_VERSION} already present and verified (${CLOUDFLARED_SHA256}).`);
    return CLOUDFLARED_PATH;
  }
  console.log(`Downloading ${CLOUDFLARED_URL}`);
  const response = await fetch(CLOUDFLARED_URL, { redirect: 'follow' });
  if (!response.ok) throw new Error(`cloudflared download failed: HTTP ${response.status}`);
  const body = Buffer.from(await response.arrayBuffer());
  const actual = sha256(body);
  if (actual !== CLOUDFLARED_SHA256) {
    throw new Error(`cloudflared checksum mismatch: expected ${CLOUDFLARED_SHA256}, got ${actual}. The file was not saved.`);
  }
  mkdirSync(path.dirname(CLOUDFLARED_PATH), { recursive: true });
  const temp = `${CLOUDFLARED_PATH}.tmp`;
  try {
    writeFileSync(temp, body);
    renameSync(temp, CLOUDFLARED_PATH);
  } catch (error) {
    rmSync(temp, { force: true });
    throw error;
  }
  console.log(`cloudflared ${CLOUDFLARED_VERSION} verified (${actual}) -> ${path.relative(root, CLOUDFLARED_PATH)}`);
  return CLOUDFLARED_PATH;
}

if (import.meta.filename === path.resolve(process.argv[1] ?? '')) await fetchCloudflared();
