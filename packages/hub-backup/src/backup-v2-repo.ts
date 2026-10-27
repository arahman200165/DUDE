import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { BackupError } from './backup-error.js';
import {
  BACKUP_MAGIC,
  DEFAULT_KDF_PARAMS,
  KEY_BYTES,
  NONCE_BYTES,
  SALT_BYTES,
  TAG_BYTES,
  concatBytes,
  MAX_HEADER_BYTES,
  fromBase64Url,
  isPlainObject,
  kdfParamsInBounds,
  normalizePassphrase,
  toBase64Url,
  toHex,
  type KdfParams,
} from './backup-format.js';
import {
  BACKUP_V2_FORMAT_VERSION,
  BACKUP_V2_READER_VERSION,
  OBJECT_ID_BYTES,
  OBJECT_ID_PATTERN,
  REPO_OBJECT_NAME,
  SHA256_HEX_PATTERN,
  checkV2Versions,
  encoder,
  equalHex,
  hexToBytes,
  serializeRepoHeader,
  type RepoHeader,
} from './backup-v2-format.js';
import { ByteReader, deriveSubkey, readPrefix, type ObjectSource } from './backup-v2-stream.js';
import type { BackupDeps } from './backup.js';

/** The wrapped master key that follows the repository header JSON: a 24-byte nonce and the sealed 32-byte key. */
export const WRAPPED_KEY_BYTES = NONCE_BYTES + KEY_BYTES + TAG_BYTES;

/**
 * A passphrase (derives the key-encryption key through the injected Argon2id) or the unwrapped master key
 * itself (what an unattended schedule keeps under DPAPI, so it survives a passphrase change).
 */
export type BackupV2Credential = { passphrase: string } | { masterKey: Uint8Array };

export interface RepositoryKeys {
  content: Uint8Array;
  manifest: Uint8Array;
  dedupe: Uint8Array;
}

/** An opened repository: the key hierarchy under one random master key. Call `close()` to zero the keys. */
export interface BackupRepository {
  readonly repoId: string;
  readonly header: RepoHeader;
  /** The blob identity a destination or index may see: HMAC-SHA256(dedupe key, raw SHA-256), hex. */
  dedupeId(sha256Hex: string): string;
  /** A copy of the master key for a DPAPI-protected schedule; the caller zeroes it. */
  exportMasterKey(): Uint8Array;
  close(): void;
}

const keyStore = new WeakMap<BackupRepository, { master: Uint8Array; keys: RepositoryKeys }>();

/** Package-internal access to the subkeys; never exported from the package index. */
export function repositoryKeys(repository: BackupRepository): RepositoryKeys {
  const entry = keyStore.get(repository);
  if (!entry) throw new BackupError('bad-input', 'The backup repository is closed or invalid.');
  return entry.keys;
}

function random(deps: Pick<BackupDeps, 'randomBytes'>, length: number): Uint8Array {
  const out = deps.randomBytes(length);
  if (!(out instanceof Uint8Array) || out.length !== length) throw new BackupError('bad-input', 'The random source returned the wrong number of bytes.');
  return out.slice();
}

function keyCheckOf(master: Uint8Array, repoIdBytes: Uint8Array): string {
  const check = deriveSubkey(master, repoIdBytes, 'key-check');
  const hex = toHex(check);
  check.fill(0);
  return hex;
}

function wrapAad(headerBytes: Uint8Array): Uint8Array {
  return sha256(concatBytes([encoder.encode('dude-backup-v2 wrap\0'), headerBytes]));
}

function makeRepository(header: RepoHeader, master: Uint8Array): BackupRepository {
  const salt = hexToBytes(header.repoId);
  const keys: RepositoryKeys = {
    content: deriveSubkey(master, salt, 'content'),
    manifest: deriveSubkey(master, salt, 'manifest'),
    dedupe: deriveSubkey(master, salt, 'dedupe'),
  };
  const repository: BackupRepository = {
    repoId: header.repoId,
    header,
    dedupeId(sha256Hex: string): string {
      if (typeof sha256Hex !== 'string' || !SHA256_HEX_PATTERN.test(sha256Hex)) throw new BackupError('bad-input', 'A blob hash must be 64 lower-case hex characters.');
      return toHex(hmac(sha256, repositoryKeys(repository).dedupe, hexToBytes(sha256Hex)));
    },
    exportMasterKey(): Uint8Array {
      const entry = keyStore.get(repository);
      if (!entry) throw new BackupError('bad-input', 'The backup repository is closed.');
      return entry.master.slice();
    },
    close(): void {
      const entry = keyStore.get(repository);
      if (!entry) return;
      entry.master.fill(0);
      entry.keys.content.fill(0);
      entry.keys.manifest.fill(0);
      entry.keys.dedupe.fill(0);
      keyStore.delete(repository);
    },
  };
  keyStore.set(repository, { master, keys });
  return repository;
}

async function deriveKek(passphrase: string, salt: Uint8Array, params: KdfParams, deps: Pick<BackupDeps, 'deriveKey'>): Promise<Uint8Array> {
  const passphraseBytes = normalizePassphrase(passphrase);
  try {
    const key = await deps.deriveKey(passphraseBytes, salt, params);
    if (!(key instanceof Uint8Array) || key.length !== KEY_BYTES) throw new BackupError('bad-input', 'The key derivation returned an invalid key.');
    return key;
  } finally {
    passphraseBytes.fill(0);
  }
}

function checkParams(params: unknown): KdfParams {
  if (!isPlainObject(params) || !kdfParamsInBounds(params as KdfParams)) throw new BackupError('bad-input', 'The key derivation parameters are out of bounds.');
  const { m, t, p } = params as KdfParams;
  return { m, t, p, len: 32 };
}

/** Seals `master` under a fresh passphrase-derived key and returns the repository object bytes. */
async function sealRepositoryObject(
  repoId: string,
  master: Uint8Array,
  passphrase: string,
  params: KdfParams,
  deps: Pick<BackupDeps, 'deriveKey' | 'randomBytes'>,
): Promise<{ header: RepoHeader; object: Uint8Array }> {
  const salt = random(deps, SALT_BYTES);
  const header: RepoHeader = {
    formatVersion: BACKUP_V2_FORMAT_VERSION,
    minReaderVersion: BACKUP_V2_READER_VERSION,
    kind: 'repo',
    repoId,
    kdf: { name: 'argon2id', m: params.m, t: params.t, p: params.p, len: 32, salt: toBase64Url(salt) },
    cipher: 'xchacha20poly1305',
    keyCheck: keyCheckOf(master, hexToBytes(repoId)),
  };
  const { prefix, headerBytes } = serializeRepoHeader(header);
  const kek = await deriveKek(passphrase, salt, params, deps);
  try {
    const nonce = random(deps, NONCE_BYTES);
    const wrapped = xchacha20poly1305(kek, nonce, wrapAad(headerBytes)).encrypt(master);
    return { header, object: concatBytes([prefix, nonce, wrapped]) };
  } finally {
    kek.fill(0);
  }
}

/**
 * Creates a repository: a random repo id and a master key, wrapped under the passphrase. Write `object` as `repo`.
 * `options.masterKey` reuses an existing master key (the Hub keeps one key for all of its destinations, so a passphrase
 * change re-wraps every `repo` and an unattended schedule holds one key); the subkeys still differ per repository because
 * they are salted by the random repo id. Without it a fresh random key is drawn.
 */
export async function createRepository(
  passphrase: string,
  deps: Pick<BackupDeps, 'deriveKey' | 'randomBytes'>,
  kdfParams: KdfParams = DEFAULT_KDF_PARAMS,
  options: { masterKey?: Uint8Array } = {},
): Promise<{ repository: BackupRepository; object: Uint8Array }> {
  const params = checkParams(kdfParams);
  if (options.masterKey !== undefined && (!(options.masterKey instanceof Uint8Array) || options.masterKey.length !== KEY_BYTES)) {
    throw new BackupError('bad-input', 'The backup master key is invalid.');
  }
  const repoId = toHex(random(deps, OBJECT_ID_BYTES));
  const master = options.masterKey !== undefined ? options.masterKey.slice() : random(deps, KEY_BYTES);
  try {
    const { header, object } = await sealRepositoryObject(repoId, master, passphrase, params, deps);
    return { repository: makeRepository(header, master), object };
  } catch (error) {
    master.fill(0);
    throw error;
  }
}

interface ParsedRepoObject {
  header: RepoHeader;
  headerBytes: Uint8Array;
  wrapNonce: Uint8Array;
  wrapped: Uint8Array;
}

/** Parses the repository object without key material; versions are gated before anything else. */
export async function parseRepositoryObject(object: Uint8Array): Promise<ParsedRepoObject> {
  if (!(object instanceof Uint8Array)) throw new BackupError('bad-input', 'The repository header must be a Uint8Array.');
  const reader = new ByteReader([object]);
  const { raw, headerBytes, length } = await readPrefix(reader);
  checkV2Versions(raw, 'repo');
  const kdf = raw['kdf'];
  if (!isPlainObject(kdf)) throw new BackupError('bad-header', 'The backup header KDF is malformed.');
  if (kdf['name'] !== 'argon2id' || raw['cipher'] !== 'xchacha20poly1305') throw new BackupError('unsupported-version', 'The backup uses an unsupported key derivation or cipher.');
  if (!kdfParamsInBounds({ m: kdf['m'], t: kdf['t'], p: kdf['p'], len: kdf['len'] })) throw new BackupError('bad-header', 'The backup key derivation parameters are out of bounds.');
  if (fromBase64Url(kdf['salt'], SALT_BYTES) === null) throw new BackupError('bad-header', 'The backup salt is malformed.');
  const repoId = raw['repoId'];
  const keyCheck = raw['keyCheck'];
  if (typeof repoId !== 'string' || !OBJECT_ID_PATTERN.test(repoId) || typeof keyCheck !== 'string' || !/^[0-9a-f]{64}$/.test(keyCheck)) {
    throw new BackupError('bad-header', 'The backup repository header is malformed.');
  }
  if (object.length !== length + WRAPPED_KEY_BYTES) throw new BackupError(object.length < length + WRAPPED_KEY_BYTES ? 'truncated' : 'bad-header', 'The backup repository header has the wrong length.');
  const header: RepoHeader = {
    formatVersion: raw['formatVersion'] as number,
    minReaderVersion: raw['minReaderVersion'] as number,
    kind: 'repo',
    repoId,
    kdf: { name: 'argon2id', m: kdf['m'] as number, t: kdf['t'] as number, p: kdf['p'] as number, len: 32, salt: kdf['salt'] as string },
    cipher: 'xchacha20poly1305',
    keyCheck,
  };
  return { header, headerBytes, wrapNonce: object.subarray(length, length + NONCE_BYTES), wrapped: object.subarray(length + NONCE_BYTES) };
}

async function unwrapMaster(parsed: ParsedRepoObject, credential: BackupV2Credential, deps: Pick<BackupDeps, 'deriveKey'>): Promise<Uint8Array> {
  const repoIdBytes = hexToBytes(parsed.header.repoId);
  let master: Uint8Array;
  if (isPlainObject(credential) && 'masterKey' in credential) {
    if (!(credential.masterKey instanceof Uint8Array) || credential.masterKey.length !== KEY_BYTES) throw new BackupError('bad-input', 'The backup master key is invalid.');
    master = credential.masterKey.slice();
  } else if (isPlainObject(credential) && 'passphrase' in credential) {
    const { kdf } = parsed.header;
    const salt = fromBase64Url(kdf.salt, SALT_BYTES) as Uint8Array;
    const kek = await deriveKek(credential.passphrase, salt, { m: kdf.m, t: kdf.t, p: kdf.p, len: 32 }, deps);
    try {
      let opened: Uint8Array | null;
      try {
        opened = xchacha20poly1305(kek, parsed.wrapNonce, wrapAad(parsed.headerBytes)).decrypt(parsed.wrapped);
      } catch {
        opened = null;
      }
      // A wrong passphrase and any change to the header (versions, KDF cost, salt, repo id) look the same here.
      if (opened === null) throw new BackupError('wrong-passphrase-or-corrupt', 'Wrong passphrase, or the backup is corrupt.');
      master = opened;
    } finally {
      kek.fill(0);
    }
  } else {
    throw new BackupError('bad-input', 'The backup credential is invalid.');
  }
  if (!equalHex(keyCheckOf(master, repoIdBytes), parsed.header.keyCheck)) {
    master.fill(0);
    throw new BackupError('wrong-passphrase-or-corrupt', 'Wrong passphrase, or the backup is corrupt.');
  }
  return master;
}

export async function openRepository(object: Uint8Array, credential: BackupV2Credential, deps: Pick<BackupDeps, 'deriveKey'>): Promise<BackupRepository> {
  const parsed = await parseRepositoryObject(object);
  const master = await unwrapMaster(parsed, credential, deps);
  return makeRepository(parsed.header, master);
}

/**
 * Changes the passphrase by re-wrapping the same master key under a new salt (and optionally new KDF cost).
 * No pack or manifest changes; the returned bytes replace the `repo` object, after which the old passphrase no
 * longer opens the repository and the new one opens every backup in it.
 */
export async function rewrapRepository(
  object: Uint8Array,
  credential: BackupV2Credential,
  newPassphrase: string,
  deps: Pick<BackupDeps, 'deriveKey' | 'randomBytes'>,
  kdfParams?: KdfParams,
): Promise<Uint8Array> {
  const parsed = await parseRepositoryObject(object);
  const params = checkParams(kdfParams ?? { m: parsed.header.kdf.m, t: parsed.header.kdf.t, p: parsed.header.kdf.p, len: 32 });
  const master = await unwrapMaster(parsed, credential, deps);
  try {
    return (await sealRepositoryObject(parsed.header.repoId, master, newPassphrase, params, deps)).object;
  } finally {
    master.fill(0);
  }
}

/** Reads the small `repo` object from a source (bounded: header plus the wrapped key). */
export async function readRepositoryObject(source: ObjectSource): Promise<Uint8Array> {
  const reader = new ByteReader(source.read(REPO_OBJECT_NAME));
  try {
    const object = await reader.readAll(BACKUP_MAGIC.length + 4 + MAX_HEADER_BYTES + WRAPPED_KEY_BYTES);
    if (object === null) throw new BackupError('bad-header', 'The backup repository header is too large.');
    return object;
  } finally {
    await reader.close();
  }
}
