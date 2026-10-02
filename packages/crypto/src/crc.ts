/**
 * Hand-rolled, table-driven CRC32 and CRC64. No well-maintained browser-targeting
 * package covers this cleanly at the size these two checksums warrant (same "trivial,
 * shouldn't cost a dependency" reasoning as Phase 11's hand-rolled Base85/basE91) —
 * see `apps/web/src/app/tools/AGENTS.md`'s file layout note and `DUDE_PRD.md` §17.
 *
 * CRC32 here is CRC-32/ISO-HDLC (poly 0xEDB88320 reflected) — the "zip/ethernet"
 * variant almost universally meant by a bare "CRC32" checksum tool.
 *
 * CRC64 here is CRC-64/XZ (poly 0x42F0E1EBA9EA3693, reflected form 0xC96C5795D7870F42)
 * — the variant used by .xz/7-Zip. Multiple incompatible CRC64 polynomials exist
 * (CRC-64/XZ vs CRC-64/GO-ISO vs CRC-64/MS, etc.); this one is documented explicitly
 * since a caller matching against a different tool's CRC64 needs to know which.
 */

function buildCrc32Table(): Uint32Array {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
}

const CRC32_TABLE = buildCrc32Table();

export function crc32(bytes: Uint8Array): string {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return ((crc ^ 0xffffffff) >>> 0).toString(16).padStart(8, '0');
}

const CRC64_POLY = 0xc96c5795d7870f42n;
const MASK64 = 0xffffffffffffffffn;

function buildCrc64Table(): BigUint64Array {
  const table = new BigUint64Array(256);
  for (let n = 0; n < 256; n++) {
    let c = BigInt(n);
    for (let k = 0; k < 8; k++) {
      c = c & 1n ? CRC64_POLY ^ (c >> 1n) : c >> 1n;
    }
    table[n] = c;
  }
  return table;
}

const CRC64_TABLE = buildCrc64Table();

export function crc64(bytes: Uint8Array): string {
  let crc = MASK64;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC64_TABLE[Number((crc ^ BigInt(bytes[i])) & 0xffn)] ^ (crc >> 8n);
  }
  return (crc ^ MASK64).toString(16).padStart(16, '0');
}

/** Incremental CRC-32/ISO-HDLC for streamed input (Phase 29 bulk hashing); same result as `crc32`. */
export function createCrc32(): { update(bytes: Uint8Array): void; digest(): string } {
  let crc = 0xffffffff;
  return {
    update(bytes) {
      for (let i = 0; i < bytes.length; i++) crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    },
    digest: () => ((crc ^ 0xffffffff) >>> 0).toString(16).padStart(8, '0'),
  };
}

/** Incremental CRC-64/XZ for streamed input; same result as `crc64`. */
export function createCrc64(): { update(bytes: Uint8Array): void; digest(): string } {
  let crc = MASK64;
  return {
    update(bytes) {
      for (let i = 0; i < bytes.length; i++) crc = CRC64_TABLE[Number((crc ^ BigInt(bytes[i])) & 0xffn)] ^ (crc >> 8n);
    },
    digest: () => (crc ^ MASK64).toString(16).padStart(16, '0'),
  };
}
