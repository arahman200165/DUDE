import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { DerivedBackupKey } from '@dude/hub-backup';
import { createDpapiProtector, createFileProtector, defaultSyncExec } from '../tls/ca-key-protector.js';
import type { CaKeyProtector, SyncExec } from '../tls/ca-key-protector.js';

/**
 * The derived key behind scheduled backups (PD-074): never the passphrase. DPAPI entropy distinct from the CA's and the
 * ACME account key's, so one protected blob can never be replayed as another. Only the elevated schedule commands and the
 * scheduler may import this module; request handlers never do.
 */
export const BACKUP_SCHEDULE_DPAPI_ENTROPY = 'DUDE Hub Backup Schedule v1';
export const SCHEDULE_KEY_DIR = 'backup';
export const SCHEDULE_KEY_FILE = 'schedule-key.bin';

export function defaultScheduleKeyProtector(platform: NodeJS.Platform = process.platform, exec: SyncExec = defaultSyncExec): CaKeyProtector {
  return platform === 'win32'
    ? createDpapiProtector(exec, { entropy: BACKUP_SCHEDULE_DPAPI_ENTROPY, keyFile: SCHEDULE_KEY_FILE })
    : createFileProtector(SCHEDULE_KEY_FILE);
}

const scheduleKeyPath = (configDir: string): string => path.join(configDir, SCHEDULE_KEY_DIR, SCHEDULE_KEY_FILE);

interface Payload {
  v: 1;
  key: string;
  salt: string;
  params: { m: number; t: number; p: number; len: 32 };
}

const corrupt = (): Error => new Error('The stored backup schedule key is unreadable or corrupt; set the schedule again.');

export function scheduleKeyExists(configDir: string): boolean {
  return existsSync(scheduleKeyPath(configDir));
}

export function saveScheduleKey(configDir: string, derived: DerivedBackupKey, protector: CaKeyProtector): void {
  const file = scheduleKeyPath(configDir);
  const payload: Payload = {
    v: 1,
    key: Buffer.from(derived.key).toString('base64url'),
    salt: Buffer.from(derived.salt).toString('base64url'),
    params: { m: derived.params.m, t: derived.params.t, p: derived.params.p, len: 32 },
  };
  mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp`;
  writeFileSync(temp, protector.protect(Buffer.from(JSON.stringify(payload), 'utf8')), { mode: 0o600 });
  renameSync(temp, file);
}

/** Null when no schedule key is stored; throws a clear error when the file is present but cannot be read. */
export function loadScheduleKey(configDir: string, protector: CaKeyProtector): DerivedBackupKey | null {
  const file = scheduleKeyPath(configDir);
  if (!existsSync(file)) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(protector.unprotect(readFileSync(file)).toString('utf8'));
  } catch {
    throw corrupt();
  }
  const x = parsed as Partial<Payload> | null;
  const params = x?.params;
  if (
    typeof x !== 'object' || x === null || x.v !== 1 || typeof x.key !== 'string' || typeof x.salt !== 'string' ||
    typeof params !== 'object' || params === null || params.len !== 32 ||
    ![params.m, params.t, params.p].every((n) => typeof n === 'number' && Number.isInteger(n) && n > 0)
  ) {
    throw corrupt();
  }
  const key = new Uint8Array(Buffer.from(x.key, 'base64url'));
  const salt = new Uint8Array(Buffer.from(x.salt, 'base64url'));
  if (key.length !== 32 || salt.length !== 16) throw corrupt();
  return { key, salt, params: { m: params.m, t: params.t, p: params.p, len: 32 } };
}

export function clearScheduleKey(configDir: string): void {
  rmSync(scheduleKeyPath(configDir), { force: true });
}
