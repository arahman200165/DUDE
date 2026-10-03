// Writes precompressed `.br` and `.gz` siblings next to compressible static files so the Hub can serve them
// (apps/hub/src/server/static.ts negotiates Accept-Encoding). Usage: node scripts/compress-static.mjs <dir>
//
// Run only for Hub packaging (Docker image, staged/SEA service). Never part of the GitHub Pages build:
// Pages ignores the variants, and the Angular service worker hashes raw files (variants are created after the
// Angular build, so they never appear in ngsw.json). Idempotent: existing variants are skipped.
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';
import { readdirSync, readFileSync, statSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';

export const COMPRESSIBLE_EXTENSIONS = new Set(['.js', '.mjs', '.css', '.html', '.json', '.svg', '.wasm', '.txt', '.map', '.webmanifest']);
export const MIN_BYTES = 1024;
/** A variant is kept only when it is at least this much smaller than the original. */
export const MIN_SAVING = 0.1;

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.isFile()) yield full;
  }
}

/** Compress eligible files under `dir`; returns counts. */
export function compressStatic(dir) {
  const result = { scanned: 0, br: 0, gz: 0, skipped: 0, rawBytes: 0, brBytes: 0 };
  for (const file of walk(dir)) {
    const ext = path.extname(file).toLowerCase();
    if (ext === '.br' || ext === '.gz' || !COMPRESSIBLE_EXTENSIONS.has(ext)) continue;
    const size = statSync(file).size;
    if (size < MIN_BYTES) continue;
    result.scanned += 1;
    const hasBr = existsSync(`${file}.br`);
    const hasGz = existsSync(`${file}.gz`);
    if (hasBr && hasGz) {
      result.skipped += 1;
      continue;
    }
    const data = readFileSync(file);
    const worthIt = (out) => out.length <= data.length * (1 - MIN_SAVING);
    if (!hasBr) {
      const br = brotliCompressSync(data, {
        params: { [constants.BROTLI_PARAM_QUALITY]: 11, [constants.BROTLI_PARAM_SIZE_HINT]: data.length },
      });
      if (worthIt(br)) {
        writeFileSync(`${file}.br`, br);
        result.br += 1;
        result.rawBytes += data.length;
        result.brBytes += br.length;
      }
    }
    if (!hasGz) {
      const gz = gzipSync(data, { level: 9 });
      if (worthIt(gz)) {
        writeFileSync(`${file}.gz`, gz);
        result.gz += 1;
      }
    }
  }
  return result;
}

if (import.meta.filename === path.resolve(process.argv[1] ?? '')) {
  const target = process.argv[2];
  if (!target) {
    console.error('Usage: node scripts/compress-static.mjs <dir>');
    process.exit(2);
  }
  const dir = path.resolve(target);
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    console.error(`compress-static: ${dir} is not a directory.`);
    process.exit(1);
  }
  const r = compressStatic(dir);
  const saved = r.rawBytes > 0 ? ` (${(r.rawBytes / 1048576).toFixed(1)} MiB -> ${(r.brBytes / 1048576).toFixed(1)} MiB brotli)` : '';
  console.log(`compress-static ${path.relative(process.cwd(), dir) || '.'}: ${r.scanned} eligible, +${r.br} .br, +${r.gz} .gz, ${r.skipped} already done${saved}`);
}
