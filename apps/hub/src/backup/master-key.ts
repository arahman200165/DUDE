import type { HubPaths } from '../config/data-dir.js';
import { createSecretStore } from '../secrets/secret-store.js';
import type { SecretStore, SecretStoreOptions } from '../secrets/secret-store.js';

/**
 * The backup v2 master key held for unattended runs (32-SS1, Milestone 847, PD-150). Every destination repository the Hub writes
 * wraps the SAME random master key under the owner's passphrase (`createRepository(..., { masterKey })`); the Hub keeps the
 * unwrapped key in the machine-bound secret store (purpose `backup.masterKey`: DPAPI LocalMachine on Windows, a mode-0600 file
 * on Linux and Docker), so scheduled runs never need the passphrase and a passphrase change only re-wraps the `repo` objects.
 * The key never travels in a backup (the secret store is never backed up), so a restore onto another machine opens a repository
 * with the passphrase only. It replaces the 31G derived schedule key (`schedule-key.ts`, now only cleaned up).
 *
 * Boundary: only the backup admin methods, the scheduler wiring in `run` and the specs import this module; request handlers never
 * do (`secrets.spec.ts`). The key is never logged, audited, returned or put in an error message.
 */
export const BACKUP_MASTER_KEY_PURPOSE = 'backup.masterKey' as const;
const KEY_BYTES = 32;

export interface MasterKeyStore {
  exists(): boolean;
  /** A copy of the key (the caller zeroes it), or null when none is stored; throws a value-free error when it is unreadable. */
  load(): Uint8Array | null;
  save(key: Uint8Array): void;
  /** True when a key was stored. */
  clear(): boolean;
}

const unreadable = (): Error => new Error('The stored backup master key is unreadable or corrupt; add a backup destination again with the passphrase.');

export function createMasterKeyStore(store: Pick<SecretStore, 'get' | 'put' | 'delete' | 'status'>): MasterKeyStore {
  return {
    exists: () => store.status()[BACKUP_MASTER_KEY_PURPOSE].present,
    load() {
      let raw: Buffer | null;
      try {
        raw = store.get(BACKUP_MASTER_KEY_PURPOSE);
      } catch {
        throw unreadable();
      }
      if (raw === null) return null;
      let parsed: { v?: unknown; key?: unknown };
      try {
        parsed = JSON.parse(raw.toString('utf8')) as { v?: unknown; key?: unknown };
      } catch {
        throw unreadable();
      } finally {
        raw.fill(0);
      }
      if (parsed.v !== 1 || typeof parsed.key !== 'string') throw unreadable();
      const key = new Uint8Array(Buffer.from(parsed.key, 'base64url'));
      if (key.length !== KEY_BYTES) throw unreadable();
      return key;
    },
    save(key) {
      if (!(key instanceof Uint8Array) || key.length !== KEY_BYTES) throw new Error('The backup master key must be 32 bytes.');
      store.put(BACKUP_MASTER_KEY_PURPOSE, JSON.stringify({ v: 1, key: Buffer.from(key).toString('base64url') }));
    },
    clear: () => store.delete(BACKUP_MASTER_KEY_PURPOSE),
  };
}

/** The production store under `<configDir>/secrets/` (DPAPI on Windows, the 0600 file fallback elsewhere). */
export function defaultMasterKeyStore(paths: Pick<HubPaths, 'secretsDir'>, options: Omit<SecretStoreOptions, 'secretsDir'> = {}): MasterKeyStore {
  return createMasterKeyStore(createSecretStore({ secretsDir: paths.secretsDir, ...options }));
}
