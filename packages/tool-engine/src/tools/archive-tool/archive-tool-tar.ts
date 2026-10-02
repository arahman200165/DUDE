import { ArchiveEntry } from "./archive-tool-types.js";

const BLOCK_SIZE = 512;
const MAX_NAME_BYTES = 100;

function writeStringField(target: Uint8Array, offset: number, value: string, length: number): void {
  const encoded = new TextEncoder().encode(value).slice(0, length);
  target.set(encoded, offset);
}

function writeOctalField(target: Uint8Array, offset: number, value: number, length: number): void {
  const digits = value.toString(8).padStart(length - 1, '0');
  writeStringField(target, offset, `${digits}\0`, length);
}

function buildHeader(name: string, size: number, mtimeSeconds: number): Uint8Array {
  const header = new Uint8Array(BLOCK_SIZE);

  writeStringField(header, 0, name, 100);
  writeOctalField(header, 100, 0o644, 8); // mode
  writeOctalField(header, 108, 0, 8); // uid
  writeOctalField(header, 116, 0, 8); // gid
  writeOctalField(header, 124, size, 12); // size
  writeOctalField(header, 136, mtimeSeconds, 12); // mtime
  header.fill(0x20, 148, 156); // checksum field: spaces while computing
  writeStringField(header, 156, '0', 1); // typeflag: regular file
  writeStringField(header, 257, 'ustar', 6); // magic
  writeStringField(header, 263, '00', 2); // version

  let checksum = 0;
  for (let i = 0; i < BLOCK_SIZE; i++) checksum += header[i];
  writeStringField(header, 148, `${checksum.toString(8).padStart(6, '0')}\0 `, 8);

  return header;
}

export type TarCreateResult = { readonly ok: true; readonly bytes: Uint8Array } | { readonly ok: false; readonly error: string };

/** Builds an uncompressed USTAR archive. Only the plain-file/100-byte-name subset of the format — no long-name (PAX) extensions. */
export function createTar(entries: readonly ArchiveEntry[]): TarCreateResult {
  const tooLong = entries.find((entry) => new TextEncoder().encode(entry.name).length > MAX_NAME_BYTES);
  if (tooLong) {
    return { ok: false, error: `"${tooLong.name}" is longer than the 100-byte USTAR name limit — shorten it or use ZIP instead.` };
  }

  const mtimeSeconds = Math.floor(Date.now() / 1000);
  const chunks: Uint8Array[] = [];

  for (const entry of entries) {
    chunks.push(buildHeader(entry.name, entry.data.length, mtimeSeconds));
    chunks.push(entry.data);
    const padding = (BLOCK_SIZE - (entry.data.length % BLOCK_SIZE)) % BLOCK_SIZE;
    if (padding > 0) chunks.push(new Uint8Array(padding));
  }
  chunks.push(new Uint8Array(BLOCK_SIZE * 2)); // two zero blocks mark end-of-archive

  const bytes = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }

  return { ok: true, bytes };
}

function readStringField(header: Uint8Array, offset: number, length: number): string {
  const field = header.slice(offset, offset + length);
  const nul = field.indexOf(0);
  return new TextDecoder().decode(nul === -1 ? field : field.slice(0, nul));
}

function readOctalField(header: Uint8Array, offset: number, length: number): number {
  const text = readStringField(header, offset, length).trim();
  return text === '' ? 0 : parseInt(text, 8);
}

export function extractTar(bytes: Uint8Array): readonly ArchiveEntry[] {
  const entries: ArchiveEntry[] = [];
  let offset = 0;

  while (offset + BLOCK_SIZE <= bytes.length) {
    const header = bytes.slice(offset, offset + BLOCK_SIZE);
    if (header.every((byte) => byte === 0)) break;

    const name = readStringField(header, 0, 100);
    const size = readOctalField(header, 124, 12);
    offset += BLOCK_SIZE;

    entries.push({ name, data: bytes.slice(offset, offset + size) });
    offset += Math.ceil(size / BLOCK_SIZE) * BLOCK_SIZE;
  }

  return entries;
}
