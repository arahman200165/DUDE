// Downloads the sqlite-vec 0.1.9 loadable extension for Windows x64 (the vector slot of the 32-SS1 Hub store, PD-147)
// to build/vendor/sqlite-vec/vec0.dll. The release archive is verified against a pinned SHA-256 (the value in the
// release's own checksums.txt, recorded trust-on-first-download like WinSW), the extracted vec0.dll against a second
// pin, and a changed hash fails the step instead of being accepted. The Hub verifies vec0.dll against the same pin
// again before it ever calls loadExtension. Only the Windows x64 library is fetched: the Alpine (musl) Docker image has
// no sqlite-vec build and reports "vector unavailable".
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';

export const SQLITE_VEC_VERSION = '0.1.9';
export const SQLITE_VEC_URL = `https://github.com/asg017/sqlite-vec/releases/download/v${SQLITE_VEC_VERSION}/sqlite-vec-${SQLITE_VEC_VERSION}-loadable-windows-x86_64.tar.gz`;
export const SQLITE_VEC_ARCHIVE_SHA256 = '51581189d52066b4dfc6631f6d7a3eab7dedc2260656ab09ca97ab3fb8165983';
export const SQLITE_VEC_DLL_SHA256 = 'fcf98662a7ad9dce394b96a88f91032047823831b951c76636787c312a6476e6';

const root = path.resolve(import.meta.dirname, '..');
export const SQLITE_VEC_PATH = path.join(root, 'build', 'vendor', 'sqlite-vec', 'vec0.dll');

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');

/** Reads one regular file out of an (uncompressed) ustar archive; the release holds a single `vec0.dll`. */
function readTarEntry(tar, name) {
  for (let offset = 0; offset + 512 <= tar.length; ) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const entryName = header.toString('utf8', 0, 100).replace(/\0.*$/s, '');
    const size = parseInt(header.toString('ascii', 124, 136).replace(/\0.*$/s, '').trim() || '0', 8);
    const start = offset + 512;
    if (path.posix.basename(entryName) === name && header[156] !== 0x35) return tar.subarray(start, start + size);
    offset = start + Math.ceil(size / 512) * 512;
  }
  throw new Error(`${name} not found in the sqlite-vec archive`);
}

export async function fetchSqliteVec() {
  if (existsSync(SQLITE_VEC_PATH) && sha256(readFileSync(SQLITE_VEC_PATH)) === SQLITE_VEC_DLL_SHA256) {
    console.log(`sqlite-vec ${SQLITE_VEC_VERSION} already present and verified (${SQLITE_VEC_DLL_SHA256}).`);
    return SQLITE_VEC_PATH;
  }
  console.log(`Downloading ${SQLITE_VEC_URL}`);
  const response = await fetch(SQLITE_VEC_URL, { redirect: 'follow' });
  if (!response.ok) throw new Error(`sqlite-vec download failed: HTTP ${response.status}`);
  const archive = Buffer.from(await response.arrayBuffer());
  const archiveHash = sha256(archive);
  if (archiveHash !== SQLITE_VEC_ARCHIVE_SHA256) {
    throw new Error(`sqlite-vec archive checksum mismatch: expected ${SQLITE_VEC_ARCHIVE_SHA256}, got ${archiveHash}. Nothing was saved.`);
  }
  const dll = readTarEntry(gunzipSync(archive), 'vec0.dll');
  const dllHash = sha256(dll);
  if (dllHash !== SQLITE_VEC_DLL_SHA256) {
    throw new Error(`vec0.dll checksum mismatch: expected ${SQLITE_VEC_DLL_SHA256}, got ${dllHash}. The file was not saved.`);
  }
  mkdirSync(path.dirname(SQLITE_VEC_PATH), { recursive: true });
  const temp = `${SQLITE_VEC_PATH}.tmp`;
  writeFileSync(temp, dll);
  renameSync(temp, SQLITE_VEC_PATH);
  console.log(`sqlite-vec ${SQLITE_VEC_VERSION} verified (${dllHash}) -> ${path.relative(root, SQLITE_VEC_PATH)}`);
  return SQLITE_VEC_PATH;
}

if (import.meta.filename === path.resolve(process.argv[1] ?? '')) await fetchSqliteVec();
