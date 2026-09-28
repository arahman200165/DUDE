import { sha256 } from '@noble/hashes/sha2.js';
import type { HashAlgorithm } from '../hash-compute';

/**
 * Checksum-manifest formats and the deterministic directory hash for Hash Manifest & Snapshot
 * (Phase 29 items 9, 15, Milestone 527). Pure and shared by the fs worker (which verifies manifests
 * and computes the Merkle hash while it streams) and the renderer (which formats the output).
 *
 * GNU (`sha256sum`) lines are `<hex>  <path>`; a path containing `\`, CR or LF is escaped the way
 * coreutils does it (the line starts with `\`, and `\\`, `\n`, `\r` stand for those characters), so
 * the output round-trips through `sha256sum -c`. BSD tag lines are `SHA256 (path) = <hex>`, as
 * written by `shasum --tag` / `openssl dgst` / `b2sum --tag`.
 */

export interface ManifestEntry {
  readonly path: string;
  readonly size: number;
  readonly mtimeMs: number;
  readonly digests: Readonly<Partial<Record<HashAlgorithm, string>>>;
}

export interface ParsedLine {
  readonly path: string;
  readonly digest: string;
  readonly algorithm: HashAlgorithm | null;
  readonly line: number;
}

export interface ParsedManifest {
  readonly format: 'gnu' | 'bsd' | 'json' | 'csv';
  readonly entries: readonly ParsedLine[];
  readonly errors: readonly { line: number; text: string }[];
}

export const BSD_TAGS: Readonly<Record<HashAlgorithm, string>> = {
  MD5: 'MD5', 'SHA-1': 'SHA1', 'SHA-256': 'SHA256', 'SHA-384': 'SHA384', 'SHA-512': 'SHA512',
  'SHA3-256': 'SHA3-256', 'SHA3-384': 'SHA3-384', 'SHA3-512': 'SHA3-512', BLAKE2b: 'BLAKE2b', BLAKE2s: 'BLAKE2s', BLAKE3: 'BLAKE3',
  XXH32: 'XXH32', XXH64: 'XXH64', CRC32: 'CRC32', CRC64: 'CRC64',
};

const TAG_LOOKUP = new Map<string, HashAlgorithm>([
  ...Object.entries(BSD_TAGS).map(([algorithm, tag]) => [tag.toUpperCase(), algorithm as HashAlgorithm] as [string, HashAlgorithm]),
  ['SHA-1', 'SHA-1'], ['SHA-256', 'SHA-256'], ['SHA-384', 'SHA-384'], ['SHA-512', 'SHA-512'], ['BLAKE2B-512', 'BLAKE2b'], ['BLAKE2S-256', 'BLAKE2s'],
]);

/** GNU manifests don't name the algorithm; the digest length usually does. */
export function algorithmForDigestLength(length: number): HashAlgorithm | null {
  return ({ 32: 'MD5', 40: 'SHA-1', 64: 'SHA-256', 96: 'SHA-384', 128: 'SHA-512' } as Record<number, HashAlgorithm>)[length] ?? null;
}

function gnuEscape(path: string): { escaped: string; needs: boolean } {
  const needs = /[\\\n\r]/.test(path);
  return { escaped: needs ? path.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/\r/g, '\\r') : path, needs };
}

function gnuUnescape(path: string): string {
  return path.replace(/\\(\\|n|r)/g, (_match, char: string) => (char === 'n' ? '\n' : char === 'r' ? '\r' : '\\'));
}

export function formatGnu(entries: readonly ManifestEntry[], algorithm: HashAlgorithm): string {
  return entries
    .filter((entry) => entry.digests[algorithm])
    .map((entry) => {
      const { escaped, needs } = gnuEscape(entry.path);
      return `${needs ? '\\' : ''}${entry.digests[algorithm]}  ${escaped}`;
    })
    .join('\n') + '\n';
}

export function formatBsd(entries: readonly ManifestEntry[], algorithms: readonly HashAlgorithm[]): string {
  const lines: string[] = [];
  for (const entry of entries) for (const algorithm of algorithms) if (entry.digests[algorithm]) lines.push(`${BSD_TAGS[algorithm]} (${entry.path}) = ${entry.digests[algorithm]}`);
  return lines.join('\n') + '\n';
}

export function formatJson(entries: readonly ManifestEntry[], meta: Record<string, unknown>): string {
  return JSON.stringify({ ...meta, files: entries.map((entry) => ({ path: entry.path, size: entry.size, mtime: new Date(entry.mtimeMs).toISOString(), ...entry.digests })) }, null, 2) + '\n';
}

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function formatCsv(entries: readonly ManifestEntry[], algorithms: readonly HashAlgorithm[]): string {
  const lines = [['path', 'size', 'mtime', ...algorithms].join(',')];
  for (const entry of entries) lines.push([entry.path, entry.size, new Date(entry.mtimeMs).toISOString(), ...algorithms.map((algorithm) => entry.digests[algorithm] ?? '')].map(csvCell).join(','));
  return lines.join('\n') + '\n';
}

const BSD_LINE = /^([A-Za-z0-9-]+) \((.*)\) = ([0-9a-fA-F]+)$/;
const GNU_LINE = /^(\\?)([0-9a-fA-F]+) [ *](.*)$/;

/** Parses GNU, BSD-tag, or DUDE's own JSON/CSV manifests; `fallback` names a GNU manifest's algorithm. */
export function parseManifest(text: string, fallback: HashAlgorithm | null = null): ParsedManifest {
  const trimmed = text.trimStart();
  if (trimmed.startsWith('{')) return parseJsonManifest(trimmed);
  const rawLines = text.split(/\r?\n/);
  if (/^path,size,mtime,/.test(rawLines[0] ?? '')) return parseCsvManifest(text);
  const entries: ParsedLine[] = [];
  const errors: { line: number; text: string }[] = [];
  let bsd = 0;
  let gnu = 0;
  rawLines.forEach((raw, index) => {
    const line = raw.trimEnd();
    if (!line || line.startsWith('#')) return;
    const bsdMatch = BSD_LINE.exec(line);
    if (bsdMatch) {
      bsd++;
      entries.push({ path: bsdMatch[2], digest: bsdMatch[3].toLowerCase(), algorithm: TAG_LOOKUP.get(bsdMatch[1].toUpperCase()) ?? null, line: index + 1 });
      return;
    }
    const gnuMatch = GNU_LINE.exec(line);
    if (gnuMatch) {
      gnu++;
      entries.push({ path: gnuMatch[1] ? gnuUnescape(gnuMatch[3]) : gnuMatch[3], digest: gnuMatch[2].toLowerCase(), algorithm: fallback ?? algorithmForDigestLength(gnuMatch[2].length), line: index + 1 });
      return;
    }
    errors.push({ line: index + 1, text: line.slice(0, 200) });
  });
  return { format: bsd > gnu ? 'bsd' : 'gnu', entries, errors };
}

function parseJsonManifest(text: string): ParsedManifest {
  try {
    const value = JSON.parse(text) as { files?: Record<string, unknown>[] };
    const entries: ParsedLine[] = [];
    (value.files ?? []).forEach((file, index) => {
      for (const algorithm of Object.keys(BSD_TAGS) as HashAlgorithm[]) {
        const digest = file[algorithm];
        if (typeof file['path'] === 'string' && typeof digest === 'string') entries.push({ path: file['path'], digest: digest.toLowerCase(), algorithm, line: index + 1 });
      }
    });
    return { format: 'json', entries, errors: [] };
  } catch (error) {
    return { format: 'json', entries: [], errors: [{ line: 1, text: error instanceof Error ? error.message : 'Invalid JSON' }] };
  }
}

/** RFC 4180 records: quoted cells may contain commas, quotes (`""`) and line breaks. */
function csvRecords(text: string): string[][] {
  const records: string[][] = [];
  let cells: string[] = [];
  let current = '';
  let quoted = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { current += '"'; index++; }
      else if (char === '"') quoted = false;
      else current += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { cells.push(current); current = ''; }
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[index + 1] === '\n') index++;
      cells.push(current);
      records.push(cells);
      cells = [];
      current = '';
    } else current += char;
  }
  if (current || cells.length) { cells.push(current); records.push(cells); }
  return records;
}

function parseCsvManifest(text: string): ParsedManifest {
  const [header = [], ...rows] = csvRecords(text);
  const algorithms = header.slice(3).filter((name): name is HashAlgorithm => name in BSD_TAGS);
  const entries: ParsedLine[] = [];
  rows.forEach((cells, index) => {
    if (cells.length < 3) return;
    algorithms.forEach((algorithm, offset) => {
      const digest = cells[3 + offset];
      if (digest) entries.push({ path: cells[0], digest: digest.toLowerCase(), algorithm, line: index + 2 });
    });
  });
  return { format: 'csv', entries, errors: [] };
}

// ---- Deterministic directory hash ----

export const MERKLE_DESCRIPTION =
  'SHA-256 Merkle tree: a file contributes its SHA-256 content digest; a folder hashes the lines ' +
  '"<d|f> <hex digest> <name>\\n" for its children, sorted by name in code-point order, as UTF-8. ' +
  'The directory hash is the root folder\'s digest. Names, content and structure matter; timestamps, ' +
  'permissions and the root folder\'s own name do not. Empty folders count.';

const encoder = new TextEncoder();
function hex(bytes: Uint8Array): string { let out = ''; for (const byte of bytes) out += byte.toString(16).padStart(2, '0'); return out; }

export interface MerkleResult {
  readonly root: string;
  /** Per-folder subtree digests, keyed by root-relative posix path ('' is the root). */
  readonly folders: ReadonlyMap<string, string>;
}

/** `files` maps posix path → SHA-256 hex; `dirs` lists every folder path (so empty folders count). */
export function merkleHash(files: ReadonlyMap<string, string>, dirs: Iterable<string>): MerkleResult {
  const children = new Map<string, { name: string; type: 'd' | 'f'; path: string }[]>([['', []]]);
  const parentOf = (path: string) => { const slash = path.lastIndexOf('/'); return slash < 0 ? '' : path.slice(0, slash); };
  const nameOf = (path: string) => path.slice(path.lastIndexOf('/') + 1);
  const ensureDir = (path: string): void => {
    if (children.has(path)) return;
    children.set(path, []);
    const parent = parentOf(path);
    ensureDir(parent);
    children.get(parent)!.push({ name: nameOf(path), type: 'd', path });
  };
  for (const dir of dirs) ensureDir(dir);
  for (const path of files.keys()) {
    ensureDir(parentOf(path));
    children.get(parentOf(path))!.push({ name: nameOf(path), type: 'f', path });
  }
  const folders = new Map<string, string>();
  const digestOf = (path: string): string => {
    const cached = folders.get(path);
    if (cached) return cached;
    const list = [...(children.get(path) ?? [])].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    const text = list.map((child) => `${child.type} ${child.type === 'f' ? files.get(child.path) : digestOf(child.path)} ${child.name}\n`).join('');
    const digest = hex(sha256(encoder.encode(text)));
    folders.set(path, digest);
    return digest;
  };
  return { root: digestOf(''), folders };
}
