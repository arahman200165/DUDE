import type { HubPaths } from '../../../config/data-dir.js';
import { createSecretStore } from '../../../secrets/secret-store.js';
import type { SecretStore, SecretStoreOptions } from '../../../secrets/secret-store.js';

/**
 * OneDrive destination credentials (32-SS1, Milestone 857, PD-142/PD-150). Same shape and rules as the S3 store: the secret store's
 * purposes are a closed, single-valued list, so ONE purpose, `backup.onedrive.refreshToken`, holds a JSON map keyed by destination id:
 * `{ "v": 1, "credentials": { "<id>": { "clientSecret": "...", "refreshToken": "..." } } }`. The whole map is one protected blob
 * (DPAPI LocalMachine on Windows, a mode-0600 file elsewhere), never in `hub.json`, a backup, a diagnostics report, the audit log or an
 * error message; the secret store is never part of a backup, so a restore onto another machine re-enters the consent (`needsReentry`).
 *
 * Boundary: only the backup admin methods, the destination opener and the specs import this module; request handlers never do. Values
 * are never logged or returned; `has` reports presence only.
 */
export const ONEDRIVE_CREDENTIALS_PURPOSE = 'backup.onedrive.refreshToken' as const;

export interface OneDriveCredentials {
  /** The owner's OAuth client secret (the client id is public and lives in `hub.json`). */
  clientSecret: string;
  refreshToken: string;
}

export interface OneDriveCredentialStore {
  has(id: string): boolean;
  /** The credentials of one destination, or null; throws a value-free error when the stored map is unreadable. */
  get(id: string): OneDriveCredentials | null;
  put(id: string, credentials: OneDriveCredentials): void;
  /** True when an entry was removed; the purpose itself is deleted when the last entry goes. */
  delete(id: string): boolean;
  /**
   * Replaces ONLY the refresh token of an existing entry (Microsoft rotates it on a refresh): one synchronous read-modify-write of the
   * protected map, so a concurrent reader sees the old or the new token and never a half. False (and nothing written) when the
   * destination has no entry, so a rotation that races a disconnect can never bring a deleted authorization back.
   */
  rotate(id: string, refreshToken: string): boolean;
}

const unreadable = (): Error => new Error('The stored OneDrive authorization is unreadable or corrupt; connect the OneDrive destination again.');

/** The OAuth client secret the owner pastes (Microsoft shows the secret VALUE once, about 40 characters; the bounds keep a pasted blob or an empty value out). */
export function validateOneDriveClientSecret(value: unknown): string | null {
  return typeof value === 'string' && /^[\x21-\x7e]{8,512}$/.test(value) ? value : null;
}

export function validateOneDriveCredentials(value: unknown): OneDriveCredentials | string {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return 'credentials must be an object';
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) if (key !== 'clientSecret' && key !== 'refreshToken') return 'credentials has an unknown field';
  const { clientSecret, refreshToken } = record;
  if (validateOneDriveClientSecret(clientSecret) === null) return 'clientSecret must be 8 to 512 printable characters without spaces';
  if (typeof refreshToken !== 'string' || !/^[\x21-\x7e]{1,4096}$/.test(refreshToken)) return 'refreshToken must be 1 to 4096 printable characters without spaces';
  return { clientSecret: clientSecret as string, refreshToken };
}

export function createOneDriveCredentialStore(store: Pick<SecretStore, 'get' | 'put' | 'delete' | 'status'>): OneDriveCredentialStore {
  const readMap = (): Record<string, OneDriveCredentials> => {
    let raw: Buffer | null;
    try { raw = store.get(ONEDRIVE_CREDENTIALS_PURPOSE); } catch { throw unreadable(); }
    if (raw === null) return {};
    try {
      const parsed = JSON.parse(raw.toString('utf8')) as { v?: unknown; credentials?: unknown };
      if (parsed.v !== 1 || typeof parsed.credentials !== 'object' || parsed.credentials === null || Array.isArray(parsed.credentials)) throw unreadable();
      const out: Record<string, OneDriveCredentials> = {};
      for (const [id, value] of Object.entries(parsed.credentials as Record<string, unknown>)) {
        const checked = validateOneDriveCredentials(value);
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
  const writeMap = (map: Record<string, OneDriveCredentials>): void => {
    if (Object.keys(map).length === 0) { store.delete(ONEDRIVE_CREDENTIALS_PURPOSE); return; }
    store.put(ONEDRIVE_CREDENTIALS_PURPOSE, JSON.stringify({ v: 1, credentials: map }));
  };
  return {
    has: (id) => store.status()[ONEDRIVE_CREDENTIALS_PURPOSE].present && Object.prototype.hasOwnProperty.call(readMap(), id),
    get: (id) => readMap()[id] ?? null,
    put(id, credentials) {
      const checked = validateOneDriveCredentials(credentials);
      if (typeof checked === 'string') throw new Error(`Invalid OneDrive credentials: ${checked}.`);
      const map = readMap();
      map[id] = checked;
      writeMap(map);
    },
    rotate(id, refreshToken) {
      const map = readMap();
      const current = map[id];
      if (current === undefined) return false;
      const checked = validateOneDriveCredentials({ clientSecret: current.clientSecret, refreshToken });
      if (typeof checked === 'string') throw new Error(`Invalid OneDrive credentials: ${checked}.`);
      map[id] = checked;
      writeMap(map);
      return true;
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
export function defaultOneDriveCredentialStore(paths: Pick<HubPaths, 'secretsDir'>, options: Omit<SecretStoreOptions, 'secretsDir'> = {}): OneDriveCredentialStore {
  return createOneDriveCredentialStore(createSecretStore({ secretsDir: paths.secretsDir, ...options }));
}
