import type { HubPaths } from '../../../config/data-dir.js';
import { createSecretStore } from '../../../secrets/secret-store.js';
import type { SecretStore, SecretStoreOptions } from '../../../secrets/secret-store.js';

/**
 * Google Drive destination credentials (32-SS1, Milestone 856, PD-142/PD-154). Same shape and rules as the S3 store: the secret store's
 * purposes are a closed, single-valued list, so ONE purpose, `backup.drive.refreshToken`, holds a JSON map keyed by destination id:
 * `{ "v": 1, "credentials": { "<id>": { "clientSecret": "...", "refreshToken": "..." } } }`. The whole map is one protected blob
 * (DPAPI LocalMachine on Windows, a mode-0600 file elsewhere), never in `hub.json`, a backup, a diagnostics report, the audit log or an
 * error message; the secret store is never part of a backup, so a restore onto another machine re-enters the consent (`needsReentry`).
 *
 * Boundary: only the backup admin methods, the destination opener and the specs import this module; request handlers never do. Values
 * are never logged or returned; `has` reports presence only.
 */
export const DRIVE_CREDENTIALS_PURPOSE = 'backup.drive.refreshToken' as const;

export interface DriveCredentials {
  /** The owner's OAuth client secret (the client id is public and lives in `hub.json`). */
  clientSecret: string;
  refreshToken: string;
}

export interface DriveCredentialStore {
  has(id: string): boolean;
  /** The credentials of one destination, or null; throws a value-free error when the stored map is unreadable. */
  get(id: string): DriveCredentials | null;
  put(id: string, credentials: DriveCredentials): void;
  /** True when an entry was removed; the purpose itself is deleted when the last entry goes. */
  delete(id: string): boolean;
}

const unreadable = (): Error => new Error('The stored Google Drive authorization is unreadable or corrupt; connect the Drive destination again.');

/** The OAuth client secret the owner pastes (Google issues about 35 characters; the bounds keep a pasted blob or an empty value out). */
export function validateDriveClientSecret(value: unknown): string | null {
  return typeof value === 'string' && /^[\x21-\x7e]{8,512}$/.test(value) ? value : null;
}

export function validateDriveCredentials(value: unknown): DriveCredentials | string {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return 'credentials must be an object';
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) if (key !== 'clientSecret' && key !== 'refreshToken') return 'credentials has an unknown field';
  const { clientSecret, refreshToken } = record;
  if (validateDriveClientSecret(clientSecret) === null) return 'clientSecret must be 8 to 512 printable characters without spaces';
  if (typeof refreshToken !== 'string' || !/^[\x21-\x7e]{1,2048}$/.test(refreshToken)) return 'refreshToken must be 1 to 2048 printable characters without spaces';
  return { clientSecret: clientSecret as string, refreshToken };
}

export function createDriveCredentialStore(store: Pick<SecretStore, 'get' | 'put' | 'delete' | 'status'>): DriveCredentialStore {
  const readMap = (): Record<string, DriveCredentials> => {
    let raw: Buffer | null;
    try { raw = store.get(DRIVE_CREDENTIALS_PURPOSE); } catch { throw unreadable(); }
    if (raw === null) return {};
    try {
      const parsed = JSON.parse(raw.toString('utf8')) as { v?: unknown; credentials?: unknown };
      if (parsed.v !== 1 || typeof parsed.credentials !== 'object' || parsed.credentials === null || Array.isArray(parsed.credentials)) throw unreadable();
      const out: Record<string, DriveCredentials> = {};
      for (const [id, value] of Object.entries(parsed.credentials as Record<string, unknown>)) {
        const checked = validateDriveCredentials(value);
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
  const writeMap = (map: Record<string, DriveCredentials>): void => {
    if (Object.keys(map).length === 0) { store.delete(DRIVE_CREDENTIALS_PURPOSE); return; }
    store.put(DRIVE_CREDENTIALS_PURPOSE, JSON.stringify({ v: 1, credentials: map }));
  };
  return {
    has: (id) => store.status()[DRIVE_CREDENTIALS_PURPOSE].present && Object.prototype.hasOwnProperty.call(readMap(), id),
    get: (id) => readMap()[id] ?? null,
    put(id, credentials) {
      const checked = validateDriveCredentials(credentials);
      if (typeof checked === 'string') throw new Error(`Invalid Google Drive credentials: ${checked}.`);
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
export function defaultDriveCredentialStore(paths: Pick<HubPaths, 'secretsDir'>, options: Omit<SecretStoreOptions, 'secretsDir'> = {}): DriveCredentialStore {
  return createDriveCredentialStore(createSecretStore({ secretsDir: paths.secretsDir, ...options }));
}
