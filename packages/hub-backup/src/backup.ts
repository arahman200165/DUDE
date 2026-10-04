import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { BackupError } from './backup-error.js';
import {
  BACKUP_FORMAT_VERSION,
  BACKUP_MAGIC,
  BACKUP_READER_VERSION,
  CHUNK_SIZE,
  DEFAULT_KDF_PARAMS,
  KEY_BYTES,
  MAX_BACKUP_FILES,
  MAX_BACKUP_PLAINTEXT_BYTES,
  MAX_MANIFEST_BYTES,
  NONCE_BYTES,
  SALT_BYTES,
  STREAM_ID_BYTES,
  TAG_BYTES,
  concatBytes,
  fromBase64Url,
  isInt,
  isPlainObject,
  kdfParamsInBounds,
  normalizePassphrase,
  parseHeader,
  serializeHeader,
  sha256Hex,
  toBase64Url,
  u32be,
  validFileName,
  type BackupHeader,
  type BackupManifest,
  type BackupManifestFile,
  type BackupSource,
  type KdfParams,
} from './backup-format.js';

export interface BackupDeps {
  /** Derives a 32-byte key from the NFKC-normalized UTF-8 passphrase. The Hub injects Argon2id. */
  deriveKey(passphrase: Uint8Array, salt: Uint8Array, params: KdfParams): Promise<Uint8Array>;
  randomBytes(n: number): Uint8Array;
  now(): Date;
}

export interface DerivedBackupKey {
  key: Uint8Array;
  salt: Uint8Array;
  params: KdfParams;
}

export type BackupCredential = { passphrase: string } | { derived: DerivedBackupKey };

export interface BackupFile {
  name: string;
  bytes: Uint8Array;
}

export interface BackupInput {
  files: BackupFile[];
  hubVersion: string;
  source: BackupSource;
  forTransfer: boolean;
  counts?: Record<string, number>;
}

export interface OpenedBackup {
  header: BackupHeader;
  manifest: BackupManifest;
  files: Map<string, Uint8Array>;
}

export function readBackupHeader(bytes: Uint8Array): BackupHeader {
  return parseHeader(bytes).header;
}

function random(deps: BackupDeps, length: number): Uint8Array {
  const out = deps.randomBytes(length);
  if (!(out instanceof Uint8Array) || out.length !== length) throw new BackupError('bad-input', 'The random source returned the wrong number of bytes.');
  return out;
}

async function derive(passphraseBytes: Uint8Array, salt: Uint8Array, params: KdfParams, deps: BackupDeps): Promise<Uint8Array> {
  const key = await deps.deriveKey(passphraseBytes, salt, params);
  if (!(key instanceof Uint8Array) || key.length !== KEY_BYTES) throw new BackupError('bad-input', 'The key derivation returned an invalid key.');
  return key;
}

/** Derives a key with a fresh random salt so several backups can share one expensive derivation. */
export async function deriveBackupKey(passphrase: string, deps: BackupDeps, params: KdfParams = DEFAULT_KDF_PARAMS): Promise<DerivedBackupKey> {
  if (!isPlainObject(params) || !kdfParamsInBounds(params)) throw new BackupError('bad-input', 'The key derivation parameters are out of bounds.');
  const passphraseBytes = normalizePassphrase(passphrase);
  try {
    const salt = random(deps, SALT_BYTES).slice();
    const key = await derive(passphraseBytes, salt, { m: params.m, t: params.t, p: params.p, len: 32 }, deps);
    return { key, salt, params: { m: params.m, t: params.t, p: params.p, len: 32 } };
  } finally {
    passphraseBytes.fill(0);
  }
}

function checkDerived(derived: DerivedBackupKey): void {
  if (
    !isPlainObject(derived) ||
    !(derived.key instanceof Uint8Array) ||
    derived.key.length !== KEY_BYTES ||
    !(derived.salt instanceof Uint8Array) ||
    derived.salt.length !== SALT_BYTES ||
    !isPlainObject(derived.params) ||
    !kdfParamsInBounds(derived.params)
  ) {
    throw new BackupError('bad-input', 'The derived backup key is invalid.');
  }
}

function chunkNonce(streamId: Uint8Array, counter: number): Uint8Array {
  const nonce = new Uint8Array(NONCE_BYTES);
  nonce.set(streamId, 0);
  // u64 big-endian counter; chunk counts are far below 2^32 (<= 512 MiB / 1 KiB).
  new DataView(nonce.buffer).setUint32(STREAM_ID_BYTES + 4, counter, false);
  return nonce;
}

function chunkAad(headerHash: Uint8Array, final: boolean): Uint8Array {
  const aad = new Uint8Array(headerHash.length + 1);
  aad.set(headerHash, 0);
  aad[headerHash.length] = final ? 1 : 0;
  return aad;
}

function checkSource(source: unknown): BackupSource {
  if (
    !isPlainObject(source) ||
    typeof source['hubInstanceId'] !== 'string' ||
    !isInt(source['authorityEpoch'], 0, Number.MAX_SAFE_INTEGER) ||
    !isInt(source['schemaVersion'], 0, Number.MAX_SAFE_INTEGER) ||
    !isInt(source['dbMinReaderVersion'], 0, Number.MAX_SAFE_INTEGER)
  ) {
    throw new BackupError('bad-input', 'The backup source description is invalid.');
  }
  return {
    hubInstanceId: source['hubInstanceId'],
    authorityEpoch: source['authorityEpoch'],
    schemaVersion: source['schemaVersion'],
    dbMinReaderVersion: source['dbMinReaderVersion'],
  };
}

function checkCounts(counts: unknown): Record<string, number> {
  if (!isPlainObject(counts)) throw new BackupError('bad-input', 'The backup counts are invalid.');
  const entries: Array<[string, number]> = [];
  for (const [key, value] of Object.entries(counts)) {
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new BackupError('bad-input', 'The backup counts are invalid.');
    entries.push([key, value]);
  }
  return Object.fromEntries(entries);
}

function checkFileList(names: string[]): void {
  if (names.length > MAX_BACKUP_FILES) throw new BackupError('too-large', `A backup holds at most ${MAX_BACKUP_FILES} files.`);
  const seen = new Set<string>();
  for (const name of names) {
    if (!validFileName(name)) throw new BackupError('bad-input', 'A backup file name is not allowed.');
    // Case-insensitive: the Hub restores by fixed names onto case-insensitive file systems too.
    const folded = name.toLowerCase();
    if (seen.has(folded)) throw new BackupError('bad-input', 'Backup file names must be unique.');
    seen.add(folded);
  }
}

export async function sealBackup(input: BackupInput, credential: BackupCredential, deps: BackupDeps): Promise<Uint8Array> {
  if (!isPlainObject(input) || !Array.isArray(input.files)) throw new BackupError('bad-input', 'The backup input is invalid.');
  if (typeof input.hubVersion !== 'string' || typeof input.forTransfer !== 'boolean') throw new BackupError('bad-input', 'The backup input is invalid.');
  const source = checkSource(input.source);
  const counts = checkCounts(input.counts ?? {});
  checkFileList(input.files.map(file => file?.name));
  let fileBytes = 0;
  for (const file of input.files) {
    if (!(file.bytes instanceof Uint8Array)) throw new BackupError('bad-input', 'A backup file must be a Uint8Array.');
    fileBytes += file.bytes.length;
    if (fileBytes > MAX_BACKUP_PLAINTEXT_BYTES) throw new BackupError('too-large', 'The backup is too large.');
  }

  let key: Uint8Array;
  let salt: Uint8Array;
  let params: KdfParams;
  let ownedKey: Uint8Array | null = null;
  if ('derived' in credential) {
    checkDerived(credential.derived);
    ({ key, salt, params } = credential.derived);
  } else {
    const fresh = await deriveBackupKey(credential.passphrase, deps);
    ({ key, salt, params } = fresh);
    ownedKey = fresh.key;
  }

  let plaintext: Uint8Array | null = null;
  try {
    // A fresh stream id for every file, even with a reused derived key, so nonces never repeat under one key.
    const streamId = random(deps, STREAM_ID_BYTES).slice();
    const manifest: BackupManifest = {
      formatVersion: BACKUP_FORMAT_VERSION,
      minReaderVersion: BACKUP_READER_VERSION,
      createdAt: deps.now().toISOString(),
      hubVersion: input.hubVersion,
      source,
      forTransfer: input.forTransfer,
      files: input.files.map(file => ({ name: file.name, size: file.bytes.length, sha256: sha256Hex(file.bytes) })),
      counts,
    };
    const manifestBytes = new TextEncoder().encode(JSON.stringify(manifest));
    if (manifestBytes.length > MAX_MANIFEST_BYTES || 4 + manifestBytes.length + fileBytes > MAX_BACKUP_PLAINTEXT_BYTES) {
      throw new BackupError('too-large', 'The backup is too large.');
    }
    plaintext = concatBytes([u32be(manifestBytes.length), manifestBytes, ...input.files.map(file => file.bytes)]);

    const header: BackupHeader = {
      formatVersion: BACKUP_FORMAT_VERSION,
      minReaderVersion: BACKUP_READER_VERSION,
      kdf: { name: 'argon2id', m: params.m, t: params.t, p: params.p, len: 32, salt: toBase64Url(salt) },
      cipher: 'xchacha20poly1305',
      chunkSize: CHUNK_SIZE,
      streamId: toBase64Url(streamId),
    };
    const headerFile = serializeHeader(header);
    const headerHash = sha256(headerFile.subarray(BACKUP_MAGIC.length + 4));
    const chunkCount = Math.max(1, Math.ceil(plaintext.length / CHUNK_SIZE));
    const out = new Uint8Array(headerFile.length + plaintext.length + chunkCount * (4 + TAG_BYTES));
    out.set(headerFile, 0);
    let position = headerFile.length;
    for (let index = 0; index < chunkCount; index++) {
      const slice = plaintext.subarray(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE);
      const sealed = xchacha20poly1305(key, chunkNonce(streamId, index), chunkAad(headerHash, index === chunkCount - 1)).encrypt(slice);
      new DataView(out.buffer).setUint32(position, sealed.length, false);
      out.set(sealed, position + 4);
      position += 4 + sealed.length;
    }
    return out;
  } finally {
    plaintext?.fill(0);
    ownedKey?.fill(0);
  }
}

interface Frame {
  start: number;
  length: number;
}

/** Splits the chunk area into frames, rejecting oversize chunks, trailing garbage and (before decrypting) oversize totals. */
function readFrames(bytes: Uint8Array, offset: number, chunkSize: number): Frame[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const frames: Frame[] = [];
  let plaintextBytes = 0;
  let position = offset;
  while (position < bytes.length) {
    if (bytes.length - position < 4) throw new BackupError('truncated', 'The backup ends inside a chunk.');
    const length = view.getUint32(position, false);
    if (length < TAG_BYTES || length > chunkSize + TAG_BYTES) throw new BackupError('integrity', 'The backup contains an invalid chunk.');
    if (bytes.length - position - 4 < length) throw new BackupError('truncated', 'The backup ends inside a chunk.');
    plaintextBytes += length - TAG_BYTES;
    if (plaintextBytes > MAX_BACKUP_PLAINTEXT_BYTES) throw new BackupError('too-large', 'The backup is too large.');
    frames.push({ start: position + 4, length });
    position += 4 + length;
  }
  if (frames.length === 0) throw new BackupError('truncated', 'The backup contains no data.');
  return frames;
}

function tryDecrypt(key: Uint8Array, nonce: Uint8Array, aad: Uint8Array, ciphertext: Uint8Array): Uint8Array | null {
  try {
    return xchacha20poly1305(key, nonce, aad).decrypt(ciphertext);
  } catch {
    return null;
  }
}

function checkManifest(raw: unknown, remaining: number): BackupManifest {
  const bad = (): never => {
    throw new BackupError('integrity', 'The backup manifest is malformed.');
  };
  if (!isPlainObject(raw)) return bad();
  if (!isInt(raw['formatVersion'], 1, Number.MAX_SAFE_INTEGER) || !isInt(raw['minReaderVersion'], 1, Number.MAX_SAFE_INTEGER)) return bad();
  if (raw['minReaderVersion'] > BACKUP_READER_VERSION) throw new BackupError('unsupported-version', 'This backup needs a newer DUDE version to read.');
  if (typeof raw['createdAt'] !== 'string' || typeof raw['hubVersion'] !== 'string' || typeof raw['forTransfer'] !== 'boolean') return bad();
  const source = raw['source'];
  if (!isPlainObject(source) || typeof source['hubInstanceId'] !== 'string') return bad();
  for (const field of ['authorityEpoch', 'schemaVersion', 'dbMinReaderVersion']) if (!isInt(source[field], 0, Number.MAX_SAFE_INTEGER)) return bad();
  const rawFiles = raw['files'];
  if (!Array.isArray(rawFiles)) return bad();
  const files: BackupManifestFile[] = [];
  let total = 0;
  for (const entry of rawFiles) {
    if (!isPlainObject(entry) || !validFileName(entry['name']) || !isInt(entry['size'], 0, MAX_BACKUP_PLAINTEXT_BYTES)) return bad();
    if (typeof entry['sha256'] !== 'string' || !/^[0-9a-f]{64}$/.test(entry['sha256'])) return bad();
    total += entry['size'];
    files.push({ name: entry['name'], size: entry['size'], sha256: entry['sha256'] });
  }
  try {
    checkFileList(files.map(file => file.name));
  } catch {
    return bad();
  }
  if (total !== remaining) throw new BackupError('integrity', 'The backup file sizes do not match its contents.');
  let counts: Record<string, number>;
  try {
    counts = checkCounts(raw['counts']);
  } catch {
    return bad();
  }
  return {
    formatVersion: raw['formatVersion'],
    minReaderVersion: raw['minReaderVersion'],
    createdAt: raw['createdAt'],
    hubVersion: raw['hubVersion'],
    source: {
      hubInstanceId: source['hubInstanceId'],
      authorityEpoch: source['authorityEpoch'] as number,
      schemaVersion: source['schemaVersion'] as number,
      dbMinReaderVersion: source['dbMinReaderVersion'] as number,
    },
    forTransfer: raw['forTransfer'],
    files,
    counts,
  };
}

export async function openBackup(bytes: Uint8Array, credential: BackupCredential, deps: BackupDeps): Promise<OpenedBackup> {
  // Everything that needs no key is validated first: a hostile or newer file never reaches the KDF.
  const { header, headerBytes, bodyOffset } = parseHeader(bytes);
  const frames = readFrames(bytes, bodyOffset, header.chunkSize);

  let key: Uint8Array;
  let ownedKey: Uint8Array | null = null;
  if ('derived' in credential) {
    checkDerived(credential.derived);
    key = credential.derived.key;
  } else {
    const passphraseBytes = normalizePassphrase(credential.passphrase);
    try {
      const salt = fromBase64Url(header.kdf.salt, SALT_BYTES) as Uint8Array;
      key = await derive(passphraseBytes, salt, { m: header.kdf.m, t: header.kdf.t, p: header.kdf.p, len: 32 }, deps);
      ownedKey = key;
    } finally {
      passphraseBytes.fill(0);
    }
  }

  try {
    const streamId = fromBase64Url(header.streamId, STREAM_ID_BYTES) as Uint8Array;
    const headerHash = sha256(headerBytes);
    let plaintextLength = 0;
    for (const frame of frames) plaintextLength += frame.length - TAG_BYTES;
    const plaintext = new Uint8Array(plaintextLength);
    let written = 0;
    for (let index = 0; index < frames.length; index++) {
      const isLast = index === frames.length - 1;
      const frame = frames[index];
      const ciphertext = bytes.subarray(frame.start, frame.start + frame.length);
      const nonce = chunkNonce(streamId, index);
      let opened = tryDecrypt(key, nonce, chunkAad(headerHash, isLast), ciphertext);
      if (opened === null) {
        // Distinguish a cut-off or extended stream (valid chunk with the opposite final flag) from a bad key or corruption.
        const alternative = tryDecrypt(key, nonce, chunkAad(headerHash, !isLast), ciphertext);
        alternative?.fill(0);
        if (alternative !== null) throw new BackupError(isLast ? 'truncated' : 'integrity', isLast ? 'The backup is truncated.' : 'The backup has data after its final chunk.');
        throw new BackupError(
          index === 0 ? 'wrong-passphrase-or-corrupt' : 'integrity',
          index === 0 ? 'Wrong passphrase, or the backup is corrupt.' : 'The backup failed its integrity check.',
        );
      }
      plaintext.set(opened, written);
      written += opened.length;
      opened.fill(0);
      opened = null;
    }
    return splitPlaintext(header, plaintext);
  } finally {
    ownedKey?.fill(0);
  }
}

function splitPlaintext(header: BackupHeader, plaintext: Uint8Array): OpenedBackup {
  if (plaintext.length < 4) throw new BackupError('integrity', 'The backup payload is malformed.');
  const manifestLength = new DataView(plaintext.buffer, plaintext.byteOffset, plaintext.byteLength).getUint32(0, false);
  if (manifestLength > MAX_MANIFEST_BYTES || 4 + manifestLength > plaintext.length) throw new BackupError('integrity', 'The backup payload is malformed.');
  let rawManifest: unknown;
  try {
    rawManifest = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(plaintext.subarray(4, 4 + manifestLength)));
  } catch {
    throw new BackupError('integrity', 'The backup manifest is malformed.');
  }
  const manifest = checkManifest(rawManifest, plaintext.length - 4 - manifestLength);
  const files = new Map<string, Uint8Array>();
  let offset = 4 + manifestLength;
  for (const entry of manifest.files) {
    const content = plaintext.slice(offset, offset + entry.size);
    offset += entry.size;
    if (sha256Hex(content) !== entry.sha256) throw new BackupError('integrity', 'A backup file failed its checksum.');
    files.set(entry.name, content);
  }
  plaintext.fill(0);
  return { header, manifest, files };
}

export function backupFileName(now: Date): string {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) throw new BackupError('bad-input', 'The backup timestamp is invalid.');
  const year = now.getUTCFullYear();
  if (year < 0 || year > 9999) throw new BackupError('bad-input', 'The backup timestamp is out of range.');
  const two = (value: number): string => String(value).padStart(2, '0');
  const stamp =
    String(year).padStart(4, '0') +
    two(now.getUTCMonth() + 1) +
    two(now.getUTCDate()) +
    'T' +
    two(now.getUTCHours()) +
    two(now.getUTCMinutes()) +
    two(now.getUTCSeconds()) +
    'Z';
  return `dude-hub-${stamp}.dudebackup`;
}

/** Matches only names `backupFileName` can produce. */
export const BACKUP_FILE_PATTERN = /^dude-hub-\d{4}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3])[0-5]\d[0-5]\dZ\.dudebackup$/;
