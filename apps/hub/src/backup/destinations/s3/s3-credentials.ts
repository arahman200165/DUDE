import type { HubPaths } from '../../../config/data-dir.js';
import { createSecretStore } from '../../../secrets/secret-store.js';
import type { SecretStore, SecretStoreOptions } from '../../../secrets/secret-store.js';
import type { SigV4Credentials } from './sigv4.js';

/**
 * S3 destination credentials (32-SS1, Milestone 848, PD-142/PD-153). The secret store's purposes are a closed, single-valued
 * list, so ONE purpose, `backup.s3.credentials`, holds a JSON map keyed by destination id:
 * `{ "v": 1, "credentials": { "<id>": { "accessKeyId": "...", "secretAccessKey": "...", "sessionToken": "..." } } }`.
 * (A suffix scheme such as `backup.s3.credentials.<id>` would have opened the closed purpose list and the per-purpose DPAPI
 * entropy to caller-chosen names.) The whole map is one protected blob: DPAPI LocalMachine on Windows, a mode-0600 file on
 * Linux and Docker, never in `hub.json`, a backup, a diagnostics report, the audit log or an error message; the secret store is
 * never part of a backup, so a restore onto another machine re-enters every S3 credential.
 *
 * Boundary: only the backup admin methods, the destination opener and the specs import this module; request handlers never do.
 * Values are never logged or returned; `has` reports presence only.
 */
export const S3_CREDENTIALS_PURPOSE = 'backup.s3.credentials' as const;

export interface S3CredentialStore {
  has(id: string): boolean;
  /** The credentials of one destination, or null; throws a value-free error when the stored map is unreadable. */
  get(id: string): SigV4Credentials | null;
  /** Adds or replaces one destination's credentials. */
  put(id: string, credentials: SigV4Credentials): void;
  /** True when an entry was removed; the purpose itself is deleted when the last entry goes. */
  delete(id: string): boolean;
}

const unreadable = (): Error => new Error('The stored S3 credentials are unreadable or corrupt; add the S3 destination again with its credentials.');

export function validateS3Credentials(value: unknown): SigV4Credentials | string {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return 'credentials must be an object';
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) if (key !== 'accessKeyId' && key !== 'secretAccessKey' && key !== 'sessionToken') return 'credentials has an unknown field';
  const { accessKeyId, secretAccessKey, sessionToken } = record;
  if (typeof accessKeyId !== 'string' || !/^[\x21-\x7e]{1,128}$/.test(accessKeyId)) return 'accessKeyId must be 1 to 128 printable characters without spaces';
  if (typeof secretAccessKey !== 'string' || !/^[\x21-\x7e]{1,256}$/.test(secretAccessKey)) return 'secretAccessKey must be 1 to 256 printable characters without spaces';
  if (sessionToken !== undefined && (typeof sessionToken !== 'string' || !/^[\x21-\x7e]{1,4096}$/.test(sessionToken))) return 'sessionToken must be 1 to 4096 printable characters without spaces';
  return { accessKeyId, secretAccessKey, ...(typeof sessionToken === 'string' ? { sessionToken } : {}) };
}

export function createS3CredentialStore(store: Pick<SecretStore, 'get' | 'put' | 'delete' | 'status'>): S3CredentialStore {
  const readMap = (): Record<string, SigV4Credentials> => {
    let raw: Buffer | null;
    try { raw = store.get(S3_CREDENTIALS_PURPOSE); } catch { throw unreadable(); }
    if (raw === null) return {};
    try {
      const parsed = JSON.parse(raw.toString('utf8')) as { v?: unknown; credentials?: unknown };
      if (parsed.v !== 1 || typeof parsed.credentials !== 'object' || parsed.credentials === null || Array.isArray(parsed.credentials)) throw unreadable();
      const out: Record<string, SigV4Credentials> = {};
      for (const [id, value] of Object.entries(parsed.credentials as Record<string, unknown>)) {
        const checked = validateS3Credentials(value);
        if (typeof checked === 'string') throw unreadable();
        out[id] = checked;
      }
      return out;
    } catch {
      throw unreadable();
    } finally {
      raw.fill(0);
    }
  };
  const writeMap = (map: Record<string, SigV4Credentials>): void => {
    if (Object.keys(map).length === 0) { store.delete(S3_CREDENTIALS_PURPOSE); return; }
    store.put(S3_CREDENTIALS_PURPOSE, JSON.stringify({ v: 1, credentials: map }));
  };
  return {
    has: (id) => store.status()[S3_CREDENTIALS_PURPOSE].present && Object.prototype.hasOwnProperty.call(readMap(), id),
    get: (id) => readMap()[id] ?? null,
    put(id, credentials) {
      const checked = validateS3Credentials(credentials);
      if (typeof checked === 'string') throw new Error(`Invalid S3 credentials: ${checked}.`);
      const map = readMap();
      map[id] = checked;
      writeMap(map);
    },
    delete(id) {
      const map = readMap();
      if (!Object.prototype.hasOwnProperty.call(map, id)) return false;
      delete map[id];
      writeMap(map);
      return true;
    },
  };
}

/** The production store under `<configDir>/secrets/` (DPAPI on Windows, the 0600 file fallback elsewhere). */
export function defaultS3CredentialStore(paths: Pick<HubPaths, 'secretsDir'>, options: Omit<SecretStoreOptions, 'secretsDir'> = {}): S3CredentialStore {
  return createS3CredentialStore(createSecretStore({ secretsDir: paths.secretsDir, ...options }));
}
